import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __autotokSql: ReturnType<typeof postgres> | undefined;
}

let instance: Db | null = null;

function getDb(): Db {
  if (instance) return instance;

  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL nao configurada. Veja o .env.example.');
  }

  // `max: 1` mantem o uso de conexoes baixo o bastante para os planos
  // gratuitos do Neon/Supabase, que cortam pools grandes. Em dev o Next
  // recarrega os modulos a cada mudanca, entao guardamos o cliente no global
  // para nao estourar o limite de conexoes do banco.
  const sql = globalThis.__autotokSql ?? postgres(env.databaseUrl, { max: 1, prepare: false });
  if (process.env.NODE_ENV !== 'production') globalThis.__autotokSql = sql;

  instance = drizzle(sql, { schema });
  return instance;
}

/**
 * Conexao preguicosa.
 *
 * O `next build` importa cada rota para coletar metadados. Se a conexao fosse
 * criada no topo do modulo, o build quebraria em qualquer maquina sem
 * DATABASE_URL — inclusive no CI, que so compila. Com o proxy, a conexao so
 * nasce quando alguem realmente consulta o banco.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, property, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export { schema };
export * from './schema';
