import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileName, toCsv } from '@/lib/afiliados/exportar';
import type { Commission } from '@/lib/db/schema';

/**
 * O CSV exportado vai para o contador. Duas coisas nao podem falhar: a
 * planilha precisa abrir certa no Excel em portugues, e o valor original
 * precisa vir junto do convertido — sem a cotacao usada, ninguem consegue
 * conferir nem refazer a conta.
 */

function linha(overrides: Partial<Commission> = {}): Commission {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    source: 'hotmart',
    externalId: 'HP123:affiliate',
    productExternalId: '987',
    productName: 'Curso de Ingles',
    category: 'Educacao',
    quantity: 1,
    status: 'approved',
    amountCents: 14850,
    currency: 'BRL',
    amountUsdCents: 2750,
    usdRate: 5.4,
    occurredAt: new Date('2026-07-05T14:00:00Z'),
    importedAt: new Date('2026-08-10T12:00:00Z'),
    raw: null,
    ...overrides,
  } as Commission;
}

describe('toCsv', () => {
  test('traz valor original, cotacao e valor em dolar', () => {
    const linhas = toCsv([linha()]).split('\r\n');
    const dados = linhas[1];

    assert.match(dados, /"2026-07-05"/);
    assert.match(dados, /"148,50"/); // valor na moeda original
    assert.match(dados, /"BRL"/);
    assert.match(dados, /"5,4000"/); // cotacao usada
    assert.match(dados, /"27,50"/); // valor em dolar
  });

  test('separador ponto-e-virgula e decimal com virgula', () => {
    // E o que o Excel em portugues abre direto, sem a etapa de "importar
    // dados" que ninguem acerta de primeira.
    const [cabecalho] = toCsv([linha()]).split('\r\n');
    assert.ok(cabecalho.includes('";"'), 'o separador deveria ser ponto-e-virgula');
  });

  test('comeca com BOM, senao o Excel no Windows estraga os acentos', () => {
    assert.ok(toCsv([]).startsWith('﻿'));
  });

  test('nome com ponto-e-virgula nao desloca as colunas', () => {
    const csv = toCsv([linha({ productName: 'Curso; completo' })]);
    // Uma linha de dados, e nao duas colunas a mais.
    assert.equal(csv.trim().split('\r\n').length, 2);
    assert.match(csv, /"Curso; completo"/);
  });

  test('aspas no nome do produto sao escapadas', () => {
    const csv = toCsv([linha({ productName: 'Tela 15" HD' })]);
    assert.match(csv, /"Tela 15"" HD"/);
  });

  test('quebra de linha no nome nao vira linha nova', () => {
    const csv = toCsv([linha({ productName: 'Curso\nde Ingles' })]);
    assert.equal(csv.trim().split('\r\n').length, 2);
  });

  test('comissao sem conversao sai com a coluna USD vazia, nao com zero', () => {
    // Um zero ali entraria na soma da planilha do contador como receita zero,
    // em vez de sinalizar que aquela linha ainda precisa de cotacao.
    const csv = toCsv([linha({ amountUsdCents: null, usdRate: null })]);
    // Moeda original preenchida, cotacao e valor em USD vazios.
    assert.match(csv.split('\r\n')[1], /"BRL";"";"";/);
  });

  test('status sai em portugues', () => {
    assert.match(toCsv([linha({ status: 'refunded' })]), /"estornada"/);
    assert.match(toCsv([linha({ status: 'pending' })]), /"aguardando"/);
  });

  test('sem linhas, so o cabecalho', () => {
    const linhas = toCsv([]).trim().split('\r\n');
    assert.equal(linhas.length, 1);
    assert.match(linhas[0], /Data/);
  });
});

describe('fileName', () => {
  test('traz o periodo, para nao virar uma pasta de "export (3).csv"', () => {
    const nome = fileName([
      linha({ occurredAt: new Date('2026-07-05T00:00:00Z') }),
      linha({ occurredAt: new Date('2026-08-01T00:00:00Z') }),
    ]);
    assert.equal(nome, 'comissoes_2026-07-05_a_2026-08-01.csv');
  });

  test('sem linhas usa um nome generico', () => {
    assert.equal(fileName([]), 'comissoes.csv');
  });
});
