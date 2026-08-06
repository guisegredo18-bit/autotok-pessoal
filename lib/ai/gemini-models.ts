/**
 * Descoberta do modelo do Gemini.
 *
 * O Google aposenta modelos: `gemini-2.5-flash` deixou de aceitar contas novas
 * e a aplicacao parou com um 404. Fixar outro nome no codigo so adia o mesmo
 * problema — na proxima aposentadoria, quebra de novo, e quem instalou pelo
 * celular nao tem como saber que o conserto e trocar uma string.
 *
 * Entao, quando o modelo configurado nao existe, perguntamos ao proprio Google
 * quais existem e escolhemos o melhor disponivel.
 */

export type GeminiModel = { name: string; displayName?: string };

/** O 404 do Gemini para modelo aposentado ou inexistente. */
export function isModelNotFound(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not_found') ||
    lower.includes('no longer available') ||
    (lower.includes('404') && lower.includes('model'))
  );
}

/**
 * Ordena os modelos do melhor para o pior, para uso nesta aplicacao.
 *
 * Criterios, nesta ordem: versao mais nova primeiro; `flash` normal antes de
 * `flash-lite` (o lite escreve roteiro pior); e versoes estaveis antes de
 * `preview`/`exp`, que somem sem aviso — trocar uma quebra por outra nao
 * ajudaria ninguem.
 */
export function rankModels(names: string[]): string[] {
  const scored = names
    .map((name) => {
      const short = name.replace(/^models\//, '');
      if (!short.includes('flash')) return null;

      const version = Number(short.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
      const isLite = short.includes('lite');
      const isUnstable = /preview|exp|thinking/.test(short);
      // `latest` e um apelido que o Google mantem apontando para a versao
      // estavel atual — e a escolha mais durável quando existe.
      const isAlias = short.includes('latest');

      return {
        short,
        rank: [
          isUnstable ? 0 : 1,
          isLite ? 0 : 1,
          isAlias ? 1 : 0,
          version,
        ] as const,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  scored.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) {
      if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i];
    }
    return a.short.localeCompare(b.short);
  });

  return scored.map((m) => m.short);
}

/** Extrai os modelos que sabem gerar conteudo a partir da resposta do Google. */
export function usableModels(json: any): string[] {
  const models: any[] = json?.models ?? [];
  return models
    .filter((m) => {
      const methods: string[] = m?.supportedGenerationMethods ?? m?.supportedActions ?? [];
      // Quando a lista de metodos nao vem, nao da para descartar com certeza —
      // preferimos tentar a descartar um modelo que funcionaria.
      return methods.length === 0 || methods.includes('generateContent');
    })
    .map((m) => String(m?.name ?? ''))
    .filter(Boolean);
}
