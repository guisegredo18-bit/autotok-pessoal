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

  /**
   * Os roteiros sao escritos em paralelo.
   *
   * Em serie, cinco chamadas de 10 a 15 segundos estouram o tempo de uma
   * requisicao HTTP — foi por isso que a geracao vivia delegada ao GitHub
   * Actions, e o usuario ficava olhando "atualize em ~1 minuto" sem nunca ver
   * resultado quando o job falhava. Em paralelo, o lote inteiro cabe numa
   * requisicao e a resposta vem na hora.
   */
  log(`escrevendo ${sources.length} roteiro(s) em paralelo`);

  const results = await Promise.allSettled(
    sources.map((trend) =>
      generateIdeas({
        settings,
        template,
        count: 1,
        trendName: trend.name,
        trendKind: trend.kind,
      }),
    ),
  );

  let created = 0;
  let discarded = 0;
  let failed = 0;
  const trendsUsed: string[] = [];

  for (const [index, result] of results.entries()) {
    const trend = sources[index];

    if (result.status === 'rejected') {
      // Um roteiro que falhou nao pode levar os outros junto — um limite de
      // uso atingido no meio do lote deixaria voce sem nada.
      failed++;
      log(`falhou em "${trend.name ?? settings.niche}": ${describe(result.reason)}`);
      continue;
    }

    for (const idea of result.value) {
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

  // Todas falharam: a causa e comum a todas (chave errada, limite atingido),
  // entao propagamos para a tela mostrar o motivo em vez de "0 criadas".
  if (created === 0 && failed === results.length && failed > 0) {
    const first = results.find((r) => r.status === 'rejected');
    throw new Error(
      describe(first && first.status === 'rejected' ? first.reason : 'motivo desconhecido'),
    );
  }

  return { created, discarded, trendsUsed };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
