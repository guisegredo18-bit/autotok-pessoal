import { env, requireEnv } from '@/lib/env';

/**
 * Operacoes no repositorio do GitHub, feitas pelo painel.
 *
 * Existe para eliminar a etapa mais penosa da instalacao: cadastrar secrets
 * pelo Safari do iPhone. O token que voce ja configurou para disparar os jobs
 * tem escopo `repo` — que e o mesmo necessario para criar os secrets. Entao o
 * painel faz isso por voce, em vez de descrever um formulario dificil de usar.
 */

async function api(path: string, init?: RequestInit): Promise<Response> {
  requireEnv('githubToken', 'githubRepo');
  return fetch(`https://api.github.com/repos/${env.githubRepo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.githubToken}`,
      'x-github-api-version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
}

function explainStatus(status: number): string {
  if (status === 401) return 'o token do GitHub e invalido ou expirou';
  if (status === 403) {
    return 'o token nao tem permissao — ele precisa do escopo "repo" (marque a caixa inteira)';
  }
  if (status === 404) {
    return 'repositorio nao encontrado, ou o token nao enxerga ele. Confira o campo Repositorio';
  }
  return `o GitHub respondeu ${status}`;
}

/** Nomes dos secrets ja cadastrados (a API nunca devolve os valores). */
export async function listSecretNames(): Promise<string[]> {
  const res = await api('/actions/secrets');
  if (!res.ok) throw new Error(explainStatus(res.status));

  const json: any = await res.json();
  return (json?.secrets ?? []).map((s: any) => String(s?.name ?? '')).filter(Boolean);
}

/**
 * Grava um secret no repositorio.
 *
 * O GitHub nao aceita o valor em texto: e preciso cifra-lo com a chave publica
 * do repositorio usando "sealed box" (libsodium). Assim o valor viaja cifrado
 * e so o proprio GitHub consegue abrir.
 */
export async function putSecret(name: string, value: string): Promise<void> {
  const keyRes = await api('/actions/secrets/public-key');
  if (!keyRes.ok) throw new Error(explainStatus(keyRes.status));

  const { key, key_id } = (await keyRes.json()) as { key: string; key_id: string };

  const sodium = (await import('libsodium-wrappers')).default;
  await sodium.ready;

  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
  );

  const res = await api(`/actions/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
      key_id,
    }),
  });

  // 201 = criado, 204 = atualizado.
  if (res.status !== 201 && res.status !== 204) {
    throw new Error(`nao consegui salvar o secret ${name}: ${explainStatus(res.status)}`);
  }
}

export type WorkflowRun = {
  name: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
};

/**
 * Um job parado em "queued" nao esta rodando devagar: e um job para o qual o
 * GitHub nunca entregou uma maquina. Depois de alguns minutos, isso quase
 * sempre significa franquia de minutos esgotada — e e uma informacao que so
 * aparece na pagina de faturamento, longe de quem usa o app pelo celular.
 */
const STUCK_AFTER_MS = 5 * 60_000;

export type QueueHealth = {
  waiting: number;
  /** Ha quantos minutos o mais antigo espera. */
  oldestMinutes: number;
  stuck: boolean;
};

export function queueHealth(runs: WorkflowRun[]): QueueHealth {
  const waiting = runs.filter((r) => r.status === 'queued' || r.status === 'pending');
  if (waiting.length === 0) return { waiting: 0, oldestMinutes: 0, stuck: false };

  const oldest = Math.min(...waiting.map((r) => new Date(r.createdAt).getTime()));
  const ageMs = Date.now() - oldest;

  return {
    waiting: waiting.length,
    oldestMinutes: Math.floor(ageMs / 60_000),
    stuck: ageMs > STUCK_AFTER_MS,
  };
}

/**
 * Cancela as execucoes que ainda esperam maquina.
 *
 * Cada tentativa e independente: uma que falhe (o GitHub responde 502 com
 * alguma frequencia, e um run que acabou de terminar recusa cancelamento) nao
 * pode impedir o cancelamento das outras.
 */
export async function cancelPendingRuns(): Promise<{ cancelled: number; failed: number }> {
  const runs = await listRecentRunsWithIds(30);
  const pending = runs.filter((r) => r.status === 'queued' || r.status === 'pending');

  let cancelled = 0;
  let failed = 0;

  for (const run of pending) {
    try {
      const res = await api(`/actions/runs/${run.id}/cancel`, { method: 'POST' });
      if (res.ok || res.status === 202) cancelled++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { cancelled, failed };
}

async function listRecentRunsWithIds(limit: number): Promise<{ id: number; status: string }[]> {
  const res = await api(`/actions/runs?per_page=${limit}`);
  if (!res.ok) throw new Error(explainStatus(res.status));

  const json: any = await res.json();
  return (json?.workflow_runs ?? []).map((r: any) => ({
    id: Number(r?.id),
    status: String(r?.status ?? ''),
  }));
}

/** Ultimas execucoes, para diagnosticar sem sair do painel. */
export async function listRecentRuns(limit = 5): Promise<WorkflowRun[]> {
  const res = await api(`/actions/runs?per_page=${limit}`);
  if (!res.ok) throw new Error(explainStatus(res.status));

  const json: any = await res.json();
  return (json?.workflow_runs ?? []).map((r: any) => ({
    name: String(r?.name ?? 'workflow'),
    status: String(r?.status ?? ''),
    conclusion: r?.conclusion ?? null,
    createdAt: String(r?.created_at ?? ''),
    url: String(r?.html_url ?? ''),
  }));
}
