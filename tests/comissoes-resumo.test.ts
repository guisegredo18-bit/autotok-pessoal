import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, byProduct, projectMonthly, totals } from '@/lib/afiliados/resumo';
import { rankScore, scoreProduct } from '@/lib/afiliados/score';

/**
 * A aritmetica do painel.
 *
 * O pedido era "projecao com base nos dados reais importados, nao simulados".
 * Estes testes sao o que impede a projecao de virar chute com cara de
 * precisao: o que entra na soma, o que fica de fora, e quando o painel deve
 * admitir que nao tem base para projetar nada.
 */

const AGORA = new Date('2026-08-10T12:00:00Z');

function comissao(overrides: Partial<Parameters<typeof totals>[0][number]> = {}) {
  return {
    source: 'hotmart',
    status: 'approved',
    amountUsdCents: 1000,
    occurredAt: new Date(AGORA.getTime() - 5 * DAY_MS),
    ...overrides,
  };
}

describe('totals', () => {
  test('soma o que esta aprovado', () => {
    const soma = totals([comissao(), comissao({ amountUsdCents: 2500 })], AGORA);
    assert.equal(soma.approvedUsdCents, 3500);
    assert.equal(soma.last30UsdCents, 3500);
  });

  test('pendente e estorno ficam fora do aprovado', () => {
    const soma = totals(
      [
        comissao(),
        comissao({ status: 'pending', amountUsdCents: 5000 }),
        comissao({ status: 'refunded', amountUsdCents: -700 }),
        comissao({ status: 'cancelled', amountUsdCents: 300 }),
      ],
      AGORA,
    );

    assert.equal(soma.approvedUsdCents, 1000);
    assert.equal(soma.pendingUsdCents, 5000);
    // Estorno e cancelamento aparecem em valor absoluto: a tela mostra "quanto
    // voce perdeu", e um numero negativo ali confunde mais do que informa.
    assert.equal(soma.refundedUsdCents, 1000);
  });

  test('venda de 40 dias atras conta no total mas nao nos 30 dias', () => {
    const soma = totals(
      [comissao({ occurredAt: new Date(AGORA.getTime() - 40 * DAY_MS) })],
      AGORA,
    );
    assert.equal(soma.approvedUsdCents, 1000);
    assert.equal(soma.last30UsdCents, 0);
  });

  test('comissao sem cotacao e contada a parte, nao como zero', () => {
    // Somar como zero faria o total parecer completo estando incompleto. A
    // tela mostra "N comissoes sem conversao" a partir daqui.
    const soma = totals([comissao(), comissao({ amountUsdCents: null })], AGORA);
    assert.equal(soma.approvedUsdCents, 1000);
    assert.equal(soma.withoutRate, 1);
  });

  test('separa por fonte', () => {
    const soma = totals(
      [comissao({ source: 'amazon', amountUsdCents: 700 }), comissao({ source: 'hotmart' })],
      AGORA,
    );
    assert.deepEqual(soma.bySource, { amazon: 700, hotmart: 1000 });
  });
});

describe('projectMonthly', () => {
  test('media diaria do periodo observado, vezes 30', () => {
    // Duas vendas de US$ 10, a primeira ha 20 dias: 20 centavos/dia -> 600.
    const projecao = projectMonthly(
      [
        comissao({ occurredAt: new Date(AGORA.getTime() - 20 * DAY_MS) }),
        comissao({ occurredAt: new Date(AGORA.getTime() - 1 * DAY_MS) }),
      ],
      AGORA,
    );

    assert.equal(projecao.basisDays, 20);
    assert.equal(projecao.monthlyUsdCents, 3000);
    assert.equal(projecao.confidence, 'firme');
  });

  test('nao divide por 30 quem so tem tres dias de historico', () => {
    // Dividir por 30 diria que voce quase nao ganha nada — o erro que faz a
    // pessoa desistir do produto que estava indo bem.
    const projecao = projectMonthly(
      [comissao({ occurredAt: new Date(AGORA.getTime() - 3 * DAY_MS) })],
      AGORA,
    );

    assert.equal(projecao.basisDays, 3);
    assert.equal(projecao.monthlyUsdCents, 10000);
    // Tres dias projetam, mas o painel precisa dizer que o numero balanca.
    assert.equal(projecao.confidence, 'fraca');
  });

  test('sem nada aprovado nao ha projecao — e nao e zero', () => {
    const projecao = projectMonthly([comissao({ status: 'pending' })], AGORA);
    assert.equal(projecao.monthlyUsdCents, null);
    assert.equal(projecao.confidence, 'sem-dados');
  });

  test('historico so antigo nao vira projecao de zero', () => {
    // Afirmar "voce vai ganhar US$ 0" quando talvez so falte importar o mes
    // corrente e forte demais para o que o painel sabe.
    const projecao = projectMonthly(
      [comissao({ occurredAt: new Date(AGORA.getTime() - 90 * DAY_MS) })],
      AGORA,
    );
    assert.equal(projecao.monthlyUsdCents, null);
    assert.equal(projecao.confidence, 'sem-dados');
  });

  test('comissao sem conversao para dolar nao entra na projecao', () => {
    const projecao = projectMonthly([comissao({ amountUsdCents: null })], AGORA);
    assert.equal(projecao.confidence, 'sem-dados');
  });
});

describe('byProduct', () => {
  test('agrupa por produto e ordena pelo que mais paga', () => {
    const linhas = byProduct([
      { ...comissao(), productExternalId: 'B01', productName: 'Fone' },
      { ...comissao(), productExternalId: 'B01', productName: 'Fone' },
      { ...comissao({ amountUsdCents: 5000 }), productExternalId: 'B02', productName: 'Airfryer' },
    ]);

    assert.equal(linhas[0].name, 'Airfryer');
    assert.equal(linhas[0].usdCents, 5000);
    assert.equal(linhas[1].usdCents, 2000);
    assert.equal(linhas[1].sales, 2);
  });

  test('o mesmo codigo em fontes diferentes nao se mistura', () => {
    const linhas = byProduct([
      { ...comissao({ source: 'amazon' }), productExternalId: 'X', productName: 'Um' },
      { ...comissao({ source: 'hotmart' }), productExternalId: 'X', productName: 'Outro' },
    ]);
    assert.equal(linhas.length, 2);
  });

  test('produto sem codigo agrupa pelo nome', () => {
    const linhas = byProduct([
      { ...comissao(), productExternalId: null, productName: 'Curso' },
      { ...comissao(), productExternalId: null, productName: 'Curso' },
    ]);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].sales, 2);
  });
});

describe('scoreProduct', () => {
  test('ranking melhor vale nota maior', () => {
    assert.ok(rankScore(10) > rankScore(10_000));
    assert.equal(rankScore(1), 100);
    assert.equal(rankScore(1_000_000), 0);
  });

  test('a temperatura da Hotmart e as estrelas da Amazon viram a mesma escala', () => {
    // Sem isso a lista misturada nao poderia ser ordenada: temperatura 150 e
    // 5 estrelas sao a mesma coisa dita em unidades diferentes.
    assert.equal(scoreProduct('hotmart', { rating: 150 }), 100);
    assert.equal(scoreProduct('amazon', { rating: 5 }), 100);
  });

  test('sinal ausente nao vira nota zero, so sai da conta', () => {
    // Um produto sem ranking nao pode ser empurrado para o fim da lista por
    // um dado que a plataforma simplesmente nao informa.
    const comRanking = scoreProduct('amazon', { salesRank: 100, rating: null });
    const soRanking = scoreProduct('amazon', { salesRank: 100 });
    assert.equal(comRanking, soRanking);
  });

  test('produto sem sinal nenhum fica com zero', () => {
    assert.equal(scoreProduct('amazon', {}), 0);
    assert.equal(scoreProduct('amazon', { salesRank: null, rating: null }), 0);
  });

  test('a nota fica sempre entre 0 e 100', () => {
    const alta = scoreProduct('hotmart', {
      salesRank: 1,
      rating: 300,
      reviewCount: 1_000_000,
      commissionRate: 90,
    });
    assert.ok(alta >= 0 && alta <= 100, `nota fora da faixa: ${alta}`);
  });
});
