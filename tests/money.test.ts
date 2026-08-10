import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_MAX_AGE_MS,
  formatMoney,
  isStale,
  parseAmountCents,
  parseRates,
  toUsdCents,
} from '@/lib/money';

/**
 * Dinheiro e a parte do painel que nao pode errar por um centavo: o numero da
 * tela vai para a declaracao de imposto. Os testes aqui cobrem as tres formas
 * de errar que importam — arredondar, ler o numero no formato errado, e
 * converter sem cotacao.
 */

describe('parseAmountCents', () => {
  test('le o formato brasileiro', () => {
    assert.equal(parseAmountCents('1.234,56'), 123456);
    assert.equal(parseAmountCents('R$ 12,30'), 1230);
    assert.equal(parseAmountCents('0,07'), 7);
  });

  test('le o formato americano', () => {
    assert.equal(parseAmountCents('1,234.56'), 123456);
    assert.equal(parseAmountCents('$12.30'), 1230);
  });

  test('tres casas depois do separador e milhar, nao centavo', () => {
    // "1.234" no relatorio brasileiro e mil duzentos e trinta e quatro reais.
    // Ler como 1,234 transformaria mil reais em um real — o erro que so
    // aparece na hora de conferir com o extrato.
    assert.equal(parseAmountCents('1.234'), 123400);
    assert.equal(parseAmountCents('1,234'), 123400);
  });

  test('numero inteiro sem separador', () => {
    assert.equal(parseAmountCents('42'), 4200);
  });

  test('negativo e o que a Amazon usa para devolucao', () => {
    assert.equal(parseAmountCents('-12,30'), -1230);
  });

  test('celula vazia ou sem numero nao vira zero', () => {
    // Zero somaria silenciosamente na hora de totalizar; null a importacao
    // sabe pular.
    assert.equal(parseAmountCents(''), null);
    assert.equal(parseAmountCents('   '), null);
    assert.equal(parseAmountCents('N/A'), null);
  });
});

describe('toUsdCents', () => {
  test('dolar para dolar nao passa por conversao nenhuma', () => {
    assert.deepEqual(toUsdCents(1234, 'USD', {}), { usdCents: 1234, rate: 1 });
  });

  test('converte pela cotacao informada', () => {
    // 54,00 BRL a 5,40 por dolar = 10,00 USD.
    assert.deepEqual(toUsdCents(5400, 'BRL', { BRL: 5.4 }), { usdCents: 1000, rate: 5.4 });
  });

  test('moeda sem cotacao devolve null, nunca zero', () => {
    assert.equal(toUsdCents(5400, 'JPY', { BRL: 5.4 }), null);
    assert.equal(toUsdCents(5400, 'BRL', { BRL: 0 }), null);
  });

  test('a moeda pode vir minuscula ou com espaco', () => {
    assert.deepEqual(toUsdCents(5400, ' brl ', { BRL: 5.4 }), { usdCents: 1000, rate: 5.4 });
  });
});

describe('parseRates', () => {
  test('aceita a resposta boa', () => {
    const rates = parseRates({ result: 'success', rates: { BRL: 5.4, EUR: 0.92 } });
    assert.deepEqual(rates, { BRL: 5.4, EUR: 0.92 });
  });

  test('recusa payload sem BRL', () => {
    // Uma pagina de erro que responde 200 costuma cair aqui — e usar seu
    // conteudo faria a importacao gravar valores em dolar sem sentido.
    assert.equal(parseRates({ result: 'success', rates: { EUR: 0.92 } }), null);
  });

  test('descarta cotacoes invalidas em vez de propagar', () => {
    const rates = parseRates({ rates: { BRL: 5.4, XXX: 0, YYY: -1 } });
    assert.deepEqual(rates, { BRL: 5.4 });
  });

  test('recusa resultado de erro e lixo', () => {
    assert.equal(parseRates({ result: 'error' }), null);
    assert.equal(parseRates(null), null);
    assert.equal(parseRates('<html>'), null);
  });
});

describe('isStale', () => {
  const now = Date.parse('2026-08-10T12:00:00Z');

  test('cotacao de hoje serve', () => {
    assert.equal(isStale({ rates: { BRL: 5 }, fetchedAt: '2026-08-10T06:00:00Z' }, now), false);
  });

  test('cotacao de mais de um dia e velha', () => {
    const old = new Date(now - FX_MAX_AGE_MS - 1000).toISOString();
    assert.equal(isStale({ rates: { BRL: 5 }, fetchedAt: old }, now), true);
  });

  test('sem cotacao e data invalida contam como velhas', () => {
    assert.equal(isStale(null, now), true);
    assert.equal(isStale({ rates: {}, fetchedAt: 'ontem' }, now), true);
  });
});

describe('formatMoney', () => {
  test('valor nulo aparece como travessao, nao como zero', () => {
    assert.equal(formatMoney(null), '—');
    assert.equal(formatMoney(undefined), '—');
  });

  test('moeda desconhecida nao derruba a tela', () => {
    assert.match(formatMoney(1234, 'XPTO'), /XPTO 12\.34/);
  });
});
