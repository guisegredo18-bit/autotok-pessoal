import { env, requireEnv } from '@/lib/env';
import { isModelNotFound, rankModels, usableModels } from './gemini-models';

/**
 * Provedores de IA.
 *
 * A aplicacao so precisa de uma coisa do modelo: receber um prompt e devolver
 * um JSON com o roteiro. Isso cabe numa interface de um metodo, e e o que
 * permite trocar de provedor mudando uma variavel de ambiente.
 *
 * Os quatro primeiros tem uso gratuito de verdade — os limites diarios ficam
 * muito acima do que essa aplicacao consome (uma dezena de chamadas por dia).
 * A Anthropic continua disponivel para quem preferir a qualidade dela e nao
 * se importar de pagar por chamada.
 */

export type AiProviderName = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'anthropic';

export type CompleteOptions = {
  system: string;
  prompt: string;
  maxTokens: number;
};

export interface AiProvider {
  readonly name: AiProviderName;
  readonly label: string;
  /** true quando a API sabe forcar saida JSON — reduz muito o retrabalho. */
  readonly jsonMode: boolean;
  complete(options: CompleteOptions): Promise<string>;
}

export const PROVIDER_LABELS: Record<AiProviderName, string> = {
  gemini: 'Google Gemini (gratis, sem cartao)',
  groq: 'Groq / Llama (gratis, sem cartao)',
  openrouter: 'OpenRouter (modelos :free)',
  ollama: 'Ollama local (gratis, sem chave)',
  anthropic: 'Anthropic Claude (pago por uso)',
};

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    // Roteiros sao curtos, mas um modelo local em CPU pode demorar bastante.
    signal: AbortSignal.timeout(180_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${new URL(url).host} respondeu ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).host} devolveu uma resposta que nao e JSON.`);
  }
}

// --- Google Gemini ----------------------------------------------------------

/**
 * Free tier sem cartao de credito e limite diario muito acima do nosso uso.
 * E tambem o que escreve melhor em portugues entre as opcoes gratuitas.
 */
/** Modelo descoberto nesta execucao, para nao listar a cada chamada. */
let geminiResolved: string | null = null;

/** Pergunta ao Google quais modelos a conta pode usar e escolhe o melhor. */
async function discoverGeminiModel(): Promise<string> {
  const res = await fetch(`${env.geminiBaseUrl}/models?key=${env.geminiApiKey}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      `nao consegui listar os modelos disponiveis (HTTP ${res.status}). ` +
        'Confira se a chave do Gemini esta correta.',
    );
  }

  const ranked = rankModels(usableModels(await res.json()));
  if (ranked.length === 0) {
    throw new Error('a sua conta do Gemini nao tem nenhum modelo Flash disponivel.');
  }
  return ranked[0];
}

export const gemini: AiProvider = {
  name: 'gemini',
  label: PROVIDER_LABELS.gemini,
  jsonMode: true,

  async complete({ system, prompt, maxTokens }) {
    requireEnv('geminiApiKey');

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: maxTokens,
      },
    };

    const call = (model: string) =>
      postJson(
        `${env.geminiBaseUrl}/models/${model}:generateContent?key=${env.geminiApiKey}`,
        body,
      );

    let json: any;
    try {
      json = await call(geminiResolved ?? env.geminiModel);
    } catch (err) {
      // Modelo aposentado: em vez de exigir que voce descubra o nome novo e
      // edite a configuracao, perguntamos ao Google e seguimos.
      if (!isModelNotFound(describeError(err))) throw err;

      const discovered = await discoverGeminiModel();
      console.warn(
        `[autotok] O modelo "${env.geminiModel}" nao esta disponivel; usando "${discovered}". ` +
          'Salve esse nome em Configuracoes > Chaves para evitar a consulta extra.',
      );
      geminiResolved = discovered;
      json = await call(discovered);
    }

    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p?.text ?? '').join('');
    if (!text) {
      const reason = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason;
      throw new Error(`Gemini nao devolveu texto${reason ? ` (motivo: ${reason})` : ''}.`);
    }
    return text;
  },
};

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- APIs compativeis com OpenAI (Groq, OpenRouter, e outros) ---------------

/**
 * Fabrica para qualquer API que fale o dialeto do OpenAI — cobre Groq,
 * OpenRouter e a maioria dos gateways compativeis. Exportada para que os
 * testes consigam apontar para um servidor local.
 */
export function openAiCompatible(
  name: AiProviderName,
  baseUrl: string,
  getKey: () => string,
  getModel: () => string,
  extraHeaders: Record<string, string> = {},
): AiProvider {
  return {
    name,
    label: PROVIDER_LABELS[name],
    jsonMode: true,

    async complete({ system, prompt, maxTokens }) {
      const json = await postJson(
        `${baseUrl}/chat/completions`,
        {
          model: getModel(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
        },
        { authorization: `Bearer ${getKey()}`, ...extraHeaders },
      );

      const text = json?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${name} nao devolveu texto.`);
      return text;
    },
  };
}

const groq = openAiCompatible(
  'groq',
  'https://api.groq.com/openai/v1',
  () => {
    requireEnv('groqApiKey');
    return env.groqApiKey;
  },
  () => env.groqModel,
);

const openrouter = openAiCompatible(
  'openrouter',
  'https://openrouter.ai/api/v1',
  () => {
    requireEnv('openRouterApiKey');
    return env.openRouterApiKey;
  },
  () => env.openRouterModel,
  // O OpenRouter usa estes cabecalhos para atribuir o trafego; sao opcionais,
  // mas sem eles o app aparece como "desconhecido" no painel deles.
  { 'http-referer': 'https://github.com/autotok-pessoal', 'x-title': 'AutoTok Pessoal' },
);

// --- Ollama (modelo local) --------------------------------------------------

/**
 * Nenhuma chave, nenhum limite, nenhum dado saindo da sua maquina. Em troca,
 * o modelo cabe no seu hardware e a geracao e mais lenta. Faz sentido para
 * quem ja mantem um VPS ou roda a aplicacao no proprio computador.
 */
const ollama: AiProvider = {
  name: 'ollama',
  label: PROVIDER_LABELS.ollama,
  jsonMode: true,

  async complete({ system, prompt, maxTokens }) {
    const json = await postJson(`${env.ollamaUrl}/api/chat`, {
      model: env.ollamaModel,
      stream: false,
      format: 'json',
      options: { num_predict: maxTokens },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });

    const text = json?.message?.content;
    if (!text) throw new Error('Ollama nao devolveu texto.');
    return text;
  },
};

// --- Anthropic --------------------------------------------------------------

const anthropic: AiProvider = {
  name: 'anthropic',
  label: PROVIDER_LABELS.anthropic,
  // A API tem saida estruturada de verdade, mas aqui usamos o mesmo caminho
  // dos outros para manter um unico fluxo de validacao e retry.
  jsonMode: false,

  async complete({ system, prompt, maxTokens }) {
    requireEnv('anthropicApiKey');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.anthropicApiKey });

    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is { type: 'text'; text: string; citations: never } =>
        block.type === 'text',
      )
      .map((block) => block.text)
      .join('');

    if (!text) throw new Error('A Anthropic nao devolveu texto.');
    return text;
  },
};

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  gemini,
  groq,
  openrouter,
  ollama,
  anthropic,
};

export function getProvider(name: AiProviderName = env.aiProvider): AiProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Provedor de IA desconhecido: "${name}". Use um de: ${Object.keys(PROVIDERS).join(', ')}.`,
    );
  }
  return provider;
}

/** Modelo em uso, para mostrar no painel. */
export function activeModel(name: AiProviderName = env.aiProvider): string {
  switch (name) {
    case 'gemini':
      return env.geminiModel;
    case 'groq':
      return env.groqModel;
    case 'openrouter':
      return env.openRouterModel;
    case 'ollama':
      return env.ollamaModel;
    case 'anthropic':
      return env.anthropicModel;
    default:
      return '—';
  }
}
