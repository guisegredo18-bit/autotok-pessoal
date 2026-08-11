import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountCents } from '@/lib/money';

/**
 * O cadastro manual existe por uma limitacao que nao tem contorno: a Hotmart
 * nao publica o marketplace de afiliados em API. O produto que voce escolheu
 * no site deles so chega ao painel se voce digitar — e sem produto na lista
 * nao ha o que virar video.
 *
 * O que se testa aqui e a leitura do preco, porque e o unico campo em que um
 * erro passa despercebido: nome errado voce ve, link errado voce percebe ao
 * clicar, mas "297,00" lido como R$ 2,97 so aparece semanas depois, quando a
 * comissao estimada nao bate com nada.
 */

describe('preco digitado no formulario', () => {
  test('formato brasileiro', () => {
    assert.equal(parseAmountCents('297,00'), 29700);
    assert.equal(parseAmountCents('R$ 1.997,00'), 199700);
  });

  test('formato americano, para produto em dolar', () => {
    assert.equal(parseAmountCents('47.00'), 4700);
    assert.equal(parseAmountCents('$1,997.00'), 199700);
  });

  test('valor redondo digitado sem centavos', () => {
    // Ninguem digita "297,00" no celular; digita "297".
    assert.equal(parseAmountCents('297'), 29700);
  });

  test('campo vazio nao vira zero', () => {
    // Zero significaria "produto de graca" e a comissao estimada sairia zerada
    // sem explicacao. Nulo deixa o painel dizer "preco nao informado".
    assert.equal(parseAmountCents(''), null);
    assert.equal(parseAmountCents('   '), null);
  });
});

describe('comissao estimada', () => {
  /** A mesma conta que `saveManualProduct` faz ao gravar. */
  function comissao(priceCents: number | null, rate: number | null): number | null {
    return priceCents != null && rate != null ? Math.round((priceCents * rate) / 100) : null;
  }

  test('percentual sobre o preco', () => {
    // 50% de 297,00 = 148,50 — o caso tipico da Hotmart.
    assert.equal(comissao(29700, 50), 14850);
  });

  test('arredonda para centavo inteiro', () => {
    // 33% de 47,00 = 15,51. Sem arredondar viraria 15.510000000000002.
    assert.equal(comissao(4700, 33), 1551);
  });

  test('sem preco ou sem percentual, nao estima', () => {
    // Estimar com meio dado produziria um numero que parece real e nao e.
    assert.equal(comissao(null, 50), null);
    assert.equal(comissao(29700, null), null);
  });
});
