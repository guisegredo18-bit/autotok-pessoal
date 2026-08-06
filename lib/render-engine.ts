/**
 * Onde os videos sao renderizados.
 *
 * Fica num modulo proprio, sem tocar no banco, para que o formulario (que roda
 * no navegador) possa montar as opcoes a partir daqui sem arrastar o driver do
 * Postgres para dentro do bundle.
 *
 * A lista e a unica fonte da verdade: o tipo sai dela, o `<select>` sai dela e
 * a validacao do formulario sai dela. Antes disso a leitura do formulario era
 * um ternario — `=== 'aqui' ? 'aqui' : 'github'` — e uma opcao nova nasceu sem
 * ninguem lembrar de acrescenta-la ali. O resultado foi silencioso e cruel:
 * escolher "Colab", salvar, e a tela voltar para "GitHub Actions" sem erro
 * nenhum, como se a escolha nao valesse.
 */
export const RENDER_ENGINES = {
  github: 'GitHub Actions',
  aqui: 'Aqui mesmo (este servidor)',
  manual: 'No Colab, quando eu mandar',
} as const;

export type RenderEngine = keyof typeof RENDER_ENGINES;

export const DEFAULT_RENDER_ENGINE: RenderEngine = 'github';

/** Le o valor do formulario aceitando so o que existe de fato. */
export function parseRenderEngine(value: unknown): RenderEngine {
  const key = String(value ?? '');
  return key in RENDER_ENGINES ? (key as RenderEngine) : DEFAULT_RENDER_ENGINE;
}
