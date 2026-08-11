import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetLeft,
  describeAutopilot,
  pickIdeas,
  waitMinutes,
} from '@/lib/pipeline/autopilot';
import { DEFAULT_SETTINGS, applyStored } from '@/lib/db/settings';

/**
 * O piloto publica sem ninguem olhando — entao o que decide se ele age precisa
 * ser testavel sem banco, sem rede e sem conta do TikTok. E o que estas
 * funcoes puras permitem: a trava e verificavel, e nao so descrita.
 */

describe('budgetLeft', () => {
  test('sobra o que o teto ainda comporta', () => {
    assert.equal(budgetLeft(3, 1), 2);
  });

  test('teto atingido nao deixa passar nem mais um', () => {
    assert.equal(budgetLeft(3, 3), 0);
  });

  test('baixar o teto no meio do dia nao vira divida', () => {
    // Cinco publicados hoje e teto novo de tres: o piloto para, e nao fica
    // "devendo" dois. Negativo aqui viraria numero de itens em outra conta.
    assert.equal(budgetLeft(3, 5), 0);
  });
});

describe('waitMinutes', () => {
  const agora = new Date('2026-08-11T12:00:00Z');

  test('sem publicacao anterior, publica ja', () => {
    // O intervalo e entre um post e o seguinte, nao uma espera na largada.
    assert.equal(waitMinutes(null, 90, agora), 0);
  });

  test('espera o que falta do intervalo', () => {
    const faz30min = new Date('2026-08-11T11:30:00Z');
    assert.equal(waitMinutes(faz30min, 90, agora), 60);
  });

  test('intervalo cumprido libera', () => {
    const faz2h = new Date('2026-08-11T10:00:00Z');
    assert.equal(waitMinutes(faz2h, 90, agora), 0);
  });

  test('intervalo zero desliga o espacamento', () => {
    const agorinha = new Date('2026-08-11T11:59:00Z');
    assert.equal(waitMinutes(agorinha, 0, agora), 0);
  });
});

describe('pickIdeas', () => {
  const ideias = [
    { id: 'fraca', score: 40 },
    { id: 'boa', score: 80 },
    { id: 'otima', score: 95 },
    { id: 'media', score: 72 },
  ];

  test('leva as melhores primeiro quando o teto corta o lote', () => {
    // O que fica de fora precisa ser o pior roteiro, e nao o que chegou
    // depois: com teto de 2, "media" nao pode passar na frente de "boa".
    const escolhidas = pickIdeas(ideias, { minScore: 70, budget: 2 });
    assert.deepEqual(escolhidas.map((i) => i.id), ['otima', 'boa']);
  });

  test('nota minima manda mesmo com espaco de sobra', () => {
    const escolhidas = pickIdeas(ideias, { minScore: 90, budget: 10 });
    assert.deepEqual(escolhidas.map((i) => i.id), ['otima']);
  });

  test('sem teto disponivel nao aprova nada', () => {
    assert.deepEqual(pickIdeas(ideias, { minScore: 0, budget: 0 }), []);
  });

  test('nota na fronteira entra', () => {
    assert.deepEqual(
      pickIdeas([{ id: 'x', score: 75 }], { minScore: 75, budget: 1 }).map((i) => i.id),
      ['x'],
    );
  });
});

describe('padrao do piloto', () => {
  test('nasce desligado', () => {
    // Quem instalou pediu um painel de aprovacao. Ligar sozinho o que publica
    // sozinho seria decidir no lugar da pessoa.
    assert.equal(DEFAULT_SETTINGS.autoApprove, false);
    assert.equal(DEFAULT_SETTINGS.autoPublish, false);
    assert.equal(describeAutopilot(DEFAULT_SETTINGS), 'desligado');
  });

  test('configuracao gravada antes do piloto existir continua desligada', () => {
    // `getSettings` mescla a linha antiga com o padrao. Se o padrao fosse
    // ligado, uma atualizacao do app comecaria a publicar na conta de quem
    // nunca pediu isso.
    const antiga = applyStored({ niche: 'receitas rapidas', minScore: 70 });
    assert.equal(antiga.autoApprove, false);
    assert.equal(antiga.autoPublish, false);
    assert.equal(antiga.autoMinScore, 75);
  });

  test('descricao diz o que esta ligado', () => {
    const ligado = applyStored({ autoApprove: true, autoPublish: true, videosPerDay: 3 });
    const texto = describeAutopilot(ligado);
    assert.match(texto, /nota 75\+/);
    assert.match(texto, /90 min/);
    assert.match(texto, /3\/dia/);
  });

  test('so gravar sozinho nao promete publicar', () => {
    const texto = describeAutopilot(applyStored({ autoApprove: true }));
    assert.doesNotMatch(texto, /publica/);
  });
});
