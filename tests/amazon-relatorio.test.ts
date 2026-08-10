import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  findHeaderRow,
  mapHeaders,
  parseCsv,
  parseDate,
  parseEarningsReport,
} from '@/lib/amazon/relatorio';

/**
 * O CSV de ganhos e a unica fonte do dinheiro real da Amazon — a PA-API nao
 * informa comissao. Entao um parser errado aqui nao produz um bug visivel:
 * produz um painel que soma menos do que voce ganhou, e ninguem percebe.
 *
 * O relatorio muda de forma conforme o marketplace e o idioma da conta, e
 * cada variacao coberta aqui e uma que existe de verdade.
 */

describe('parseCsv', () => {
  test('separa por virgula', () => {
    assert.deepEqual(parseCsv('a,b\n1,2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('detecta ponto-e-virgula, que e o do relatorio em portugues', () => {
    // Precisa ser detectado: em portugues a virgula ja e o separador decimal,
    // e ler "12,30" como duas colunas desloca a linha inteira.
    assert.deepEqual(parseCsv('nome;valor\nfone;12,30'), [
      ['nome', 'valor'],
      ['fone', '12,30'],
    ]);
  });

  test('respeita campo entre aspas com separador dentro', () => {
    assert.deepEqual(parseCsv('nome,valor\n"Fone, bluetooth",12.30'), [
      ['nome', 'valor'],
      ['Fone, bluetooth', '12.30'],
    ]);
  });

  test('aspas dobradas viram uma aspa', () => {
    assert.deepEqual(parseCsv('a\n"tela de 15"" polegadas"'), [['a'], ['tela de 15" polegadas']]);
  });

  test('aceita CRLF e BOM, que e como o arquivo chega do Windows', () => {
    assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('ignora linhas em branco no meio', () => {
    assert.deepEqual(parseCsv('a,b\n\n1,2\n'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('mapHeaders', () => {
  test('reconhece as colunas em ingles', () => {
    const map = mapHeaders(['Category', 'Name', 'ASIN', 'Date Shipped', 'Ad Fees']);
    assert.equal(map.category, 0);
    assert.equal(map.name, 1);
    assert.equal(map.asin, 2);
    assert.equal(map.date, 3);
    assert.equal(map.earnings, 4);
  });

  test('reconhece as mesmas colunas em portugues', () => {
    const map = mapHeaders([
      'Categoria',
      'Nome',
      'ASIN',
      'Data de envio',
      'Taxas de publicidade',
    ]);
    assert.equal(map.earnings, 4);
    assert.equal(map.date, 3);
  });

  test('nao se importa com caixa nem espaco extra', () => {
    assert.equal(mapHeaders(['  AD FEES  ']).earnings, 0);
  });
});

describe('findHeaderRow', () => {
  test('pula as linhas de titulo que a Amazon poe antes da tabela', () => {
    const rows = [
      ['Relatorio de ganhos'],
      ['Periodo: 01/07/2026 a 31/07/2026'],
      [],
      ['Categoria', 'Nome', 'ASIN', 'Data de envio', 'Taxas de publicidade'],
      ['Eletronicos', 'Fone', 'B01', '05/07/2026', '12,30'],
    ].filter((row) => row.length > 0);

    assert.equal(findHeaderRow(rows), 2);
  });

  test('devolve -1 quando nao ha coluna de ganhos', () => {
    assert.equal(findHeaderRow([['a', 'b']]), -1);
  });
});

describe('parseDate', () => {
  test('ISO', () => {
    assert.equal(parseDate('2026-07-05', false)?.toISOString().slice(0, 10), '2026-07-05');
  });

  test('a mesma data com barra muda de significado com o idioma', () => {
    // Este e o erro que so aparece depois do dia 12 de cada mes e passa
    // despercebido ate a hora de declarar.
    assert.equal(parseDate('03/04/2026', true)?.toISOString().slice(0, 10), '2026-04-03');
    assert.equal(parseDate('03/04/2026', false)?.toISOString().slice(0, 10), '2026-03-04');
  });

  test('valor acima de 12 so pode ser dia, qualquer que seja o idioma', () => {
    assert.equal(parseDate('25/07/2026', false)?.toISOString().slice(0, 10), '2026-07-25');
    assert.equal(parseDate('07/25/2026', true)?.toISOString().slice(0, 10), '2026-07-25');
  });

  test('recusa data impossivel em vez de inventar', () => {
    assert.equal(parseDate('99/99/2026', true), null);
    assert.equal(parseDate('', true), null);
  });
});

describe('parseEarningsReport', () => {
  const relatorioPtBr = [
    'Categoria;Nome;ASIN;ID de rastreamento;Data de envio;Produtos enviados;Taxas de publicidade',
    'Eletronicos;Fone Bluetooth;B0ABC12345;meutag-20;05/07/2026;2;12,30',
    'Casa;Airfryer 5L;B0XYZ98765;meutag-20;18/07/2026;1;45,00',
  ].join('\n');

  test('le o relatorio brasileiro inteiro', () => {
    const { rows, warnings } = parseEarningsReport(relatorioPtBr, 'BRL');

    assert.equal(rows.length, 2);
    assert.deepEqual(warnings, []);

    assert.equal(rows[0].productExternalId, 'B0ABC12345');
    assert.equal(rows[0].productName, 'Fone Bluetooth');
    assert.equal(rows[0].amountCents, 1230);
    assert.equal(rows[0].currency, 'BRL');
    assert.equal(rows[0].quantity, 2);
    assert.equal(rows[0].category, 'Eletronicos');
    // Data de envio no formato brasileiro: 5 de julho, nao 7 de maio.
    assert.equal(rows[0].occurredAt.toISOString().slice(0, 10), '2026-07-05');
    assert.equal(rows[1].amountCents, 4500);
  });

  test('le o relatorio em ingles com virgula decimal americana', () => {
    const csv = [
      'Category,Name,ASIN,Date Shipped,Items Shipped,Ad Fees',
      'Electronics,Headphones,B0ABC12345,07/05/2026,1,"1,234.56"',
    ].join('\n');

    const { rows } = parseEarningsReport(csv, 'USD');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountCents, 123456);
    assert.equal(rows[0].currency, 'USD');
    assert.equal(rows[0].occurredAt.toISOString().slice(0, 10), '2026-07-05');
  });

  test('a mesma importacao duas vezes gera as mesmas chaves', () => {
    // E o que faz reenviar o relatorio do mes atualizar em vez de duplicar —
    // e reenviar e o fluxo normal, porque vendas pendentes viram aprovadas.
    const a = parseEarningsReport(relatorioPtBr, 'BRL').rows.map((row) => row.externalId);
    const b = parseEarningsReport(relatorioPtBr, 'BRL').rows.map((row) => row.externalId);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, 2);
  });

  test('duas vendas identicas no mesmo dia nao colapsam numa so', () => {
    const csv = [
      'Nome;ASIN;Data de envio;Taxas de publicidade',
      'Fone;B01;05/07/2026;12,30',
      'Fone;B01;05/07/2026;12,30',
    ].join('\n');

    const { rows } = parseEarningsReport(csv, 'BRL');
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].externalId, rows[1].externalId);
  });

  test('devolucao entra como estorno', () => {
    const csv = ['Nome;ASIN;Data de envio;Taxas de publicidade', 'Fone;B01;05/07/2026;-12,30'].join(
      '\n',
    );

    const { rows } = parseEarningsReport(csv, 'BRL');
    assert.equal(rows[0].status, 'refunded');
    assert.equal(rows[0].amountCents, -1230);
  });

  test('linha de total sem produto e ignorada', () => {
    // Ela traz o valor somado; guardar dobraria o mes inteiro.
    const csv = [
      'Nome;ASIN;Data de envio;Taxas de publicidade',
      'Fone;B01;05/07/2026;12,30',
      'Total;;05/07/2026;0,00',
    ].join('\n');

    const { rows } = parseEarningsReport(csv, 'BRL');
    assert.equal(rows.length, 1);
  });

  test('arquivo que nao e o relatorio explica o que fazer', () => {
    const { rows, warnings } = parseEarningsReport('coluna1,coluna2\n1,2', 'BRL');
    assert.equal(rows.length, 0);
    assert.match(warnings[0], /Relatorios > Ganhos/);
  });

  test('arquivo vazio nao quebra', () => {
    const { rows, warnings } = parseEarningsReport('', 'BRL');
    assert.equal(rows.length, 0);
    assert.equal(warnings.length, 1);
  });

  test('linha com data ilegivel vira aviso, sem derrubar o resto', () => {
    const csv = [
      'Nome;ASIN;Data de envio;Taxas de publicidade',
      'Fone;B01;quinta-feira;12,30',
      'Airfryer;B02;18/07/2026;45,00',
    ].join('\n');

    const { rows, warnings } = parseEarningsReport(csv, 'BRL');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].productExternalId, 'B02');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /quinta-feira/);
  });
});
