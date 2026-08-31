import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBetween, shuffle } from '../src/core/random.ts';

test('shuffle preserva todos os elementos e nao muda a entrada', () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(original);
  assert.deepEqual([...out].sort((a, b) => a - b), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6, 7, 8], 'a lista original fica intacta');
});

test('shuffle lida com listas vazias e de um elemento', () => {
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle(['a']), ['a']);
});

test('shuffle leva cada elemento a cada posicao', () => {
  // Fisher-Yates correto e uniforme: em 4000 embaralhamentos de 5 itens, cada
  // item cai em cada posicao por volta de 800 vezes. Uma implementacao
  // enviesada concentra elementos em certas casas.
  const runs = 4000;
  const size = 5;
  const counts = Array.from({ length: size }, () => Array<number>(size).fill(0));
  for (let r = 0; r < runs; r++) {
    const out = shuffle([0, 1, 2, 3, 4]);
    out.forEach((value, position) => counts[value]![position]!++);
  }
  const expected = runs / size;
  for (let value = 0; value < size; value++) {
    for (let position = 0; position < size; position++) {
      const seen = counts[value]![position]!;
      assert.ok(
        Math.abs(seen - expected) < expected * 0.25,
        `item ${value} caiu na posicao ${position} ${seen} vezes (esperado ~${expected})`,
      );
    }
  }
});

test('baralho de pares nao sai com os pares encostados', () => {
  // O caso que motivou este teste: um baralho de 4 pares saindo como
  // AABBCCDD deixa o jogo da memoria trivial. Acontecer uma vez e azar
  // (cerca de 1%); acontecer sempre e bug.
  const symbols = ['a', 'b', 'c', 'd'];
  let allAdjacent = 0;
  const runs = 500;
  for (let r = 0; r < runs; r++) {
    const deck = shuffle([...symbols, ...symbols]);
    const adjacent = deck.every((card, i) => (i % 2 === 0 ? card === deck[i + 1] : true));
    if (adjacent) allAdjacent++;
  }
  assert.ok(
    allAdjacent < runs * 0.05,
    `baralho saiu totalmente pareado em ${allAdjacent} de ${runs} embaralhamentos`,
  );
});

test('randomBetween respeita os limites', () => {
  for (let i = 0; i < 500; i++) {
    const value = randomBetween(1200, 3800);
    assert.ok(value >= 1200 && value < 3800, `fora da faixa: ${value}`);
  }
});
