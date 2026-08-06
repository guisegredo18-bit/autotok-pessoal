import { env } from '@/lib/env';
import { runningBranch } from '@/lib/version';

/**
 * Link que abre o caderno de renderizacao no Colab.
 *
 * Existe porque o GitHub Actions pode parar de entregar maquina — e ai o
 * unico jeito gratuito de renderizar, sem cartao e sem computador, e pedir uma
 * emprestada ao Google por alguns minutos. O caderno vive no proprio
 * repositorio, entao o Colab o abre direto do GitHub, sem download.
 *
 * Derivado em vez de fixo para nao apontar para o repositorio errado de quem
 * clonar este projeto.
 */
export const COLAB_NOTEBOOK = 'deploy/colab/renderizar.ipynb';

export function colabUrl(
  repo: string = env.githubRepo,
  branch: string = runningBranch(),
): string | null {
  if (!repo) return null;
  const ref = branch || 'HEAD';
  return `https://colab.research.google.com/github/${repo}/blob/${ref}/${COLAB_NOTEBOOK}`;
}
