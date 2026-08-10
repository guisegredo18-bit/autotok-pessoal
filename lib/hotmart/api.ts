import { env, requireEnv } from '@/lib/env';
import { readPage } from './normalize';

/**
 * Cliente da Hotmart Developers API.
 *
 * A autenticacao e OAuth2 `client_credentials`: nao existe tela de "autorizar
 * o app", porque as credenciais sao suas e representam a sua propria conta.
 * Voce as pega em developers.hotmart.com > Credenciais.
 *
 * O que da para ler com elas:
 *  - vendas e comissoes (`/payments/api/v1/sales/...`), que e a fonte do
 *    dinheiro de verdade no painel;
 *  - seus produtos (`/products/api/v1/products`).
 *
 * O que NAO da: o marketplace de produtos afiliaveis com temperatura e
 * ranking, que a Hotmart nao expoe em API publica. O painel trata isso como
 * uma limitacao declarada em vez de fingir que tem o dado — veja o aviso na
 * tela de importacao.
 */

export class HotmartError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HotmartError';
  }
}

/**
 * O Basic e o base64 de `client_id:client_secret`.
 *
 * A Hotmart mostra esse valor pronto no painel, e aceitar o campo colado evita
 * erro de digitacao; quando ele nao vem, calcular e trivial e poupa mais uma
 * credencial para configurar no celular.
 */
export function basicToken(): string {
  if (env.hotmartBasic) return env.hotmartBasic.replace(/^Basic\s+/i, '');
  return Buffer.from(`${env.hotmartClientId}:${env.hotmartClientSecret}`).toString('base64');
}

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

/** Descarta o token guardado — usado quando as credenciais mudam. */
export function forgetToken(): void {
  cachedToken = null;
}

/**
 * Token de acesso, reaproveitado ate perto de expirar.
 *
 * A Hotmart entrega tokens de validade longa (dias) e limita a frequencia de
 * emissao; pedir um novo a cada chamada e o caminho mais curto para tomar 429
 * no meio de uma importacao.
 */
export async function getToken(force = false): Promise<string> {
  requireEnv('hotmartClientId', 'hotmartClientSecret');

  // A margem de um minuto evita usar um token que expira durante a chamada.
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.hotmartClientId,
    client_secret: env.hotmartClientSecret,
  });

  const res = await fetch(`${env.hotmartAuthUrl}/security/oauth/token?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicToken()}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new HotmartError(
      explain(res.status, body.error_description ?? body.error),
      res.status,
    );
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** Erros de credencial em portugues acionavel — a tela e o unico log que voce ve. */
function explain(status: number, detail?: string): string {
  if (status === 401 || status === 403) {
    return (
      'A Hotmart recusou as credenciais. Confira o Client ID e o Client Secret em ' +
      'developers.hotmart.com > Credenciais e cole-os de novo em Configuracoes.'
    );
  }
  if (status === 429) {
    return 'A Hotmart limitou as chamadas por excesso de tentativas. Tente de novo em alguns minutos.';
  }
  return `A Hotmart respondeu ${status}${detail ? `: ${detail}` : ''}.`;
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await getToken();
  const query = new URLSearchParams(params);
  const res = await fetch(`${env.hotmartApiUrl}${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(45_000),
  });

  if (res.status === 401) {
    // Token vencido antes da hora prevista: uma segunda tentativa com token
    // novo resolve, e e melhor do que devolver "nao autorizado" para quem
    // acabou de configurar tudo certo.
    forgetToken();
    const retry = await fetch(`${env.hotmartApiUrl}${path}?${query}`, {
      headers: { Authorization: `Bearer ${await getToken(true)}`, accept: 'application/json' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!retry.ok) throw new HotmartError(explain(retry.status), retry.status);
    return retry.json();
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HotmartError(explain(res.status, detail.slice(0, 200)), res.status);
  }
  return res.json();
}

/**
 * Percorre todas as paginas de um endpoint paginado.
 *
 * O limite de paginas existe para que um `next_page_token` que nunca muda
 * (ja aconteceu) nao vire um laco infinito segurando a requisicao do painel
 * ate o timeout da hospedagem.
 */
async function* paginate(
  path: string,
  params: Record<string, string>,
  maxPages = 20,
): AsyncGenerator<unknown> {
  let token: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const payload: unknown = await get(path, {
      ...params,
      max_results: '50',
      ...(token ? { page_token: token } : {}),
    });

    const { items, nextPageToken } = readPage(payload);
    for (const item of items) yield item;

    if (!nextPageToken || nextPageToken === token || items.length === 0) return;
    token = nextPageToken;
  }
}

/** Vendas com o detalhamento de comissao, no periodo pedido. */
export async function* salesCommissions(start: Date, end: Date): AsyncGenerator<unknown> {
  yield* paginate('/payments/api/v1/sales/commissions', {
    start_date: String(start.getTime()),
    end_date: String(end.getTime()),
  });
}

/** Historico de vendas — usado como reserva quando o de comissoes vem vazio. */
export async function* salesHistory(start: Date, end: Date): AsyncGenerator<unknown> {
  yield* paginate('/payments/api/v1/sales/history', {
    start_date: String(start.getTime()),
    end_date: String(end.getTime()),
  });
}

/** Seus produtos na Hotmart. */
export async function* products(): AsyncGenerator<unknown> {
  yield* paginate('/products/api/v1/products', {});
}

/** Confere as credenciais sem importar nada — o botao "Testar conexao". */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await getToken(true);
    return { ok: true, message: 'Hotmart conectada. As credenciais funcionam.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
