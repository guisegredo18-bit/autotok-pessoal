import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, videos } from '@/lib/db/schema';
import { getSettings, type AppSettings } from '@/lib/db/settings';
import { enqueueRender, renderQueuedVideo } from '@/lib/pipeline/render';
import { pickIdeas, budgetLeft } from '@/lib/pipeline/autopilot';
import { canDispatch, dispatch } from '@/lib/dispatch';
import { listRecentRuns, queueHealth } from '@/lib/github/repo';

/**
 * Como um video sai da fila e vira trabalho de verdade.
 *
 * Isto vivia dentro de `app/actions.ts`, acessivel so a partir de um toque na
 * tela. O piloto automatico precisa exatamente da mesma decisao — inclusive o
 * desvio quando o GitHub Actions nao entrega maquina —, e duas copias dessa
 * regra divergiriam no primeiro conserto feito de um lado so.
 */

/**
 * Qual motor de renderizacao esta valendo.
 *
 * Sem token nao ha para onde despachar, entao a preferencia por `github` nao
 * se sustenta e vira `aqui`. Com a fila do GitHub parada, despachar e so
 * escolher nao renderizar: o job e criado e fica esperando uma maquina que nao
 * vem. Renderizar aqui demora mais, mas termina — e terminar e o unico
 * requisito que importa.
 */
export async function resolveRenderEngine(): Promise<AppSettings['renderEngine']> {
  const { renderEngine } = await getSettings();
  if (renderEngine !== 'github') return renderEngine;

  if (!canDispatch()) return 'aqui';

  const health = queueHealth(await listRecentRuns(10).catch(() => []));
  return health.stuck ? 'aqui' : 'github';
}

/**
 * Manda o video para a renderizacao — e registra na propria linha quando o
 * disparo nao foi aceito.
 *
 * Sem isso, um disparo recusado deixava o video em "na fila" para sempre: a
 * tela dizia "renderizando, atualize em alguns minutos" enquanto nenhum job
 * existia do outro lado, e a unica pista era um toast vermelho que some ao
 * trocar de aba. Gravando o erro na linha, a Fila mostra o motivo e o botao
 * de tentar de novo aparece.
 *
 * `inline: false` recusa o motor que renderiza no proprio processo e deixa o
 * video esperando — o que o piloto usa a partir do segundo video de uma mesma
 * requisicao do painel: renderizar cinco em serie mataria a funcao no meio do
 * segundo, e o resultado seria pior do que deixa-los na fila.
 */
export async function requestRender(
  videoId: string,
  options: { inline?: boolean } = {},
): Promise<AppSettings['renderEngine']> {
  const inline = options.inline ?? true;
  const motor = await resolveRenderEngine();

  // `manual` nao chama ninguem de proposito: o video fica em "na fila" ate
  // alguem com uma maquina — o caderno do Colab, um terminal — pegar a fila.
  if (motor === 'manual') return motor;

  if (motor === 'aqui') {
    if (!inline) return 'manual';
    // Esperar de proposito, e nao disparar em segundo plano: na Vercel a
    // funcao e congelada assim que a resposta sai, e um render iniciado com
    // `void` morreria no meio deixando o video preso em "renderizando".
    await renderQueuedVideo(videoId);
    return motor;
  }

  try {
    await dispatch('render-video', { video_id: videoId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(videos)
      .set({ status: 'failed', error: message.slice(0, 2000) })
      .where(eq(videos.id, videoId));
    throw err;
  }
  return motor;
}

export type AutoApproveResult = {
  /** Ids dos videos criados a partir das ideias aprovadas pelo piloto. */
  videoIds: string[];
  /** Quantas ideias estavam esperando quando a rodada comecou. */
  pending: number;
  /** Por que a rodada nao aprovou mais do que aprovou. */
  reason?: string;
};

/**
 * Aprova sozinho as melhores ideias esperando e as manda renderizar.
 *
 * O teto do dia conta todos os videos criados nas ultimas 24h, e nao so os que
 * o piloto criou: se voce ja gravou tres na mao, o piloto nao acrescenta um
 * quarto. O limite e do canal, nao de quem apertou o botao.
 */
export async function autoApproveIdeas(
  options: { inlineLimit?: number; log?: (message: string) => void } = {},
): Promise<AutoApproveResult> {
  const log = options.log ?? (() => {});
  const settings = await getSettings();

  if (!settings.autoApprove) {
    return { videoIds: [], pending: 0, reason: 'aprovacao automatica desligada' };
  }

  const [usados] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videos)
    .where(sql`${videos.status} <> 'rejected' and ${videos.createdAt} > now() - interval '24 hours'`);

  const budget = budgetLeft(settings.videosPerDay, usados?.n ?? 0);

  const pendentes = await db
    .select({ id: ideas.id, score: ideas.score })
    .from(ideas)
    .where(eq(ideas.status, 'pending'))
    .orderBy(sql`${ideas.score} desc`)
    .limit(50);

  if (budget === 0) {
    return {
      videoIds: [],
      pending: pendentes.length,
      reason: `teto de ${settings.videosPerDay} video(s) por dia ja atingido`,
    };
  }

  const escolhidas = pickIdeas(pendentes, { minScore: settings.autoMinScore, budget });
  if (escolhidas.length === 0) {
    return {
      videoIds: [],
      pending: pendentes.length,
      reason:
        pendentes.length > 0
          ? `nenhuma ideia alcancou a nota ${settings.autoMinScore}`
          : 'nenhuma ideia esperando',
    };
  }

  const videoIds: string[] = [];
  const inlineLimit = options.inlineLimit ?? Number.POSITIVE_INFINITY;
  let reason: string | undefined;

  for (const idea of escolhidas) {
    const videoId = await enqueueRender(idea.id);
    videoIds.push(videoId);
    log(`ideia ${idea.id} (nota ${Math.round(idea.score)}) virou video ${videoId}`);

    try {
      await requestRender(videoId, { inline: videoIds.length <= inlineLimit });
    } catch (err) {
      // O erro ja esta gravado na linha do video. Parar aqui e deliberado: o
      // que derruba um disparo (token vencido, GitHub fora) derruba os
      // proximos tambem, e cinco linhas com o mesmo erro nao ensinam nada.
      reason = `parei no primeiro erro de disparo: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
  }

  return { videoIds, pending: pendentes.length, reason };
}
