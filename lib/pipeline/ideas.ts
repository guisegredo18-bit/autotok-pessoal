import { db } from '@/lib/db';
import { ideas } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { topTrends } from '@/lib/trends/scan';
import { generateIdeas } from '@/lib/ai/script';
import { withJob } from '@/lib/db/jobs';
import { hydrateEnv } from '@/lib/secrets';
import type { TemplateName } from '@/lib/ai/templates';

export type IdeaBatchResult = {
  created: number;
  discarded: number;
  trendsUsed: string[];
};

/**
 * Pega as melhores tendencias recentes e gera ideias para cada uma.
 *
 * Uma ideia por tendencia (em vez de N ideias para a melhor tendencia) e
 * deliberado: espalhar entre assuntos diferentes rende mais do que apostar
 * tudo numa hashtag so, e ainda serve de teste A/B natural do que funciona
 * no seu perfil.
 */
export async function generateIdeasFromTrends(options?: {
  count?: number;
  template?: TemplateName;
}): Promise<IdeaBatchResult> {
  await hydrateEnv();
  return withJob('ideas', undefined, (log) => fromTrends(log, options));
}

async function fromTrends(
  log: (message: string) => void,
  options?: { count?: number; template?: TemplateName },
): Promise<IdeaBatchResult> {
  const settings = await getSettings();
  const count = options?.count ?? settings.ideasPerScan;
  const template = options?.template ?? settings.template;

  const trends = await topTrends(count, settings.country);

  /**
   * Sem tendencia no banco, geramos a partir do nicho em vez de falhar.
   *
   * A coleta depende do Creative Center, que e uma fonte nao oficial e sai do
   * ar de tempos em tempos. Antes, quando isso acontecia, o botao principal do
   * painel simplesmente parava de funcionar — o app inteiro ficava refem de um
   * endereco que nao controlamos. Agora ele continua produzindo roteiros; so
   * deixam de vir amarrados a uma tendencia do momento.
   */
  const sources: { id?: string; name?: string; kind?: string }[] =
    trends.length > 0
      ? trends.map((t) => ({ id: t.id, name: t.name, kind: t.kind }))
      : Array.from({ length: count }, () => ({}));

  if (trends.length === 0) {
    log('sem tendencias no banco — gerando a partir do nicho configurado');
  }

  let created = 0;
  let discarded = 0;
  const trendsUsed: string[] = [];

  for (const trend of sources) {
    log(`escrevendo roteiro para "${trend.name ?? settings.niche}"`);
    const generated = await generateIdeas({
      settings,
      template,
      count: 1,
      trendName: trend.name,
      trendKind: trend.kind,
    });

    for (const idea of generated) {
      // A IA pontua a propria ideia; abaixo do minimo nem chega ao painel.
      // Isso evita que voce gaste atencao revisando conteudo fraco.
      if (idea.score < settings.minScore) {
        discarded++;
        continue;
      }

      await db.insert(ideas).values({
        trendId: trend.id ?? null,
        template,
        title: idea.title,
        hook: idea.hook,
        scenes: idea.scenes,
        caption: idea.caption,
        hashtags: idea.hashtags,
        score: idea.score,
        status: 'pending',
        notes: idea.reasoning,
      });
      created++;
    }

    trendsUsed.push(trend.name ?? `nicho: ${settings.niche}`);
  }

  return { created, discarded, trendsUsed };
}

/** Gera ideias para um assunto livre, sem depender de tendencia. */
export async function generateIdeasForTopic(
  topic: string,
  options?: { count?: number; template?: TemplateName },
): Promise<IdeaBatchResult> {
  await hydrateEnv();
  const settings = await getSettings();
  const template = options?.template ?? settings.template;

  const generated = await generateIdeas({
    settings,
    template,
    count: options?.count ?? 3,
    trendName: topic,
    trendKind: 'keyword',
  });

  let created = 0;
  for (const idea of generated) {
    await db.insert(ideas).values({
      trendId: null,
      template,
      title: idea.title,
      hook: idea.hook,
      scenes: idea.scenes,
      caption: idea.caption,
      hashtags: idea.hashtags,
      score: idea.score,
      status: 'pending',
      notes: idea.reasoning,
    });
    created++;
  }

  return { created, discarded: 0, trendsUsed: [topic] };
}
