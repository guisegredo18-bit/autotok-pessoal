import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, linScore, linearRegression, mean, median, movingAverage, sd } from '../src/core/stats.ts';

test('clamp segura nos dois extremos', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('median usa o valor do meio e a media dos dois centrais', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test('sd exige ao menos dois valores', () => {
  assert.equal(sd([7]), 0);
  assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});

test('linScore mapeia nos dois sentidos e satura', () => {
  // Maior e melhor.
  assert.equal(linScore(9, 2, 9), 100);
  assert.equal(linScore(2, 2, 9), 0);
  // Menor e melhor (tempo de reacao).
  assert.equal(linScore(230, 650, 230), 100);
  assert.equal(linScore(650, 650, 230), 0);
  assert.equal(linScore(1200, 650, 230), 0, 'fora da faixa satura em 0');
  assert.ok(Math.abs(linScore(440, 650, 230) - 50) < 0.001);
});

test('linearRegression recupera uma reta exata', () => {
  const fit = linearRegression([0, 1, 2, 3, 4], [10, 12, 14, 16, 18]);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope - 2) < 1e-9);
  assert.ok(Math.abs(fit.intercept - 10) < 1e-9);
  assert.ok(Math.abs(fit.r2 - 1) < 1e-9);
  assert.ok(fit.slopeStdErr < 1e-9, 'reta perfeita nao tem erro no coeficiente');
});

test('linearRegression recusa amostra pequena ou x constante', () => {
  assert.equal(linearRegression([1, 2], [1, 2]), null);
  assert.equal(linearRegression([3, 3, 3], [1, 2, 3]), null);
});

test('movingAverage suaviza usando janelas incompletas no comeco', () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5]);
});

test('mean de lista vazia nao quebra', () => {
  assert.equal(mean([]), 0);
});
