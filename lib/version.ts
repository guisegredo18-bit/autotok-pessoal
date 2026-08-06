import { env } from '@/lib/env';

/**
 * Qual versao esta no ar.
 *
 * Existe por uma confusao real: depois de uma correcao, o painel continuou
 * mostrando o erro antigo porque o deploy nao tinha sido refeito — e nao havia
 * como perceber isso pela tela. Sem esta informacao, "ja corrigi" e "ainda
 * esta quebrado" viram uma discussao sem arbitro.
 */

export type Version = {
  /** Commit em execucao, curto. Vazio quando roda fora da Vercel. */
  commit: string;
  branch: string;
  /** Commit mais recente do repositorio, quando da para consultar. */
  latest?: string;
  /** true quando ha versao mais nova esperando deploy. */
  outdated: boolean;
  /** Motivo de nao ter dado para comparar. */
  note?: string;
};

export function runningCommit(): string {
  return (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
}

export function runningBranch(): string {
  return process.env.VERCEL_GIT_COMMIT_REF ?? '';
}

/**
 * Compara o que esta rodando com o topo do branch no GitHub.
 *
 * Usa o mesmo token ja configurado para disparar os jobs. Se nao houver token
 * (ou a chamada falhar), devolvemos apenas a versao local — saber a comparacao
 * e util, mas nao a ponto de deixar a tela de configuracoes quebrar por isso.
 */
export async function checkVersion(): Promise<Version> {
  const commit = runningCommit();
  const branch = runningBranch();

  if (!commit) {
    return { commit, branch, outdated: false, note: 'rodando fora da Vercel' };
  }
  if (!env.githubToken || !env.githubRepo) {
    return { commit, branch, outdated: false, note: 'sem token do GitHub para comparar' };
  }

  try {
    const ref = branch || 'HEAD';
    const res = await fetch(
      `https://api.github.com/repos/${env.githubRepo}/commits/${encodeURIComponent(ref)}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${env.githubToken}`,
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      return { commit, branch, outdated: false, note: `GitHub respondeu ${res.status}` };
    }

    const json: any = await res.json();
    const latest = String(json?.sha ?? '').slice(0, 7);
    if (!latest) return { commit, branch, outdated: false, note: 'resposta sem commit' };

    return { commit, branch, latest, outdated: latest !== commit };
  } catch (err) {
    return {
      commit,
      branch,
      outdated: false,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}
