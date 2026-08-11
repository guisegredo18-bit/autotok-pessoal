import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { REQUIRED_TABLES } from '@/lib/db/setup';
import * as setup from '@/lib/db/setup';
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

describe('colunas esperadas', () => {
  /**
   * A checagem por tabela ja tinha custado uma tela preta uma vez. Ela voltou
   * quando `videos.needs_review` foi acrescentada a uma tabela que ja existia:
   * a contagem de tabelas continuou fechando, o botao de preparar nao apareceu,
   * e toda tela que le `videos` quebrou com uma excecao sem mensagem.
   *
   * Ler coluna a coluna do schema mata a familia inteira desse descuido — nao
   * ha lista para esquecer de atualizar.
   */
  test('le as colunas do schema, e nao uma lista escrita a mao', () => {
    const colunas = setup.expectedColumns();
    const nomes = colunas.map((c) => `${c.table}.${c.column}`);

    assert.ok(nomes.includes('videos.needs_review'), 'a coluna que quebrou o painel');
    assert.ok(nomes.includes('settings.value'));
    assert.ok(nomes.includes('accounts.can_post_public'));
    assert.ok(colunas.length > 40, `poucas colunas lidas: ${colunas.length}`);
  });

  test('toda tabela do schema aparece nas colunas esperadas', () => {
    const tabelasNasColunas = new Set(setup.expectedColumns().map((c) => c.table));
    for (const tabela of tabelasDoSchema()) {
      assert.ok(tabelasNasColunas.has(tabela), `tabela fora da checagem: ${tabela}`);
    }
  });
});

describe('missingColumns', () => {
  const esperadas = [
    { table: 'videos', column: 'id' },
    { table: 'videos', column: 'needs_review' },
    { table: 'jobs', column: 'id' },
  ];

  test('acusa a coluna nova numa tabela que ja existe', () => {
    // Este e exatamente o caso que a contagem de tabelas nao pegava.
    const faltando = setup.missingColumns(esperadas, [
      { table: 'videos', column: 'id' },
      { table: 'jobs', column: 'id' },
    ]);
    assert.deepEqual(faltando, [{ table: 'videos', column: 'needs_review' }]);
  });

  test('banco em dia nao acusa nada', () => {
    assert.deepEqual(setup.missingColumns(esperadas, esperadas), []);
  });

  test('coluna a mais no banco nao e problema', () => {
    // Uma coluna que o schema nao conhece mais pode existir de uma versao
    // anterior; ela nao impede o app de funcionar e nao vale um alarme.
    const faltando = setup.missingColumns(esperadas, [
      ...esperadas,
      { table: 'videos', column: 'coluna_antiga' },
    ]);
    assert.deepEqual(faltando, []);
  });

  test('coluna com o mesmo nome em outra tabela nao conta', () => {
    const faltando = setup.missingColumns(
      [{ table: 'videos', column: 'status' }],
      [{ table: 'jobs', column: 'status' }],
    );
    assert.deepEqual(faltando, [{ table: 'videos', column: 'status' }]);
  });
});
