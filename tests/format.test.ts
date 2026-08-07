import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { duration } from '@/lib/format';

/**
 * A tela chegou a mostrar "Parou ha 531 min". O numero estava certo e mesmo
 * assim nao servia para nada: ninguem converte isso de cabeca, e a conversao
 * era justamente o que decidia se aquele video tinha morrido agora ou na noite
 * anterior — a diferenca entre investigar a versao no ar e jogar fora lixo
 * velho.
 */

describe('duration', () => {
  test('o caso que motivou tudo isso', () => {
    assert.equal(duration(531), '8h51');
  });

  test('minutos ficam minutos', () => {
    assert.equal(duration(1), '1 min');
    assert.equal(duration(59), '59 min');
  });

  test('hora redonda nao ganha "00" pendurado', () => {
    assert.equal(duration(60), '1h');
    assert.equal(duration(120), '2h');
  });

  test('minutos dentro da hora aparecem com dois digitos', () => {
    // "3h5" leria como tres horas e cinco, ou trinta e cinco?
    assert.equal(duration(185), '3h05');
  });

  test('acima de um dia, dias — e no singular quando e um so', () => {
    assert.equal(duration(60 * 24), '1 dia');
    assert.equal(duration(60 * 24 * 3), '3 dias');
  });

  test('menos de um minuto e agora, nao "0 min"', () => {
    assert.equal(duration(0), 'agora');
    assert.equal(duration(0.4), 'agora');
  });

  test('valor invalido nao vira "NaN min" na tela', () => {
    // Uma data ausente ja produziu isso em outras telas.
    assert.equal(duration(NaN), 'agora');
    assert.equal(duration(-5), 'agora');
  });
});
