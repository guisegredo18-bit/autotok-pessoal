import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTrend } from '@/lib/trends/scan';
import { parseCount, slopeOf } from '@/lib/trends/creative-center';
import type { RawTrend } from '@/lib/trends/types';

function trend(patch: Partial<RawTrend> = {}): RawTrend {
  return { kind: 'hashtag', name: 'teste', country: 'BR', ...patch };
}

describe('parseCount', () => {
  test('entende os sufixos abreviados do Creative Center', () => {
    assert.equal(parseCount('1.2M'), 1_200_000);
    assert.equal(parseCount('340K'), 340_000);
    assert.equal(parseCount('2B'), 2_000_000_000);
    assert.equal(parseCount('850'), 850);
  });

  test('aceita virgula como separador decimal', () => {
    assert.equal(parseCount('1,5M'), 1_500_000);
  });

  test('devolve numeros ja numericos sem alterar', () => {
    assert.equal(parseCount(4321), 4321);
  });

  test('devolve undefined em vez de NaN quando nao reconhece', () => {
    // NaN se propagaria silenciosamente ate o score; undefined faz o
    // chamador cair no caminho de "sem dado".
    assert.equal(parseCount('varios'), undefined);
    assert.equal(parseCount(null), undefined);
    assert.equal(parseCount({}), undefined);
  });
});

describe('slopeOf', () => {
  test('detecta tendencia em alta', () => {
    const slope = slopeOf([10, 12, 15, 30, 45, 60].map((value) => ({ value })));
    assert.ok(slope !== undefined && slope > 1, `esperava crescimento, veio ${slope}`);
  });

  test('detecta tendencia em queda', () => {
    const slope = slopeOf([60, 50, 40, 20, 10, 5].map((value) => ({ value })));
    assert.ok(slope !== undefined && slope < 0, `esperava queda, veio ${slope}`);
  });

  test('serie curta demais nao vira sinal', () => {
    assert.equal(slopeOf([{ value: 1 }, { value: 2 }]), undefined);
    assert.equal(slopeOf(undefined), undefined);
    assert.equal(slopeOf('nao e uma serie'), undefined);
  });
});

describe('scoreTrend', () => {
  test('mantem a nota sempre entre 0 e 100', () => {
    const extremos = [
      trend({ viewCount: 0, growthRate: -5, rank: 999 }),
      trend({ viewCount: 1e12, growthRate: 50, rank: 1 }),
    ];
    for (const t of extremos) {
      const score = scoreTrend(t);
      assert.ok(score >= 0 && score <= 100, `nota fora da faixa: ${score}`);
    }
  });

  test('crescimento pesa mais que volume', () => {
    // A aposta do produto: pegar o que ainda esta subindo, nao o que ja
    // explodiu. Se esta relacao inverter, o app passa a sugerir assunto morto.
    const explodiuEParou = scoreTrend(trend({ viewCount: 500_000_000, growthRate: 0, rank: 1 }));
    const menorMasSubindo = scoreTrend(trend({ viewCount: 2_000_000, growthRate: 1.2, rank: 1 }));
    assert.ok(
      menorMasSubindo > explodiuEParou,
      `subindo=${menorMasSubindo} deveria superar estagnado=${explodiuEParou}`,
    );
  });

  test('posicao melhor no ranking rende nota maior', () => {
    const base = { viewCount: 1_000_000, growthRate: 0.3 };
    assert.ok(scoreTrend(trend({ ...base, rank: 1 })) > scoreTrend(trend({ ...base, rank: 40 })));
  });

  test('sem nenhum dado a nota nao explode', () => {
    const score = scoreTrend(trend());
    assert.ok(Number.isFinite(score) && score >= 0);
  });
});
