import path from 'node:path';
import { is, sql } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { db } from './index';
import * as schema from './schema';

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

export type ColunaEsperada = { table: string; column: string };

/**
 * Tudo que a aplicacao precisa encontrar no banco, lido do proprio schema.
 *
 * Antes isto era uma lista de tabelas escrita a mao, e ela ja tinha custado
 * uma tela preta: enquanto a checagem olhava so `settings`, um banco preparado
 * antes de uma migration nova respondia "pronto", o botao de preparar nunca
 * aparecia, e a tela que usava a tabela nova quebrava com uma excecao sem
 * mensagem — no celular, uma pagina preta com um numero de digest.
 *
 * Conferir todas as tabelas resolveu aquele caso e deixou o proximo de pe:
 * `videos.needs_review` foi acrescentada a uma tabela que ja existia, entao a
 * contagem de tabelas continuou fechando e a mesma tela preta voltou.
 *
 * Ler do schema em vez de manter lista mata a familia inteira de descuidos.
 * Coluna nova, tabela nova, tanto faz: se esta no schema e nao esta no banco,
 * o painel sabe e oferece o botao.
 */
export function expectedColumns(): ColunaEsperada[] {
  const esperadas: ColunaEsperada[] = [];

  for (const valor of Object.values(schema)) {
    // Sem predicado de tipo explicito: `PgTable` generico nao e atribuivel aos
    // tipos concretos que o drizzle infere para cada tabela.
    if (!is(valor, PgTable)) continue;
    const config = getTableConfig(valor);
    for (const coluna of config.columns) {
      esperadas.push({ table: config.name, column: coluna.name });
    }
  }

  return esperadas;
}

/** O que o schema pede e o banco nao tem. Puro, para poder ser testado. */
export function missingColumns(
  esperadas: ColunaEsperada[],
  existentes: ColunaEsperada[],
): ColunaEsperada[] {
  const tem = new Set(existentes.map((c) => `${c.table}.${c.column}`));
  return esperadas.filter((c) => !tem.has(`${c.table}.${c.column}`));
}

/** As tabelas do schema — usado nas mensagens e no diagnostico da tela. */
export const REQUIRED_TABLES = Array.from(
  new Set(expectedColumns().map((c) => c.table)),
).sort();

export async function databaseIsReady(): Promise<boolean> {
  if (knownReady) return true;

  try {
    const result = await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `);
    const rows = result as unknown as { table_name: string; column_name: string }[];
    const existentes = (rows ?? []).map((r) => ({ table: r.table_name, column: r.column_name }));

    knownReady = missingColumns(expectedColumns(), existentes).length === 0;
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

    /**
     * Banco que existe, mas de antes do controle de migrations.
     *
     * Quem preparou com `npm run db:push` (ou com uma versao antiga do painel)
     * tem as tabelas sem o registro que o migrador usa para saber o que ja
     * rodou. Entao ele tenta desde a primeira migration e para em "relation
     * already exists" — e o botao, que existe justamente para consertar o
     * banco, nao conserta nada.
     *
     * Neste caso aplicamos o que falta a partir do schema. E deliberadamente
     * limitado a acrescentar coluna: e o que uma atualizacao costuma trazer, e
     * e a unica mudanca que da para deduzir sem risco de destruir dado.
     */
    if (/already exists/i.test(message)) return await addMissingColumns();

    return { ok: false, message: explain(message) };
  }
}

/** Renderiza um valor padrao para dentro do SQL, ou recusa o que nao entende. */
function renderDefault(value: unknown, sqlType: string): string | null {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    // Objeto com `queryChunks` e SQL do drizzle (`now()`, `gen_random_uuid()`).
    // Nao ha como reproduzi-lo com seguranca daqui, entao recusamos.
    if (value && typeof value === 'object' && 'queryChunks' in (value as object)) return null;
    if (!/json/i.test(sqlType)) return null;
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::${sqlType}`;
  }
  return null;
}

async function addMissingColumns(): Promise<SetupResult> {
  const result = await db.execute(sql`
    select table_name, column_name from information_schema.columns where table_schema = 'public'
  `);
  const rows = result as unknown as { table_name: string; column_name: string }[];
  const existentes = (rows ?? []).map((r) => ({ table: r.table_name, column: r.column_name }));

  const tabelasExistentes = new Set(existentes.map((c) => c.table));
  const faltando = missingColumns(expectedColumns(), existentes);

  if (faltando.length === 0) {
    knownReady = true;
    return { ok: true, message: 'O banco ja estava em dia.' };
  }

  // Tabela inteira faltando nao da para deduzir daqui — indices, chaves e
  // restricoes nao estao nesta leitura, e inventar metade delas seria pior.
  const tabelaNova = faltando.find((c) => !tabelasExistentes.has(c.table));
  if (tabelaNova) {
    return {
      ok: false,
      message:
        `Falta a tabela "${tabelaNova.table}" e o seu banco nao tem registro de migrations, ` +
        'entao nao consigo cria-la daqui com seguranca. Rode `npm run db:push` uma vez.',
    };
  }

  const comandos: string[] = [];
  for (const alvo of faltando) {
    const definicao = columnDefinition(alvo);
    if (!definicao) {
      return {
        ok: false,
        message:
          `A coluna "${alvo.table}.${alvo.column}" tem um valor padrao que nao consigo ` +
          'reproduzir daqui. Rode `npm run db:push` uma vez.',
      };
    }
    comandos.push(definicao);
  }

  try {
    for (const comando of comandos) await db.execute(sql.raw(comando));
    knownReady = false;
    const pronto = await databaseIsReady();
    return pronto
      ? {
          ok: true,
          message: `Banco atualizado: ${comandos.length} coluna(s) nova(s) criada(s).`,
        }
      : { ok: false, message: 'Apliquei o que faltava, mas o banco ainda nao ficou em dia.' };
  } catch (err) {
    return { ok: false, message: explain(err instanceof Error ? err.message : String(err)) };
  }
}

/** `ALTER TABLE ... ADD COLUMN` para uma coluna do schema, ou null se nao der. */
function columnDefinition(alvo: ColunaEsperada): string | null {
  for (const valor of Object.values(schema)) {
    if (!is(valor, PgTable)) continue;
    const config = getTableConfig(valor);
    if (config.name !== alvo.table) continue;

    const coluna = config.columns.find((c) => c.name === alvo.column);
    if (!coluna) return null;

    const tipo = coluna.getSQLType();
    let sql = `alter table "${alvo.table}" add column if not exists "${alvo.column}" ${tipo}`;

    if (coluna.hasDefault) {
      const padrao = renderDefault(coluna.default, tipo);
      if (padrao === null) return null;
      sql += ` default ${padrao}`;
    } else if (coluna.notNull) {
      // Sem padrao e sem permitir nulo nao ha valor para as linhas que ja
      // existem — o Postgres recusaria, e adivinhar um valor seria pior.
      return null;
    }

    if (coluna.notNull) sql += ' not null';
    return sql;
  }
  return null;
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
