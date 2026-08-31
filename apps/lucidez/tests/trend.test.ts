import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDomain,
  analyzeOverall,
  analyzeSeries,
  buildDayPoints,
  buildInsights,
  seriesFor,
  type SeriesPoint,
} from '../src/core/trend.ts';
import type { CheckIn, DayPoint } from '../src/core/types.ts';
import { days, makeResult, makeSession } from './helpers.ts';

function series(scores: number[]): SeriesPoint[] {
  const keys = days(scores.length);
  return scores.map((score, i) => ({
    date: keys[i]!,
    time: Date.UTC(2026, 0, 1 + i),
    score,
  }));
}

test('buildDayPoints agrega por dominio e ignora bloco desafio', () => {
  const [d1] = days(1);
  const s = makeSession(d1!);
  const points = buildDayPoints(
    [s],
    [
      makeResult(s, 'reacao', 80),
      makeResult(s, 'pares', 60),
      makeResult(s, 'pares', 100, { block: 'desafio' }),
    ],
  );

  assert.equal(points.length, 1);
  assert.equal(points[0]!.scores.velocidade, 80);
  assert.equal(points[0]!.scores.memoria_visual, 60, 'o bloco desafio nao pode entrar na media');
  assert.equal(points[0]!.overall, 70);
});

test('buildDayPoints descarta resultados invalidos e sessoes sem resultado', () => {
  const [d1, d2] = days(2);
  const comLixo = makeSession(d1!);
  const vazia = makeSession(d2!);
  const points = buildDayPoints(
    [comLixo, vazia],
    [makeResult(comLixo, 'reacao', 0, { valid: false, invalidReason: 'chute' }), makeResult(comLixo, 'stroop', 55)],
  );

  assert.equal(points.length, 1, 'sessao sem resultado valido nao vira ponto');
  assert.equal(points[0]!.scores.velocidade, undefined);
  assert.equal(points[0]!.scores.atencao, 55);
});

test('buildDayPoints ordena por data mesmo com entrada baguncada', () => {
  const [d1, d2, d3] = days(3);
  const a = makeSession(d1!);
  const b = makeSession(d2!);
  const c = makeSession(d3!);
  const points = buildDayPoints(
    [c, a, b],
    [makeResult(a, 'reacao', 1), makeResult(b, 'reacao', 2), makeResult(c, 'reacao', 3)],
  );
  assert.deepEqual(
    points.map((p) => p.scores.velocidade),
    [1, 2, 3],
  );
});

test('poucas sessoes ficam em "formando base" e dizem quantas faltam', () => {
  const v = analyzeSeries(series([70, 71, 69, 72]));
  assert.equal(v.status, 'formando_base');
  assert.equal(v.sessionsToBaseline, 4, 'faltam 4 para as 8 sessoes minimas');
  assert.equal(v.z, null, 'sem base nao existe z');
});

test('serie vazia e "sem dados"', () => {
  assert.equal(analyzeSeries([]).status, 'sem_dados');
});

test('desempenho constante fica estavel', () => {
  const v = analyzeSeries(series([68, 72, 70, 71, 69, 69, 71, 70, 72, 68]));
  assert.equal(v.status, 'estavel');
  assert.ok(Math.abs(v.z ?? 99) < 1);
});

test('queda grande e classificada como queda consistente', () => {
  const v = analyzeSeries(series([68, 72, 70, 71, 69, 44, 41, 40, 43, 39]));
  assert.equal(v.status, 'queda_forte');
  assert.ok((v.z ?? 0) < -2);
  assert.equal(v.baseline?.n, 5);
  assert.ok(Math.abs((v.baseline?.center ?? 0) - 70) < 0.001);
});

test('melhora consistente e reconhecida', () => {
  const v = analyzeSeries(series([50, 52, 48, 51, 49, 68, 70, 72, 69, 71]));
  assert.equal(v.status, 'melhora_forte');
  assert.ok((v.z ?? 0) > 2);
});

test('piso do desvio impede que regularidade vire alarme falso', () => {
  // Base perfeitamente identica: sem o piso, o desvio seria zero e qualquer
  // oscilacao de tres pontos daria z infinito.
  const v = analyzeSeries(series([70, 70, 70, 70, 70, 73, 68, 71, 69, 72]));
  assert.equal(v.baseline?.sd, 4);
  assert.equal(v.status, 'estavel');
});

test('um unico dia ruim nao derruba o veredito', () => {
  const v = analyzeSeries(series([70, 68, 72, 69, 71, 70, 71, 30, 70, 69]));
  assert.equal(v.status, 'estavel');
});

test('inclinacao so aparece quando se destaca do ruido', () => {
  const ruido = analyzeSeries(series([70, 40, 90, 55, 75, 35, 88, 50, 72, 60]));
  assert.equal(ruido.slopePerWeek, null, 'serrilhado nao vira tendencia');

  const descida = analyzeSeries(series([80, 78, 76, 74, 72, 70, 68, 66, 64, 62]));
  assert.ok(descida.slopePerWeek !== null);
  assert.ok(descida.slopePerWeek! < 0);
  assert.ok(Math.abs(descida.slopePerWeek! + 14) < 0.001, 'dois pontos por dia = catorze por semana');
});

test('analyzeDomain le a serie do dominio pedido', () => {
  const keys = days(10);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores: { velocidade: 70, atencao: i < 5 ? 60 : 20 },
    overall: 60,
    checkIn: null,
  }));

  assert.equal(analyzeDomain(points, 'velocidade').status, 'estavel');
  assert.equal(analyzeDomain(points, 'atencao').status, 'queda_forte');
  assert.equal(seriesFor(points, 'memoria_visual').length, 0);
});

test('indice geral nao se move quando muda so a mistura de jogos do dia', () => {
  // velocidade rende 80, memoria visual rende 50. Nos ultimos quatro dias so
  // velocidade foi jogada: a media crua saltaria de 65 para 80 sem que nada
  // tivesse mudado. O indice trabalha em desvios da base de cada dominio.
  const keys = days(14);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores: i < 10 ? { velocidade: 80, memoria_visual: 50 } : { velocidade: 80 },
    overall: i < 10 ? 65 : 80,
    checkIn: null,
  }));

  const v = analyzeOverall(points);
  assert.equal(v.status, 'estavel', 'trocar a mistura de jogos nao pode virar "melhora"');
  assert.ok(Math.abs(v.z ?? 99) < 0.001);
});

test('indice geral acusa queda real espalhada pelos dominios', () => {
  const keys = days(12);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores:
      i < 6
        ? { velocidade: 78 + (i % 3), memoria_visual: 62 - (i % 2) }
        : { velocidade: 55, memoria_visual: 40 },
    overall: null,
    checkIn: null,
  }));

  const v = analyzeOverall(points);
  assert.equal(v.status, 'queda_forte');
});

test('sem base suficiente o indice geral admite que ainda nao sabe', () => {
  const keys = days(4);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores: { velocidade: 70 },
    overall: 70,
    checkIn: null,
  }));
  const v = analyzeOverall(points);
  assert.equal(v.status, 'formando_base');
  assert.equal(v.sessionsToBaseline, 4);
});

function checkIn(sleep: number, meds: boolean | null = true): CheckIn {
  return { sleep, mood: 3, meds, notes: '' };
}

test('insights avisam sobre queda e sobre sono ruim no periodo', () => {
  const keys = days(10);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores: { velocidade: i < 5 ? 70 : 40 },
    overall: i < 5 ? 70 : 40,
    checkIn: checkIn(i < 5 ? 4 : 2),
  }));

  const overall = analyzeOverall(points);
  const insights = buildInsights(points, overall, { velocidade: analyzeDomain(points, 'velocidade') });

  assert.ok(insights.some((i) => i.level === 'atencao'), 'a queda precisa aparecer');
  assert.ok(insights.some((i) => i.title.includes('Sono ruim')), 'o confundidor precisa aparecer junto');
});

test('insights alertam quando a medicacao saiu do padrao', () => {
  const keys = days(10);
  const points: DayPoint[] = keys.map((date, i) => ({
    date,
    time: Date.UTC(2026, 0, 1 + i),
    scores: { velocidade: 70 },
    overall: 70,
    checkIn: checkIn(4, i >= 7 ? false : true),
  }));

  const insights = buildInsights(points, analyzeOverall(points), {});
  assert.ok(insights.some((i) => i.title.includes('Medicação')));
});

test('sem sessao nenhuma o relatorio convida a comecar, sem inventar veredito', () => {
  const insights = buildInsights([], analyzeOverall([]), {});
  assert.equal(insights.length, 1);
  assert.equal(insights[0]!.level, 'neutro');
});
