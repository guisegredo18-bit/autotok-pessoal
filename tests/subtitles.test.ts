import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAss, chunkScene } from '@/lib/video/subtitles';

describe('chunkScene', () => {
  const frase = 'Voce faz isso todo dia e nunca percebeu o quanto atrapalha';

  test('quebra em blocos curtos de tres palavras', () => {
    const chunks = chunkScene(frase, 0, 6);
    assert.equal(chunks.length, 4); // 11 palavras / 3
    for (const chunk of chunks) {
      assert.ok(chunk.text.split(' ').length <= 3, `bloco longo demais: ${chunk.text}`);
    }
  });

  test('a soma dos blocos cobre exatamente a cena', () => {
    // Se sobrar buraco no fim, a ultima legenda some antes da voz terminar.
    const chunks = chunkScene(frase, 10, 6);
    assert.equal(chunks[0].start, 10);
    assert.equal(chunks[chunks.length - 1].end, 16);
  });

  test('nao deixa lacuna nem sobreposicao entre blocos', () => {
    const chunks = chunkScene(frase, 0, 6);
    for (let i = 1; i < chunks.length; i++) {
      assert.ok(
        Math.abs(chunks[i].start - chunks[i - 1].end) < 1e-9,
        `lacuna entre o bloco ${i - 1} e o ${i}`,
      );
    }
  });

  test('blocos com mais caracteres ficam mais tempo na tela', () => {
    const chunks = chunkScene('oi oi oi extraordinariamente longo aqui', 0, 10);
    const curto = chunks[0].end - chunks[0].start;
    const longo = chunks[1].end - chunks[1].start;
    assert.ok(longo > curto, 'o bloco maior deveria durar mais');
  });

  test('texto vazio nao gera legenda', () => {
    assert.deepEqual(chunkScene('   ', 0, 5), []);
  });
});

describe('buildAss', () => {
  test('gera um arquivo ASS com cabecalho, estilo e dialogos', () => {
    const ass = buildAss(chunkScene('teste de legenda', 0, 3));
    assert.match(ass, /\[Script Info\]/);
    assert.match(ass, /PlayResX: 1080/);
    assert.match(ass, /PlayResY: 1920/);
    assert.match(ass, /^Style: Default,/m);
    assert.match(ass, /^Dialogue: 0,0:00:00\.00,/m);
  });

  test('deixa o texto em caixa alta', () => {
    const ass = buildAss([{ text: 'comenta ai', start: 0, end: 1 }]);
    assert.match(ass, /COMENTA AI/);
  });

  test('remove chaves, que sao tags de override no formato ASS', () => {
    // Um `{` solto vindo do roteiro faria o ffmpeg engolir a linha inteira.
    const ass = buildAss([{ text: 'olha {isso} aqui', start: 0, end: 1 }]);
    assert.ok(!ass.includes('{isso}'), 'as chaves do texto deveriam sumir');
    assert.match(ass, /OLHA ISSO AQUI/);
  });

  test('descarta blocos de duracao zero ou negativa', () => {
    const ass = buildAss([
      { text: 'valido', start: 0, end: 1 },
      { text: 'invertido', start: 2, end: 1 },
    ]);
    assert.ok(ass.includes('VALIDO'));
    assert.ok(!ass.includes('INVERTIDO'));
  });

  test('formata o tempo no padrao h:mm:ss.cc', () => {
    const ass = buildAss([{ text: 'x', start: 65.5, end: 70.25 }]);
    assert.match(ass, /0:01:05\.50,0:01:10\.25/);
  });
});
