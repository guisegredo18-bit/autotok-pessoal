import { eq } from 'drizzle-orm';
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

export type JobType = 'scan' | 'ideas' | 'render' | 'publish';

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
