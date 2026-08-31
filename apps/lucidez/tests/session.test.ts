import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayKey, planSession, sessionForDay, streak } from '../src/core/session.ts';
import { challengeParams, levelOf, nextLevel } from '../src/core/adaptive.ts';
import { GAME_IDS } from '../src/core/domains.ts';
import type { GameId } from '../src/core/types.ts';
import { makeSession } from './helpers.ts';

test('dayKey usa o fuso local, nao UTC', () => {
  // 31/12 as 22h no horario de Brasilia ja seria 01/01 em UTC. A sessao
  // pertence ao dia em que a pessoa a fez.
  const local = new Date(2026, 11, 31, 22, 30);
  assert.equal(dayKey(local), '2026-12-31');
});

test('addDays atravessa a virada do mes e do ano', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('planSession escolhe primeiro o que ficou mais tempo sem ser medido', () => {
  const history: { game: GameId; date: string }[] = [
    { game: 'reacao', date: '2026-02-10' },
    { game: 'gonogo', date: '2026-02-09' },
    { game: 'sequencia', date: '2026-02-01' },
    { game: 'pares', date: '2026-02-08' },
    { game: 'stroop', date: '2026-02-07' },
    { game: 'trilhas', date: '2026-02-02' },
  ];
  assert.deepEqual(planSession(3, history), ['sequencia', 'trilhas', 'stroop']);
});

test('planSession comeca pelos jogos nunca jogados', () => {
  const history: { game: GameId; date: string }[] = [
    { game: 'reacao', date: '2026-02-10' },
    { game: 'gonogo', date: '2026-02-10' },
  ];
  const plano = planSession(3, history);
  assert.equal(plano.includes('reacao'), false);
  assert.equal(plano.includes('gonogo'), false);
  assert.equal(plano.length, 3);
});

test('planSession cobre toda a bateria ao longo de alguns dias', () => {
  const history: { game: GameId; date: string }[] = [];
  const vistos = new Set<GameId>();
  for (let day = 0; day < 3; day++) {
    const date = addDays('2026-02-01', day);
    for (const game of planSession(2, history)) {
      vistos.add(game);
      history.push({ game, date });
    }
  }
  assert.equal(vistos.size, GAME_IDS.length, 'em tres dias de dois jogos, os seis foram medidos');
});

test('planSession respeita os limites do numero de jogos', () => {
  assert.equal(planSession(0, []).length, 1);
  assert.equal(planSession(99, []).length, GAME_IDS.length);
});

test('streak conta dias seguidos e nao quebra por hoje ainda em aberto', () => {
  const sessions = [
    makeSession('2026-02-08'),
    makeSession('2026-02-09'),
    makeSession('2026-02-10'),
  ];
  assert.equal(streak(sessions, '2026-02-10'), 3, 'tres dias seguidos');
  assert.equal(streak(sessions, '2026-02-11'), 3, 'hoje ainda nao feito nao zera a sequencia');
  assert.equal(streak(sessions, '2026-02-12'), 0, 'um dia inteiro pulado zera');
});

test('streak ignora sessoes abandonadas', () => {
  const sessions = [
    makeSession('2026-02-09'),
    makeSession('2026-02-10', { completed: false }),
  ];
  assert.equal(streak(sessions, '2026-02-10'), 1);
});

test('sessionForDay encontra a sessao do dia ou devolve null', () => {
  const sessions = [makeSession('2026-02-09'), makeSession('2026-02-10')];
  assert.equal(sessionForDay(sessions, '2026-02-10')?.date, '2026-02-10');
  assert.equal(sessionForDay(sessions, '2026-02-11'), null);
});

test('escada de dificuldade sobe no acerto alto e desce no acerto baixo', () => {
  assert.equal(nextLevel(3, 0.9), 4);
  assert.equal(nextLevel(3, 0.7), 3, 'a faixa alvo mantem o nivel');
  assert.equal(nextLevel(3, 0.4), 2);
});

test('escada de dificuldade respeita o teto e o piso', () => {
  assert.equal(nextLevel(10, 1), 10);
  assert.equal(nextLevel(1, 0), 1);
  assert.equal(nextLevel(Number.NaN, 0.9), 2, 'nivel ausente comeca em 1 e sobe');
});

test('levelOf normaliza valores ausentes ou fora da faixa', () => {
  assert.equal(levelOf({}, 'stroop'), 1);
  assert.equal(levelOf({ stroop: 40 }, 'stroop'), 10);
  assert.equal(levelOf({ stroop: -5 }, 'stroop'), 1);
});

test('parametros do desafio ficam mais duros conforme o nivel', () => {
  const facil = challengeParams(1);
  const dificil = challengeParams(10);
  assert.ok(dificil.trials > facil.trials);
  assert.ok(dificil.pairs > facil.pairs);
  assert.ok(dificil.deadlineMs < facil.deadlineMs);
  assert.ok(dificil.deadlineMs > 500, 'o prazo nunca fica impossivel');
  assert.ok(dificil.pairs <= 12, 'a grade cabe na tela do celular');
});
