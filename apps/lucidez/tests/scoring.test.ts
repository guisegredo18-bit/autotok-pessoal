import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreGoNoGo,
  scorePairs,
  scoreReaction,
  scoreSequence,
  scoreStroop,
  scoreTrails,
} from '../src/core/scoring.ts';

test('reacao: rapido e consistente pontua alto', () => {
  const r = scoreReaction({ medianRt: 260, sdRt: 30, anticipations: 0, lapses: 0, validTrials: 20, trials: 20 });
  assert.equal(r.valid, true);
  assert.ok(r.score > 85, `esperava nota alta, veio ${r.score}`);
});

test('reacao: lento e oscilante pontua baixo', () => {
  const r = scoreReaction({ medianRt: 610, sdRt: 260, anticipations: 0, lapses: 3, validTrials: 20, trials: 20 });
  assert.equal(r.valid, true);
  assert.ok(r.score < 25, `esperava nota baixa, veio ${r.score}`);
});

test('reacao: mesma mediana com mais oscilacao pontua menos', () => {
  const base = { medianRt: 350, anticipations: 0, lapses: 0, validTrials: 20, trials: 20 };
  const estavel = scoreReaction({ ...base, sdRt: 35 });
  const oscilante = scoreReaction({ ...base, sdRt: 160 });
  assert.ok(estavel.score > oscilante.score);
});

test('reacao: chutar antes do sinal invalida a medida', () => {
  const r = scoreReaction({ medianRt: 180, sdRt: 20, anticipations: 9, lapses: 0, validTrials: 11, trials: 20 });
  assert.equal(r.valid, false);
  assert.match(r.invalidReason ?? '', /chute/);
});

test('reacao: poucos toques validos invalidam', () => {
  const r = scoreReaction({ medianRt: 300, sdRt: 20, anticipations: 0, lapses: 0, validTrials: 4, trials: 20 });
  assert.equal(r.valid, false);
});

test('go/no-go: inibicao perfeita e rapida pontua alto', () => {
  const r = scoreGoNoGo({ goRt: 380, goTrials: 42, omissions: 0, nogoTrials: 18, commissions: 0 });
  assert.equal(r.valid, true);
  assert.ok(r.score > 85, `veio ${r.score}`);
});

test('go/no-go: falhar a inibicao derruba mais que ser lento', () => {
  const lento = scoreGoNoGo({ goRt: 700, goTrials: 42, omissions: 0, nogoTrials: 18, commissions: 0 });
  const impulsivo = scoreGoNoGo({ goRt: 380, goTrials: 42, omissions: 0, nogoTrials: 18, commissions: 9 });
  assert.ok(impulsivo.score < lento.score, 'metade das falhas de inibicao deve custar mais que a lentidao');
});

test('go/no-go: tocar em tudo e detectado como invalido', () => {
  const r = scoreGoNoGo({ goRt: 250, goTrials: 42, omissions: 0, nogoTrials: 18, commissions: 17 });
  assert.equal(r.valid, false);
  assert.match(r.invalidReason ?? '', /toque em tudo/);
});

test('sequencia: span maior pontua mais, monotonamente', () => {
  const scores = [3, 4, 5, 6, 7, 8].map(
    (maxSpan) => scoreSequence({ maxSpan, correctTrials: 6, trials: 10 }).score,
  );
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i]! > scores[i - 1]!, `span ${i + 3} deveria valer mais que ${i + 2}`);
  }
});

test('sequencia: menos de tres tentativas nao vale medida', () => {
  assert.equal(scoreSequence({ maxSpan: 5, correctTrials: 2, trials: 2 }).valid, false);
});

test('pares: menos jogadas para os mesmos pares pontua mais', () => {
  const eficiente = scorePairs({ pairs: 6, moves: 10, durationMs: 40_000, completed: 6 });
  const custoso = scorePairs({ pairs: 6, moves: 26, durationMs: 40_000, completed: 6 });
  assert.ok(eficiente.score > custoso.score);
  assert.ok(eficiente.score > 70);
});

test('pares: jogo abandonado nao entra na conta', () => {
  const r = scorePairs({ pairs: 6, moves: 8, durationMs: 20_000, completed: 4 });
  assert.equal(r.valid, false);
});

test('stroop: menos interferencia pontua mais', () => {
  const comum = {
    congruentTrials: 24,
    incongruentTrials: 24,
    congruentCorrect: 24,
    incongruentCorrect: 24,
    congruentRt: 800,
  };
  const pouca = scoreStroop({ ...comum, incongruentRt: 850 });
  const muita = scoreStroop({ ...comum, incongruentRt: 1300 });
  assert.ok(pouca.score > muita.score);
});

test('stroop: acerto perto do acaso invalida', () => {
  const r = scoreStroop({
    congruentTrials: 24,
    incongruentTrials: 24,
    congruentCorrect: 8,
    incongruentCorrect: 6,
    congruentRt: 900,
    incongruentRt: 1100,
  });
  assert.equal(r.valid, false);
  assert.match(r.invalidReason ?? '', /instru/);
});

test('trilhas: parte B inacabada invalida', () => {
  const r = scoreTrails({ timeAMs: 30_000, errorsA: 0, timeBMs: 0, errorsB: 0, completedB: 0 });
  assert.equal(r.valid, false);
});

test('trilhas: tempo rapido demais para ser humano nao vira nota alta', () => {
  // Quinze alvos em 1,7 s nao acontece com um dedo. Sem esse piso, um toque
  // fantasma renderia a melhor nota que a pessoa ja teve.
  const r = scoreTrails({
    timeAMs: 1700, errorsA: 0, timeBMs: 2100, errorsB: 0, completedB: 1, nodesA: 15, nodesB: 16,
  });
  assert.equal(r.valid, false);
  assert.match(r.invalidReason ?? '', /rápidos demais/);
});

test('trilhas: o piso acompanha o numero de alvos', () => {
  // Com poucos alvos, um tempo curto continua plausivel.
  const poucos = scoreTrails({
    timeAMs: 2000, errorsA: 0, timeBMs: 2500, errorsB: 0, completedB: 1, nodesA: 6, nodesB: 8,
  });
  assert.equal(poucos.valid, true);
});

test('trilhas: custo de alternancia menor pontua mais', () => {
  const fluido = scoreTrails({ timeAMs: 25_000, errorsA: 0, timeBMs: 38_000, errorsB: 0, completedB: 1 });
  const travado = scoreTrails({ timeAMs: 25_000, errorsA: 0, timeBMs: 95_000, errorsB: 0, completedB: 1 });
  assert.ok(fluido.score > travado.score);
  assert.ok(fluido.score > 70, `veio ${fluido.score}`);
});

test('trilhas: erros descontam da nota', () => {
  const limpo = scoreTrails({ timeAMs: 25_000, errorsA: 0, timeBMs: 45_000, errorsB: 0, completedB: 1 });
  const errado = scoreTrails({ timeAMs: 25_000, errorsA: 2, timeBMs: 45_000, errorsB: 3, completedB: 1 });
  assert.ok(Math.abs(limpo.score - errado.score - 12.5) < 0.2, 'cinco erros valem 12,5 pontos');
});

test('todas as notas ficam dentro de 0 a 100', () => {
  const extremos = [
    scoreReaction({ medianRt: 50, sdRt: 0, anticipations: 0, lapses: 0, validTrials: 20, trials: 20 }),
    scoreReaction({ medianRt: 5000, sdRt: 4000, anticipations: 0, lapses: 20, validTrials: 20, trials: 20 }),
    scoreTrails({ timeAMs: 300_000, errorsA: 40, timeBMs: 600_000, errorsB: 40, completedB: 1 }),
    scorePairs({ pairs: 6, moves: 6, durationMs: 1000, completed: 6 }),
  ];
  for (const r of extremos) {
    assert.ok(r.score >= 0 && r.score <= 100, `nota fora da escala: ${r.score}`);
  }
});
