import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { jobs } from './schema';

/**
 * Registro de execucoes.
 *
 * Existe por um motivo pratico: os jobs pesados rodam no GitHub Actions, longe
 * de voce. Quando um video nao aparece, a pergunta e sempre "o job chegou a
 * rodar?" — e abrir a aba de Actions no celular e desconfortavel. Gravar aqui
 * responde isso dentro do proprio painel.
 */

export type JobType = 'scan' | 'ideas' | 'render' | 'publish' | 'auto';

export type JobHandle = {
  id: string;
  log: (message: string) => void;
};

export async function startJob(type: JobType, refId?: string): Promise<JobHandle> {
  const lines: string[] = [];

  const [row] = await db
    .insert(jobs)
    .values({ type, status: 'running', refId: refId ?? null, logs: [] })
    .returning({ id: jobs.id });

  return {
    id: row.id,
    log(message: string) {
      // Guardamos as ultimas 100 linhas: o suficiente para entender o que
      // aconteceu sem transformar a linha do banco num arquivo de log.
      lines.push(`${new Date().toISOString().slice(11, 19)} ${message}`);
      if (lines.length > 100) lines.shift();
      // Grava em segundo plano; perder uma linha de log nunca deve derrubar
      // o trabalho de verdade.
      void db
        .update(jobs)
        .set({ logs: [...lines] })
        .where(eq(jobs.id, row.id))
        .catch(() => {});
    },
  };
}

export async function finishJob(handle: JobHandle, message: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'done', message: message.slice(0, 500), finishedAt: new Date() })
    .where(eq(jobs.id, handle.id))
    .catch(() => {});
}

export async function failJob(handle: JobHandle, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(jobs)
    .set({ status: 'failed', message: message.slice(0, 500), finishedAt: new Date() })
    .where(eq(jobs.id, handle.id))
    .catch(() => {});
}

/**
 * Envolve um trabalho num registro de execucao.
 *
 * O registro nunca pode alterar o resultado: se gravar falhar, o trabalho
 * segue; se o trabalho falhar, o erro sobe igual, so que anotado.
 */
export async function withJob<T>(
  type: JobType,
  refId: string | undefined,
  work: (log: (message: string) => void) => Promise<T>,
): Promise<T> {
  let handle: JobHandle | null = null;
  try {
    handle = await startJob(type, refId);
  } catch {
    // Sem registro, tudo bem — o trabalho e que importa.
    return work(() => {});
  }

  try {
    const result = await work(handle.log);
    await finishJob(handle, 'ok');
    return result;
  } catch (err) {
    await failJob(handle, err);
    throw err;
  }
}

/**
 * Como esta a renderizacao de cada video, do ponto de vista de quem espera.
 *
 * Um render que morre no meio — a funcao da Vercel e morta ao bater o teto de
 * tempo — nao passa por `failJob`: nada e gravado, e o video fica em
 * "renderizando" para sempre, sem erro e sem saida. Olhar para o registro de
 * execucao responde as duas perguntas que importam: em que passo ele estava, e
 * ha quanto tempo parou de dar sinal.
 */
export type RenderProgress = {
  /** Ultima linha registrada, sem o horario. */
  step: string | null;
  /** Ha quantos minutos foi o ultimo sinal de vida. */
  silentMinutes: number;
  /** Se ja passou tempo demais para ainda estar rodando. */
  stalled: boolean;
};

/**
 * Um render inteiro leva um ou dois minutos. Cinco sem nenhuma linha nova nao
 * e lentidao: e um processo que nao existe mais.
 */
const STALLED_AFTER_MS = 5 * 60_000;

export function readProgress(
  logs: string[],
  startedAt: Date,
  now: Date = new Date(),
): RenderProgress {
  const last = logs.at(-1) ?? null;
  // As linhas sao gravadas como "HH:MM:SS mensagem".
  const step = last ? last.replace(/^\d{2}:\d{2}:\d{2}\s*/, '') : null;

  const silentMs = Math.max(0, now.getTime() - lastSignal(logs, startedAt, now));
  return {
    step,
    silentMinutes: Math.floor(silentMs / 60_000),
    stalled: silentMs > STALLED_AFTER_MS,
  };
}

/**
 * Quando foi o ultimo sinal de vida.
 *
 * As linhas so tem hora do dia, sem data, entao a hora e reconstruida sobre o
 * dia de hoje — e, se cair no futuro, sobre ontem, que e o caso de um render
 * comecado antes da meia-noite. Sem log nenhum, vale o inicio do job.
 */
function lastSignal(logs: string[], startedAt: Date, now: Date): number {
  const last = logs.at(-1);
  const match = last ? /^(\d{2}):(\d{2}):(\d{2})/.exec(last) : null;
  if (!match) return startedAt.getTime();

  const candidato = new Date(now);
  candidato.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
  if (candidato.getTime() > now.getTime()) {
    candidato.setUTCDate(candidato.getUTCDate() - 1);
  }
  return Math.max(candidato.getTime(), startedAt.getTime());
}

/** Progresso da renderizacao de cada video informado. */
export async function renderProgress(
  videoIds: string[],
): Promise<Map<string, RenderProgress>> {
  const mapa = new Map<string, RenderProgress>();
  if (videoIds.length === 0) return mapa;

  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.type, 'render'),
        eq(jobs.status, 'running'),
        inArray(jobs.refId, videoIds),
      ),
    )
    .orderBy(desc(jobs.startedAt));

  for (const row of rows) {
    if (!row.refId || mapa.has(row.refId)) continue;
    mapa.set(row.refId, readProgress(row.logs ?? [], row.startedAt));
  }
  return mapa;
}
