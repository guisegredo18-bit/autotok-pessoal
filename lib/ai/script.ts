import { z } from 'zod';
import type { AppSettings } from '@/lib/db/settings';
import {
  TEMPLATES,
  commonRules,
  contextBlock,
  type TemplateName,
} from './templates';
import { market } from './mercado';
import { getProvider } from './providers';
import { InvalidJsonError, parseJson } from './json';

/**
 * Geracao de roteiro.
 *
 * O modelo devolve JSON e nos validamos contra um schema Zod. Manter a
 * validacao do nosso lado (em vez de depender do modo estruturado de cada API)
 * e o que permite trocar entre Gemini, Groq, OpenRouter, Ollama e Anthropic
 * sem reescrever nada aqui — e os provedores gratuitos nao oferecem esse modo
 * com a mesma garantia.
 */

const SceneSchema = z.object({
  text: z.string(),
  visual: z.string(),
  seconds: z.number(),
});

const IdeaSchema = z.object({
  title: z.string(),
  hook: z.string(),
  scenes: z.array(SceneSchema).min(1),
  caption: z.string(),
  hashtags: z.array(z.string()),
  score: z.number(),
  reasoning: z.string(),
});

const BatchSchema = z.object({
  ideas: z.array(IdeaSchema).min(1),
});

export type GeneratedIdea = z.infer<typeof IdeaSchema>;

/**
 * O prompt de sistema depende do mercado.
 *
 * "Especialista no mercado brasileiro" estava fixo aqui, e nenhuma
 * configuracao de idioma alcancava esta linha — entao trocar o idioma na tela
 * produzia um prompt que se contradizia: pedia ingles no contexto e brasileiro
 * na especialidade. O modelo obedecia a um dos dois, sem criterio.
 */
function systemPrompt(marketCode: unknown): string {
  return SYSTEM.replace('{{ESPECIALIDADE}}', market(marketCode).expertise);
}

const SYSTEM = `
Voce e um roteirista de videos curtos para TikTok, {{ESPECIALIDADE}}.
Voce escreve roteiros que prendem a atencao nos primeiros 3 segundos e mantem o
espectador ate o fim. Voce conhece o ritmo do TikTok: cortes rapidos, linguagem
falada, zero formalidade.

Voce e honesto na nota que da para as proprias ideias. Uma ideia mediana recebe
nota mediana — quem le essa nota usa ela para decidir se grava o video ou nao,
entao inflar a nota so faz a pessoa perder tempo gravando conteudo ruim.

Responda SEMPRE com um unico objeto JSON valido, sem texto antes ou depois e sem
blocos de codigo.
`.trim();

/**
 * O formato esperado, escrito no proprio prompt.
 *
 * Descrito a mao em vez de gerado a partir do Zod: um JSON Schema cru gasta
 * muito mais tokens e os modelos menores seguem pior do que um exemplo curto
 * e comentado.
 */
const SHAPE = `
FORMATO DA RESPOSTA (JSON, exatamente estas chaves):
{
  "ideas": [
    {
      "title": "titulo interno curto",
      "hook": "a primeira frase do video",
      "scenes": [
        { "text": "texto narrado da cena", "visual": "english search term", "seconds": 4 }
      ],
      "caption": "legenda do post, ate 150 caracteres, sem hashtags",
      "hashtags": ["semcerquilha", "outra"],
      "score": 78,
      "reasoning": "uma frase explicando a nota"
    }
  ]
}
`.trim();

export type GenerateOptions = {
  settings: AppSettings;
  template: TemplateName;
  count: number;
  trendName?: string;
  trendKind?: string;
};

/** Gera N ideias de video completas para uma tendencia. */
export async function generateIdeas(opts: GenerateOptions): Promise<GeneratedIdea[]> {
  const template = TEMPLATES[opts.template] ?? TEMPLATES.viral;
  const [minScenes, maxScenes] = template.scenes;
  const provider = getProvider();

  const prompt = `
${contextBlock(opts.settings, opts.trendName, opts.trendKind)}

${template.structure}

${commonRules(opts.settings.language)}

${SHAPE}

Gere ${opts.count} ideia(s) de video DIFERENTES entre si — angulos distintos, nao
variacoes da mesma frase. Cada uma com ${minScenes} a ${maxScenes} cenas, somando
aproximadamente ${opts.settings.targetDuration} segundos no total.
`.trim();

  let lastError: unknown;

  // Duas tentativas: na segunda, o proprio erro de validacao entra no prompt.
  // Modelos gratuitos costumam acertar quando voce diz exatamente o que ficou
  // errado, e isso sai bem mais barato que exigir um provedor pago.
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await provider.complete({
      system: systemPrompt(opts.settings.language),
      prompt:
        attempt === 0
          ? prompt
          : `${prompt}\n\nSua resposta anterior foi rejeitada: ${
              lastError instanceof Error ? lastError.message : lastError
            }\nResponda de novo, apenas com o JSON valido.`,
      maxTokens: 8000,
    });

    try {
      const parsed = parseJson(text, BatchSchema);
      return parsed.ideas.map(normalizeIdea);
    } catch (err) {
      if (!(err instanceof InvalidJsonError)) throw err;
      lastError = err;
    }
  }

  throw new Error(
    `O modelo (${provider.label}) nao devolveu um roteiro valido em duas tentativas. ` +
      `Ultimo erro: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

/**
 * Ajustes que preferimos garantir no codigo em vez de confiar no modelo:
 * hashtags sem `#`, legenda dentro do limite e cenas com duracao sensata.
 */
export function normalizeIdea(idea: GeneratedIdea): GeneratedIdea {
  return {
    ...idea,
    caption: idea.caption.slice(0, 150).trim(),
    hashtags: idea.hashtags
      .map((h) => String(h).replace(/^#/, '').replace(/\s+/g, '').toLowerCase())
      .filter((h) => h.length > 1)
      .slice(0, 8),
    scenes: idea.scenes
      .filter((s) => s.text.trim().length > 0)
      .map((s) => ({ ...s, seconds: normalizeSeconds(s.seconds) })),
    score: Math.max(0, Math.min(100, idea.score)),
  };
}

/**
 * Duracao estimada de uma cena.
 *
 * Vale lembrar que este numero e so estimativa exibida no painel: na hora de
 * renderizar, cada cena dura o tempo real da narracao. Por isso ha duas regras
 * distintas — valor ausente (0, NaN, negativo) vira o padrao de 4s, e valor
 * informado mas absurdo e trazido para dentro da faixa util.
 */
export function normalizeSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 4;
  // Menos de 1,5s ninguem le a legenda; mais de 10s cansa em video curto.
  return Math.min(10, Math.max(1.5, seconds));
}

/** Monta a legenda final do post (legenda + assinatura + hashtags). */
export function buildCaption(
  caption: string,
  hashtags: string[],
  signature: string,
): string {
  const tags = hashtags.map((h) => `#${h}`).join(' ');
  // O TikTok corta a legenda em 2200 caracteres; folga de sobra, mas cortamos
  // por seguranca para o post nunca falhar por causa de texto longo.
  return [caption, signature, tags].filter(Boolean).join('\n\n').slice(0, 2200);
}
