import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { REQUIRED_TABLES } from '@/lib/db/setup';
import * as schema from '@/lib/db/schema';

/**
 * O painel decide se o banco esta pronto conferindo se as tabelas existem —
 * e e essa decisao que faz aparecer (ou nao) o botao "Preparar banco de
 * dados".
 *
 * Enquanto a checagem olhava apenas `settings`, uma migration nova passava
 * despercebida: quem ja tinha o banco preparado recebia "pronto", o botao
 * nunca aparecia, e a tela que usava a tabela nova quebrava com uma excecao
 * sem mensagem. No celular isso chega como pagina preta com um numero de
 * digest — nada que aponte para "falta rodar a migration".
 *
 * Este teste existe para que acrescentar uma tabela ao schema e esquecer da
 * lista quebre aqui, e nao no celular de quem atualizou.
 */

/**
 * Os nomes reais das tabelas declaradas no schema.
 *
 * Ler do schema, e nao de uma segunda lista escrita a mao, e o que da valor ao
 * teste: uma tabela nova aparece aqui sozinha, e o teste passa a cobrar que
 * ela entre em REQUIRED_TABLES.
 */
function tabelasDoSchema(): string[] {
  const nomes: string[] = [];
  for (const valor of Object.values(schema)) {
    // Sem predicado de tipo explicito: `PgTable` generico nao e atribuivel aos
    // tipos concretos que o drizzle infere para cada tabela.
    if (is(valor, PgTable)) nomes.push(getTableName(valor));
  }
  return nomes.sort();
}

describe('checagem de banco pronto', () => {
  test('cobre exatamente as tabelas do schema', () => {
    assert.deepEqual([...REQUIRED_TABLES].sort(), tabelasDoSchema());
  });

  test('nao ha nome repetido', () => {
    // Um repetido faria a contagem bater com menos tabelas do que o esperado,
    // e o banco incompleto passaria por pronto de novo.
    assert.equal(new Set(REQUIRED_TABLES).size, REQUIRED_TABLES.length);
  });
});
