import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { env, requireEnv } from '@/lib/env';
import type { AppSettings } from '@/lib/db/settings';
import { COMMON_RULES, TEMPLATES, contextBlock, type TemplateName } from './templates';

/**
 * Geracao de roteiro com a API da Anthropic.
 *
 * Usamos structured outputs (output_config.format) em vez de pedir "responda em
 * JSON" no prompt: o modelo fica obrigado a devolver exatamente este schema, o
 * que elimina a classe inteira de bugs de parsing que apareceria rodando isso
 * varias vezes por dia sem ninguem olhando.
 */

const SceneSchema = z.object({
  text: z.string().describe('Texto que sera narrado nesta cena, em portugues do Brasil'),
  visual: z.string().describe('Termo de busca em ingles para a imagem/video de fundo'),
  seconds: z.number().describe('Duracao estimada da cena em segundos'),
});

const IdeaSchema = z.object({
  title: z.string().describe('Titulo interno da ideia, so para voce identificar no painel'),
  hook: z.string().describe('A primeira frase do video, a que prende a atencao'),
  scenes: z.array(SceneSchema).describe('As cenas do video, na ordem'),
  caption: z.string().describe('Legenda do post, ate 150 caracteres, sem hashtags'),
  hashtags: z.array(z.string()).describe('Hashtags sem o simbolo #'),
  score: z
    .number()
    .describe('Sua nota honesta de 0 a 100 para o potencial deste video de viralizar'),
  reasoning: z.string().describe('Uma frase explicando a nota que voce deu'),
});

const BatchSchema = z.object({
  ideas: z.array(IdeaSchema),
});

export type GeneratedIdea = z.infer<typeof IdeaSchema>;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  requireEnv('anthropicApiKey');
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

const SYSTEM = `
Voce e um roteirista de videos curtos para TikTok, especialista no mercado brasileiro.
Voce escreve roteiros que prendem a atencao nos primeiros 3 segundos e mantem o
espectador ate o fim. Voce conhece o ritmo do TikTok: cortes rapidos, linguagem
falada, zero formalidade.

Voce e honesto na nota que da para as proprias ideias. Uma ideia mediana recebe
nota mediana — quem le essa nota usa ela para decidir se grava o video ou nao,
entao inflar a nota so faz a pessoa perder tempo gravando conteudo ruim.
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

  const prompt = `
${contextBlock(opts.settings, opts.trendName, opts.trendKind)}

${template.structure}

${COMMON_RULES}

Gere ${opts.count} ideia(s) de video DIFERENTES entre si — angulos distintos, nao
variacoes da mesma frase. Cada uma com ${minScenes} a ${maxScenes} cenas, somando
aproximadamente ${opts.settings.targetDuration} segundos no total.
`.trim();

  const response = await getClient().messages.parse({
    model: env.anthropicModel,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: zodOutputFormat(BatchSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error('A IA nao devolveu um roteiro valido. Tente novamente.');
  }
  return parsed.ideas.map(normalizeIdea);
}

/**
 * Ajustes que preferimos garantir no codigo em vez de confiar no modelo:
 * hashtags sem `#`, legenda dentro do limite e cenas com duracao sensata.
 */
function normalizeIdea(idea: GeneratedIdea): GeneratedIdea {
  return {
    ...idea,
    caption: idea.caption.slice(0, 150).trim(),
    hashtags: idea.hashtags
      .map((h) => h.replace(/^#/, '').replace(/\s+/g, '').toLowerCase())
      .filter((h) => h.length > 1)
      .slice(0, 8),
    scenes: idea.scenes
      .filter((s) => s.text.trim().length > 0)
      // Menos de 1,5s ninguem le a legenda; mais de 10s cansa em video curto.
      .map((s) => ({ ...s, seconds: Math.min(10, Math.max(1.5, s.seconds || 4)) })),
    score: Math.max(0, Math.min(100, idea.score)),
  };
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
