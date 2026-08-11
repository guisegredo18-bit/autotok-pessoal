import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, jobs, videos } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { finishJob, failJob, startJob } from '@/lib/db/jobs';
import { autoPublishReady, autopilotBlockers, type Blocker } from '@/lib/pipeline/autopilot';
import { autoApproveIdeas } from '@/lib/pipeline/queue';
import { getAccount } from '@/lib/tiktok/account';
import { hydrateEnv } from '@/lib/secrets';
import { push } from '@/lib/notify';
import { env } from '@/lib/env';

/**
 * Uma rodada completa do piloto: aprova, renderiza, publica — e conta o que
 * aconteceu.
 *
 * O "e conta" nao e enfeite. O piloto existe para voce nao abrir o painel, o
 * que significa que ele e a unica parte do sistema cujo fracasso ninguem ve.
 * Uma rodada que nao entrega nada precisa aparecer em dois lugares: no
 * registro de execucoes (que a tela inicial ja mostra) e, quando ha o que
 * fazer a respeito, no seu celular.
 */

export type RoundResult = {
  approved: number;
  published: number;
  failed: number;
  blockers: Blocker[];
  /** Uma linha com o resultado — vira a mensagem do job e o texto do aviso. */
  summary: string;
};

export async function runAutopilotRound(
  log: (message: string) => void = () => {},
  options: { inlineLimit?: number } = {},
): Promise<RoundResult> {
  await hydrateEnv();

  const handle = await startJob('auto').catch(() => null);
  const registra = (message: string) => {
    log(message);
    handle?.log(message);
  };

  try {
    const aprovadas = await autoApproveIdeas({
      log: registra,
      inlineLimit: options.inlineLimit,
    });
    if (aprovadas.reason) registra(`aprovacao: ${aprovadas.reason}`);

    const publicados = await autoPublishReady(registra);
    if (publicados.reason) registra(`publicacao: ${publicados.reason}`);

    const blockers = await readBlockers();

    const result: RoundResult = {
      approved: aprovadas.videoIds.length,
      published: publicados.published.length,
      failed: publicados.failed.length,
      blockers,
      summary: '',
    };
    result.summary = summarize(result, aprovadas.reason ?? publicados.reason);

    if (handle) await finishJob(handle, result.summary);
    await warnIfStuck(result);
    return result;
  } catch (err) {
    if (handle) await failJob(handle, err);
    throw err;
  }
}

/** Tudo que `autopilotBlockers` precisa saber, lido do banco de uma vez. */
async function readBlockers(): Promise<Blocker[]> {
  const settings = await getSettings();

  const [account, [pendentes], [acimaDaNota], [ultimo]] = await Promise.all([
    getAccount().catch(() => null),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ideas)
      .where(eq(ideas.status, 'pending')),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ideas)
      .where(and(eq(ideas.status, 'pending'), sql`${ideas.score} >= ${settings.autoMinScore}`)),
    db
      .select({ at: videos.publishedAt })
      .from(videos)
      .where(eq(videos.status, 'published'))
      .orderBy(desc(videos.publishedAt))
      .limit(1),
  ]);

  return autopilotBlockers({
    settings,
    connected: Boolean(account),
    canPostPublic: account?.canPostPublic ?? false,
    pendingIdeas: pendentes?.n ?? 0,
    pendingAboveScore: acimaDaNota?.n ?? 0,
    lastPublishedAt: ultimo?.at ?? null,
  });
}

function summarize(result: RoundResult, reason?: string): string {
  const feito =
    result.published > 0 || result.approved > 0
      ? `${result.approved} gravando, ${result.published} publicado(s)` +
        (result.failed > 0 ? `, ${result.failed} falha(s)` : '')
      : 'nada a fazer';

  const impedimento = result.blockers[0]?.label;
  return impedimento ? `${feito} — ${impedimento}` : reason ? `${feito} — ${reason}` : feito;
}

/**
 * Avisa no celular quando a rodada nao entregou nada e ha o que fazer.
 *
 * Duas contencoes, porque aviso repetido e a forma mais rapida de ensinar
 * alguem a ignorar avisos: nada e enviado quando a rodada produziu algo (teto
 * diario atingido e sucesso, nao problema), e nada e reenviado enquanto o
 * motivo for o mesmo da rodada anterior. Assim o cron de tres vezes ao dia
 * manda uma mensagem quando o canal trava, e nao tres por dia para sempre.
 */
async function warnIfStuck(result: RoundResult): Promise<void> {
  const grave = result.blockers.find((b) => b.severity === 'alta') ?? result.blockers[0];
  if (!grave) return;
  if (result.published > 0 || result.approved > 0) return;

  // A rodada atual ja foi gravada antes desta checagem, entao a anterior e a
  // segunda linha: comparar com a primeira seria comparar com ela mesma, e
  // nenhum aviso sairia nunca.
  const [, anterior] = await db
    .select({ message: jobs.message })
    .from(jobs)
    .where(and(eq(jobs.type, 'auto'), ne(jobs.status, 'running')))
    .orderBy(desc(jobs.startedAt))
    .limit(2);

  if (anterior?.message === result.summary) return;

  await push({
    title: 'O piloto automatico esta parado',
    message: `${grave.label}\n\n${grave.hint}`,
    priority: 4,
    url: `${env.appUrl}/config`,
    tags: ['warning'],
  });
}
