import { env, requireEnv } from '@/lib/env';

/**
 * Disparo dos jobs pesados no GitHub Actions.
 *
 * O painel (que roda em qualquer lugar barato) so escreve no banco e chama
 * aqui. Quem tem ffmpeg, CPU e minutos de sobra e o runner do GitHub — e ele
 * pode rodar 15 minutos sem ninguem reclamar de timeout.
 */

export type DispatchEvent = 'render-video' | 'publish-video' | 'scan-trends' | 'generate-ideas';

export async function dispatch(
  event: DispatchEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  requireEnv('githubToken', 'githubRepo');

  const res = await fetch(`https://api.github.com/repos/${env.githubRepo}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.githubToken}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ event_type: event, client_payload: payload }),
    signal: AbortSignal.timeout(20_000),
  });

  // repository_dispatch responde 204 sem corpo quando da certo.
  if (res.status !== 204) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Nao consegui disparar o job "${event}" no GitHub (HTTP ${res.status}). ` +
        `Confira GITHUB_TOKEN (precisa do escopo "repo") e GITHUB_REPO. ${detail.slice(0, 200)}`,
    );
  }
}

/** Se o disparo remoto nao estiver configurado, o job pode rodar localmente. */
export function canDispatch(): boolean {
  return Boolean(env.githubToken && env.githubRepo);
}
