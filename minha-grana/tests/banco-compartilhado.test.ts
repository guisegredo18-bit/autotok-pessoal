import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY } from '@/lib/db/settings';
import { FX_KEY } from '@/lib/db/fx';

/**
 * Este aplicativo pode dividir o banco do Neon com o AutoTok, que tambem
 * guarda preferencias e credenciais numa tabela `settings` de chave e valor.
 *
 * As chaves genericas — `app`, `secrets`, `fx` — sao exatamente as que o
 * vizinho usa. Escrever nelas nao daria erro nenhum: daria perda de dados
 * silenciosa, descoberta dias depois, quando o outro painel comecasse a se
 * comportar de forma estranha. Estes testes existem para que ninguem "limpe"
 * os prefixos por acha-los feios.
 */

/** As chaves que pertencem ao outro aplicativo. Nenhuma pode ser usada aqui. */
const CHAVES_DO_VIZINHO = ['app', 'secrets', 'fx'];

let STORE_KEY: string;

before(async () => {
  process.env.AUTH_SECRET = 'segredo-de-teste-suficientemente-longo';
  STORE_KEY = (await import('@/lib/secrets')).STORE_KEY;
});

describe('convivencia num banco compartilhado', () => {
  test('nenhuma chave colide com as do AutoTok', () => {
    for (const key of [SETTINGS_KEY, STORE_KEY, FX_KEY]) {
      assert.ok(
        !CHAVES_DO_VIZINHO.includes(key),
        `"${key}" e a chave que o outro aplicativo usa — gravar aqui apagaria os dados dele`,
      );
    }
  });

  test('todas as chaves sao prefixadas', () => {
    for (const key of [SETTINGS_KEY, STORE_KEY, FX_KEY]) {
      assert.match(key, /^grana_/, `"${key}" deveria comecar com "grana_"`);
    }
  });

  test('as tres chaves sao distintas entre si', () => {
    // Duas iguais fariam as preferencias e as credenciais se sobrescreverem
    // dentro do proprio aplicativo — o mesmo estrago, so que em casa.
    const keys = [SETTINGS_KEY, STORE_KEY, FX_KEY];
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('migration tolera tabelas ja existentes', () => {
  test('todo CREATE usa IF NOT EXISTS', async () => {
    // Num banco compartilhado, `settings` (e talvez as tabelas de comissao) ja
    // foram criadas pelo outro aplicativo. Sem `IF NOT EXISTS`, o botao
    // "Preparar banco de dados" falharia com "relation already exists" — e a
    // pessoa concluiria que o banco esta quebrado.
    const { readFile, readdir } = await import('node:fs/promises');
    const path = await import('node:path');

    const dir = path.join(process.cwd(), 'drizzle');
    const arquivos = (await readdir(dir)).filter((name) => name.endsWith('.sql'));
    assert.ok(arquivos.length > 0, 'nenhuma migration encontrada');

    for (const arquivo of arquivos) {
      const sql = await readFile(path.join(dir, arquivo), 'utf8');
      for (const linha of sql.split('\n')) {
        if (/^CREATE (TABLE|INDEX)/i.test(linha)) {
          assert.match(
            linha,
            /IF NOT EXISTS/i,
            `${arquivo}: "${linha.slice(0, 60)}…" precisa de IF NOT EXISTS`,
          );
        }
      }
    }
  });
});
