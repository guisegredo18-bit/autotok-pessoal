import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Preparacao do banco sem terminal.
 *
 * O jeito tradicional seria `npm run db:push` na sua maquina — mas o objetivo
 * aqui e conseguir instalar tudo pelo iPhone. Entao o proprio painel detecta
 * que as tabelas ainda nao existem e aplica as migrations com um toque.
 *
 * As migrations sao as mesmas da pasta `drizzle/`, geradas pelo drizzle-kit e
 * versionadas no repositorio — nao ha SQL escrito a mao aqui que possa
 * divergir do schema.
 */

/** Uma vez pronto, o banco nao "despronta" — evita consultar a cada navegacao. */
let knownReady = false;

export async function databaseIsReady(): Promise<boolean> {
  if (knownReady) return true;

  try {
    // `to_regclass` devolve null em vez de lancar quando a tabela nao existe,
    // o que evita depender de codigo de erro do Postgres.
    const result = await db.execute(sql`select to_regclass('public.settings') as tabela`);
    const rows = result as unknown as { tabela: string | null }[];
    knownReady = Boolean(rows?.[0]?.tabela);
    return knownReady;
  } catch {
    // Banco inacessivel tambem conta como "nao pronto": a tela de preparacao
    // e onde o erro de conexao vai aparecer de forma legivel.
    return false;
  }
}

export type SetupResult = { ok: boolean; message: string };

/** Aplica as migrations pendentes. Seguro de rodar mais de uma vez. */
export async function prepareDatabase(): Promise<SetupResult> {
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  try {
    await migrate(db as never, {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
    knownReady = true;
    return { ok: true, message: 'Banco preparado. As tabelas foram criadas.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: explain(message) };
  }
}

/**
 * Traduz os erros mais comuns para algo acionavel.
 *
 * Quem esta instalando pelo celular nao vai abrir log nenhum: a mensagem na
 * tela precisa dizer o que fazer.
 */
function explain(message: string): string {
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return 'Nao consegui alcancar o banco. Confira o endereco em DATABASE_URL.';
  }
  if (/password authentication failed|SASL/i.test(message)) {
    return 'Usuario ou senha do banco incorretos. Copie a connection string do Neon de novo.';
  }
  if (/no pg_hba|SSL|self signed/i.test(message)) {
    return 'O banco exigiu SSL. Acrescente ?sslmode=require ao final da DATABASE_URL.';
  }
  if (/does not exist/i.test(message) && /database/i.test(message)) {
    return 'O banco informado na DATABASE_URL nao existe.';
  }
  if (/ENOENT|migrationsFolder|no such file/i.test(message)) {
    return 'Os arquivos de migration nao subiram no deploy. Refaca o deploy a partir do repositorio.';
  }
  return `Falhou ao preparar o banco: ${message}`;
}
