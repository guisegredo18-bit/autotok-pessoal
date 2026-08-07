import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '@/lib/video/ffmpeg';

/**
 * A duracao passou a ser lida da saida do proprio ffmpeg em vez do ffprobe:
 * sao dois binarios de ~66 MB e o pacote da funcao na Vercel tem teto de
 * 250 MB. Ler errado aqui nao quebra nada visivelmente — so desalinha a
 * legenda do audio, que e o tipo de defeito que ninguem consegue diagnosticar
 * olhando o video pronto.
 */

describe('parseDuration', () => {
  test('le a duracao do bloco de metadados', () => {
    const saida = `Input #0, mp3, from 'narration_0.mp3':
  Duration: 00:00:06.02, start: 0.025057, bitrate: 32 kb/s`;
    assert.equal(parseDuration(saida), 6.02);
  });

  test('soma horas e minutos', () => {
    assert.equal(parseDuration('  Duration: 01:02:03.50, start: 0'), 3723.5);
  });

  test('duracao desconhecida nao vira zero silencioso', () => {
    // Fluxo sem cabecalho de duracao: melhor falhar do que cortar a cena em 0s.
    assert.equal(parseDuration('  Duration: N/A, bitrate: N/A'), null);
    assert.equal(parseDuration('nenhum metadado aqui'), null);
    assert.equal(parseDuration('  Duration: 00:00:00.00, start: 0'), null);
  });
});
