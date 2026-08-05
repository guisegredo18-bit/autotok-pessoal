import { env, requireEnv } from '@/lib/env';

/**
 * Cliente da API oficial do TikTok (TikTok for Developers, API v2).
 *
 * Duas coisas que voce precisa saber antes de depender disso:
 *
 * 1. A Content Posting API e oficial e funciona, mas enquanto o seu app nao
 *    passar pela auditoria do TikTok, TODO video publicado por ela fica
 *    restrito a visualizacao privada (SELF_ONLY). O video chega na sua conta;
 *    voce so precisa abrir o app e mudar a privacidade. Depois da auditoria,
 *    `PUBLIC_TO_EVERYONE` fica disponivel e o post e realmente automatico.
 *
 * 2. A API de tendencias (Research API) e liberada apenas para pesquisadores
 *    academicos. Por isso as tendencias vem do Creative Center, e nao daqui.
 */

const OAUTH = 'https://open.tiktokapis.com/v2/oauth';
const API = 'https://open.tiktokapis.com/v2';

export const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

export class TikTokError extends Error {
  constructor(message: string, readonly code?: string, readonly logId?: string) {
    super(message);
    this.name = 'TikTokError';
  }
}

/** URL para onde o usuario e mandado para autorizar o app. */
export function authorizeUrl(state: string): string {
  requireEnv('tiktokClientKey', 'tiktokRedirectUri');
  const params = new URLSearchParams({
    client_key: env.tiktokClientKey,
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: env.tiktokRedirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
};

/** Troca o `code` do callback pelos tokens de acesso. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  requireEnv('tiktokClientKey', 'tiktokClientSecret', 'tiktokRedirectUri');
  return tokenRequest({
    client_key: env.tiktokClientKey,
    client_secret: env.tiktokClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.tiktokRedirectUri,
  });
}

export async function refreshToken(refresh: string): Promise<TokenResponse> {
  requireEnv('tiktokClientKey', 'tiktokClientSecret');
  return tokenRequest({
    client_key: env.tiktokClientKey,
    client_secret: env.tiktokClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refresh,
  });
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH}/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30_000),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new TikTokError(
      `OAuth falhou: ${json?.error_description ?? json?.error ?? res.status}`,
      json?.error,
      json?.log_id,
    );
  }
  return json as TokenResponse;
}

async function apiGet(pathname: string, accessToken: string): Promise<any> {
  const res = await fetch(`${API}${pathname}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  return unwrap(res);
}

async function apiPost(pathname: string, accessToken: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return unwrap(res);
}

/**
 * A API v2 sempre devolve HTTP 200 com um envelope { data, error }; o erro real
 * esta em error.code !== 'ok'. Checar so o status HTTP daria falso sucesso.
 */
async function unwrap(res: Response): Promise<any> {
  const json: any = await res.json().catch(() => ({}));
  const error = json?.error;
  if (error && error.code && error.code !== 'ok') {
    throw new TikTokError(
      `${error.code}: ${error.message ?? 'erro sem descricao'}`,
      error.code,
      error.log_id,
    );
  }
  if (!res.ok) {
    throw new TikTokError(`TikTok respondeu HTTP ${res.status}`);
  }
  return json?.data ?? json;
}

export type UserInfo = { open_id: string; display_name?: string; avatar_url?: string };

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const data = await apiGet(
    '/user/info/?fields=open_id,display_name,avatar_url',
    accessToken,
  );
  return data?.user ?? {};
}

export type CreatorInfo = {
  creator_username?: string;
  creator_nickname?: string;
  creator_avatar_url?: string;
  /** Ex.: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] */
  privacy_level_options: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

/**
 * Consulta obrigatoria antes de publicar: o TikTok exige que o app so ofereca
 * as opcoes de privacidade que a conta realmente permite. Tambem serve para
 * descobrir se o app ja passou na auditoria (se `PUBLIC_TO_EVERYONE` aparece).
 */
export async function getCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const data = await apiPost('/post/publish/creator_info/query/', accessToken, {});
  return {
    privacy_level_options: [],
    ...data,
  };
}

export type InitUploadResult = { publish_id: string; upload_url: string };

export type PostInfo = {
  title: string;
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
};

/** Passo 1 da publicacao: reserva o post e recebe a URL de upload. */
export async function initDirectPost(
  accessToken: string,
  post: PostInfo,
  videoSize: number,
): Promise<InitUploadResult> {
  const data = await apiPost('/post/publish/video/init/', accessToken, {
    post_info: {
      title: post.title,
      privacy_level: post.privacyLevel,
      disable_comment: post.disableComment ?? false,
      disable_duet: post.disableDuet ?? false,
      disable_stitch: post.disableStitch ?? false,
      video_cover_timestamp_ms: post.coverTimestampMs ?? 1000,
    },
    source_info: {
      // FILE_UPLOAD envia os bytes direto. A alternativa (PULL_FROM_URL) exige
      // um dominio verificado no portal do TikTok — uma etapa a menos assim.
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  });

  if (!data?.publish_id || !data?.upload_url) {
    throw new TikTokError('O TikTok nao devolveu publish_id/upload_url.');
  }
  return { publish_id: data.publish_id, upload_url: data.upload_url };
}

/**
 * Passo 2: sobe os bytes do video.
 *
 * Enviamos em um unico chunk. O limite para chunk unico e 64MB, e um video
 * vertical de 30s renderizado aqui fica na casa dos 5-15MB — entao vale a pena
 * evitar toda a complexidade de upload particionado.
 */
export async function uploadVideo(uploadUrl: string, video: Buffer): Promise<void> {
  const size = video.length;
  if (size > 64 * 1024 * 1024) {
    throw new TikTokError(
      `Video de ${(size / 1024 / 1024).toFixed(1)}MB excede o limite de 64MB para upload em uma parte.`,
    );
  }

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(size),
      'content-range': `bytes 0-${size - 1}/${size}`,
    },
    body: new Uint8Array(video),
    signal: AbortSignal.timeout(10 * 60_000),
  });

  if (!res.ok) {
    throw new TikTokError(
      `Upload do video falhou (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
}

export type PublishStatus = {
  status: string; // PROCESSING_UPLOAD | PUBLISH_COMPLETE | FAILED | ...
  fail_reason?: string;
  publicaly_available_post_id?: string[];
  uploaded_bytes?: number;
};

export async function fetchStatus(
  accessToken: string,
  publishId: string,
): Promise<PublishStatus> {
  return apiPost('/post/publish/status/fetch/', accessToken, { publish_id: publishId });
}

/** Espera o TikTok terminar de processar o video enviado. */
export async function waitForPublish(
  accessToken: string,
  publishId: string,
  options?: { timeoutMs?: number; onTick?: (status: string) => void },
): Promise<PublishStatus> {
  const timeout = options?.timeoutMs ?? 5 * 60_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await fetchStatus(accessToken, publishId);
    options?.onTick?.(status.status);

    if (status.status === 'PUBLISH_COMPLETE') return status;
    if (status.status === 'FAILED') {
      throw new TikTokError(`Publicacao falhou: ${status.fail_reason ?? 'motivo nao informado'}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new TikTokError(
    'Tempo esgotado esperando o TikTok processar o video. Confira o app — ele pode ter chegado como rascunho.',
  );
}
