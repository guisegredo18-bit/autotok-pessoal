import type { z } from 'zod';

/**
 * Extracao e validacao do JSON devolvido pelo modelo.
 *
 * Provedores gratuitos nao garantem JSON perfeito como os modos estruturados
 * pagos: vem cercado de crase, com um "Claro, aqui esta:" na frente, ou com uma
 * virgula sobrando. Em vez de exigir um provedor caro, tratamos isso aqui — e
 * como e logica pura, da para testar sem gastar uma unica chamada de API.
 */

/** Acha o primeiro objeto JSON completo dentro de um texto qualquer. */
export function extractJson(text: string): string | null {
  if (!text) return null;

  // Bloco de codigo cercado e o caso mais comum.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenced ? fenced[1] : text;

  const start = haystack.indexOf('{');
  if (start === -1) return null;

  // Varredura contando chaves, ignorando as que estao dentro de string. Um
  // `indexOf('{')` + `lastIndexOf('}')` quebraria se o modelo escrevesse
  // qualquer coisa depois do objeto.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < haystack.length; i++) {
    const char = haystack[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }

  return null;
}

/** Conserta os desvios de JSON que os modelos menores cometem com frequencia. */
export function repairJson(raw: string): string {
  return (
    raw
      // Virgula sobrando antes de fechar objeto ou lista.
      .replace(/,(\s*[}\]])/g, '$1')
      // Alguns modelos usam aspas tipograficas nas chaves.
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
  );
}

export class InvalidJsonError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'InvalidJsonError';
  }
}

/** Extrai, conserta, faz o parse e valida contra o schema. */
export function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const extracted = extractJson(text);
  if (!extracted) {
    throw new InvalidJsonError('A resposta do modelo nao continha nenhum objeto JSON.', text);
  }

  let value: unknown;
  try {
    value = JSON.parse(extracted);
  } catch {
    try {
      value = JSON.parse(repairJson(extracted));
    } catch (err) {
      throw new InvalidJsonError(
        `JSON invalido: ${err instanceof Error ? err.message : err}`,
        extracted,
      );
    }
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new InvalidJsonError(`O JSON nao bate com o formato esperado — ${problems}`, extracted);
  }
  return result.data;
}
