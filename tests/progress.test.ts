import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readProgress } from '@/lib/db/jobs';
import { pickVideoFile } from '@/lib/media/stock';

/**
 * Dois defeitos com o mesmo sintoma: "esta renderizando ha um tempo".
 *
 * O primeiro e a causa — o Pexels serve o mesmo clipe em varias resolucoes, e
 * pedir a maior fazia cada cena baixar dezenas de megabytes para depois reduzir
 * tudo na composicao. O segundo e a cegueira: quando a funcao e morta por
 * estourar o tempo, nada e gravado, entao o video fica em "renderizando" sem
 * erro, sem progresso e sem botao.
 */

describe('pickVideoFile', () => {
  const arquivos = [
    { width: 360, height: 640, link: 'p360' },
    { width: 720, height: 1280, link: 'p720' },
    { width: 1080, height: 1920, link: 'p1080' },
    { width: 2160, height: 3840, link: 'p4k' },
    { width: 1920, height: 1080, link: 'deitado' },
  ];

  test('pega o menor que cobre o alvo, nao o maior que existe', () => {
    // A diferenca entre baixar ~5 MB e ~60 MB por cena.
    assert.equal(pickVideoFile(arquivos, 1280).link, 'p720');
    assert.equal(pickVideoFile(arquivos, 1920).link, 'p1080');
  });

  test('nunca escolhe um clipe deitado para video vertical', () => {
    assert.equal(pickVideoFile([{ width: 1920, height: 1080, link: 'deitado' }], 720), null);
  });

  test('sem nenhum que alcance o alvo, fica com o maior disponivel', () => {
    // Esticar um pouco incomoda menos do que a cena sair sem fundo.
    const pequenos = [
      { width: 240, height: 426, link: 'p240' },
      { width: 360, height: 640, link: 'p360' },
    ];
    assert.equal(pickVideoFile(pequenos, 1280).link, 'p360');
  });

  test('lista vazia ou sem link nao vira escolha invalida', () => {
    assert.equal(pickVideoFile([], 1280), null);
    assert.equal(pickVideoFile([{ width: 720, height: 1280 }], 1280), null);
  });
});

describe('readProgress', () => {
  /** Uma linha de log como `startJob` grava: "HH:MM:SS mensagem", em UTC. */
  function linha(minutosAtras: number, texto: string, agora: Date): string {
    const t = new Date(agora.getTime() - minutosAtras * 60_000);
    return `${t.toISOString().slice(11, 19)} ${texto}`;
  }

  const agora = new Date('2026-08-07T12:00:00Z');

  test('mostra em que passo a renderizacao esta', () => {
    const logs = [
      linha(2, 'Cena 1/5: gerando narracao', agora),
      linha(1, 'Cena 2/5: buscando fundo', agora),
    ];
    const p = readProgress(logs, new Date(agora.getTime() - 180_000), agora);

    assert.equal(p.step, 'Cena 2/5: buscando fundo');
    assert.equal(p.stalled, false);
  });

  test('silencio longo e processo morto, nao lentidao', () => {
    // Um render inteiro leva um ou dois minutos; oito sem uma linha nova
    // significa que ninguem esta mais trabalhando nisso.
    const logs = [linha(8, 'Cena 3/5: renderizando', agora)];
    const p = readProgress(logs, new Date(agora.getTime() - 600_000), agora);

    assert.equal(p.stalled, true);
    assert.equal(p.silentMinutes, 8);
    assert.equal(p.step, 'Cena 3/5: renderizando');
  });

  test('job sem nenhuma linha usa o proprio inicio como referencia', () => {
    // Morrer antes da primeira linha e possivel — e era invisivel.
    const p = readProgress([], new Date(agora.getTime() - 9 * 60_000), agora);
    assert.equal(p.step, null);
    assert.equal(p.stalled, true);
    assert.equal(p.silentMinutes, 9);
  });

  test('job recem-comecado nao e acusado de travado', () => {
    const p = readProgress([], new Date(agora.getTime() - 20_000), agora);
    assert.equal(p.stalled, false);
    assert.equal(p.silentMinutes, 0);
  });

  test('render que atravessou a meia-noite nao vira silencio de um dia', () => {
    // As linhas so guardam a hora. Interpretada como "hoje", uma linha das
    // 23:58 num render que virou o dia daria quase 24 horas de silencio e o
    // video seria dado como morto sem estar.
    const madrugada = new Date('2026-08-07T00:01:00Z');
    const logs = ['23:58:30 Cena 4/5: renderizando'];
    const p = readProgress(logs, new Date('2026-08-06T23:57:00Z'), madrugada);

    assert.equal(p.silentMinutes, 2);
    assert.equal(p.stalled, false);
  });
});
