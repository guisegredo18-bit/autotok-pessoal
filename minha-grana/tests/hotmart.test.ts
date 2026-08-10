import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCommission,
  normalizeProduct,
  readPage,
  toDate,
  toStatus,
} from '@/lib/hotmart/normalize';

/**
 * Tudo que este arquivo protege e uma coisa so: a mesma venda lista quanto
 * cada parte ganhou (produtor, coprodutor, afiliado, plataforma). Somar tudo
 * faria o painel exibir o faturamento do produto como se fosse o seu ganho —
 * um numero varias vezes maior que a realidade, e com cara de exato.
 */

/** Uma venda no formato do endpoint /sales/commissions. */
function venda(overrides: Record<string, unknown> = {}) {
  return {
    transaction: 'HP12345678',
    product: { id: 987, name: 'Curso de Ingles' },
    purchase: {
      transaction: 'HP12345678',
      approved_date: Date.parse('2026-07-05T14:00:00Z'),
      status: 'APPROVED',
      price: { value: 497, currency_code: 'BRL' },
    },
    commissions: [
      { source: 'PRODUCER', value: 300, currency_code: 'BRL' },
      { source: 'AFFILIATE', value: 148.5, currency_code: 'BRL' },
      { source: 'MARKETPLACE', value: 48.5, currency_code: 'BRL' },
    ],
    ...overrides,
  };
}

describe('normalizeCommission', () => {
  test('pega so a comissao do papel pedido', () => {
    const afiliado = normalizeCommission(venda(), 'AFFILIATE');
    assert.equal(afiliado?.amountCents, 14850);

    const produtor = normalizeCommission(venda(), 'PRODUCER');
    assert.equal(produtor?.amountCents, 30000);
  });

  test('venda sem comissao no seu papel e descartada', () => {
    // Vendas de outras pessoas aparecem na resposta; guardar como se fosse sua
    // inflaria o total sem deixar rastro.
    assert.equal(normalizeCommission(venda(), 'COPRODUCER'), null);
  });

  test('o papel entra na chave, para nao colidir na mesma transacao', () => {
    const afiliado = normalizeCommission(venda(), 'AFFILIATE');
    const produtor = normalizeCommission(venda(), 'PRODUCER');
    assert.equal(afiliado?.externalId, 'HP12345678:affiliate');
    assert.notEqual(afiliado?.externalId, produtor?.externalId);
  });

  test('le os campos do produto e a moeda', () => {
    const row = normalizeCommission(venda(), 'AFFILIATE');
    assert.equal(row?.source, 'hotmart');
    assert.equal(row?.productExternalId, '987');
    assert.equal(row?.productName, 'Curso de Ingles');
    assert.equal(row?.currency, 'BRL');
    assert.equal(row?.occurredAt.toISOString(), '2026-07-05T14:00:00.000Z');
  });

  test('aceita o formato de uma comissao so, ja filtrada pelo token', () => {
    const row = normalizeCommission(
      {
        transaction: 'HP99',
        product: { id: 1, name: 'Ebook' },
        purchase: {
          approved_date: Date.parse('2026-07-05T00:00:00Z'),
          status: 'APPROVED',
          commission: { value: 27.9, currency_code: 'BRL' },
        },
      },
      'AFFILIATE',
    );

    assert.equal(row?.amountCents, 2790);
  });

  test('cai para BRL quando a moeda nao vem em lugar nenhum', () => {
    const row = normalizeCommission(
      {
        transaction: 'HP99',
        product: { id: 1, name: 'Ebook' },
        purchase: { approved_date: 1_780_000_000_000, status: 'APPROVED' },
        commissions: [{ source: 'AFFILIATE', value: 10 }],
      },
      'AFFILIATE',
    );

    assert.equal(row?.currency, 'BRL');
  });

  test('sem transacao ou sem data nao vira linha', () => {
    // Sem transacao nao ha chave estavel, e reimportar duplicaria; sem data a
    // venda nao entra em periodo nenhum e some das somas de 30 dias.
    assert.equal(normalizeCommission(venda({ transaction: null, purchase: {} }), 'AFFILIATE'), null);
    assert.equal(
      normalizeCommission(
        { transaction: 'HP1', commissions: [{ source: 'AFFILIATE', value: 10 }] },
        'AFFILIATE',
      ),
      null,
    );
  });

  test('lixo nao derruba, so nao vira linha', () => {
    assert.equal(normalizeCommission(null, 'AFFILIATE'), null);
    assert.equal(normalizeCommission('texto', 'AFFILIATE'), null);
  });

  test('valor quebrado nao perde centavo', () => {
    const row = normalizeCommission(
      venda({ commissions: [{ source: 'AFFILIATE', value: 148.5, currency_code: 'BRL' }] }),
      'AFFILIATE',
    );
    assert.equal(row?.amountCents, 14850);
  });
});

describe('toStatus', () => {
  test('aprovada', () => {
    assert.equal(toStatus('APPROVED'), 'approved');
    assert.equal(toStatus('COMPLETE'), 'approved');
  });

  test('estorno e cancelamento nao se misturam', () => {
    assert.equal(toStatus('REFUNDED'), 'refunded');
    assert.equal(toStatus('CHARGEBACK'), 'refunded');
    assert.equal(toStatus('CANCELED'), 'cancelled');
  });

  test('o que ainda nao resolveu conta como pendente', () => {
    // Inclui status que a Hotmart ainda nem criou: melhor "aguardando" do que
    // somar como recebido dinheiro que talvez nao venha.
    assert.equal(toStatus('WAITING_PAYMENT'), 'pending');
    assert.equal(toStatus('STATUS_QUE_NAO_EXISTE'), 'pending');
    assert.equal(toStatus(undefined), 'pending');
  });
});

describe('toDate', () => {
  test('milissegundos, que e o padrao da Hotmart', () => {
    assert.equal(toDate(1_780_000_000_000)?.getTime(), 1_780_000_000_000);
  });

  test('segundos sao reconhecidos e nao caem em 1970', () => {
    assert.equal(toDate(1_780_000_000)?.getTime(), 1_780_000_000_000);
  });

  test('texto ISO tambem serve', () => {
    assert.equal(toDate('2026-07-05T14:00:00Z')?.toISOString(), '2026-07-05T14:00:00.000Z');
  });

  test('nada legivel devolve null', () => {
    assert.equal(toDate(0), null);
    assert.equal(toDate('nunca'), null);
    assert.equal(toDate(undefined), null);
  });
});

describe('normalizeProduct', () => {
  test('le preco, comissao e temperatura', () => {
    const produto = normalizeProduct({
      id: 'A123',
      name: 'Curso de Violao',
      price: { value: 297, currency_code: 'BRL' },
      commission_percentage: 50,
      temperature: 120,
      category: 'Musica',
    });

    assert.equal(produto?.source, 'hotmart');
    assert.equal(produto?.priceCents, 29700);
    assert.equal(produto?.commissionRate, 50);
    // 50% de 297,00 = 148,50.
    assert.equal(produto?.commissionCents, 14850);
    assert.equal(produto?.rating, 120);
    assert.equal(produto?.category, 'Musica');
  });

  test('produto sem id ou sem nome nao entra', () => {
    assert.equal(normalizeProduct({ name: 'Sem id' }), null);
    assert.equal(normalizeProduct({ id: 'A1' }), null);
  });
});

describe('readPage', () => {
  test('le itens e o token da proxima pagina', () => {
    const page = readPage({ items: [1, 2], page_info: { next_page_token: 'abc' } });
    assert.deepEqual(page.items, [1, 2]);
    assert.equal(page.nextPageToken, 'abc');
  });

  test('resposta sem itens nao quebra o laco de paginacao', () => {
    assert.deepEqual(readPage({}), { items: [], nextPageToken: null });
    assert.deepEqual(readPage(null), { items: [], nextPageToken: null });
  });

  test('aceita array cru e a chave `data`', () => {
    assert.deepEqual(readPage([1, 2]).items, [1, 2]);
    assert.deepEqual(readPage({ data: [3] }).items, [3]);
  });
});
