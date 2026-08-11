import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pcmRate, readInlineAudio } from '@/lib/tts';

/**
 * O que da para verificar sem a chave e sem rede.
 *
 * A chamada HTTP em si nao esta coberta — nao ha como exercita-la aqui de
 * forma honesta. O que esta coberto e o que costuma quebrar de verdade nesse
 * tipo de integracao: a leitura da resposta e a taxa de amostragem. Uma
 * resposta 200 sem audio (cota, recusa por seguranca, modelo que so fala
 * texto) e o caso comum, e ele precisa virar frase legivel em vez de
 * "undefined".
 */

describe('pcmRate', () => {
  test('le a taxa declarada pela API', () => {
    assert.equal(pcmRate('audio/L16;codec=pcm;rate=24000'), 24_000);
    assert.equal(pcmRate('audio/L16; codec=pcm; rate=16000'), 16_000);
  });

  test('sem taxa declarada, assume a que o modelo usa hoje', () => {
    assert.equal(pcmRate(undefined), 24_000);
    assert.equal(pcmRate('audio/L16;codec=pcm'), 24_000);
  });

  test('taxa invalida nao vira zero', () => {
    // Zero chegaria ao ffmpeg como taxa de amostragem e mataria a conversao;
    // um numero errado aqui produz narracao acelerada, dessincronizada da
    // legenda — pior do que falhar, porque ninguem desconfia.
    assert.equal(pcmRate('audio/L16;rate=0'), 24_000);
    assert.equal(pcmRate('audio/L16;rate=abc'), 24_000);
  });
});

describe('readInlineAudio', () => {
  test('acha o audio na resposta normal', () => {
    const achado = readInlineAudio({
      candidates: [
        { content: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'audio/L16;rate=24000' } }] } },
      ],
    });
    assert.equal(achado.data, 'QUJD');
    assert.equal(achado.mimeType, 'audio/L16;rate=24000');
  });

  test('aceita snake_case sem quebrar', () => {
    const achado = readInlineAudio({
      candidates: [{ content: { parts: [{ inline_data: { data: 'QUJD', mime_type: 'audio/L16' } }] } }],
    });
    assert.equal(achado.data, 'QUJD');
  });

  test('pula a parte de texto e pega o audio depois dela', () => {
    const achado = readInlineAudio({
      candidates: [
        { content: { parts: [{ text: 'ok' }, { inlineData: { data: 'WFla', mimeType: 'audio/L16' } }] } },
      ],
    });
    assert.equal(achado.data, 'WFla');
  });

  test('erro da API vira a mensagem da API', () => {
    assert.throws(
      () => readInlineAudio({ error: { message: 'API key not valid' } }),
      /API key not valid/,
    );
  });

  test('cota estourada chega legivel', () => {
    assert.throws(
      () => readInlineAudio({ error: { message: 'Quota exceeded for quota metric' } }),
      /Quota exceeded/,
    );
  });

  test('texto recusado por seguranca diz que foi recusa', () => {
    assert.throws(
      () => readInlineAudio({ promptFeedback: { blockReason: 'SAFETY' } }),
      /recusou o texto \(SAFETY\)/,
    );
  });

  test('resposta so com texto explica o que veio no lugar do audio', () => {
    assert.throws(
      () => readInlineAudio({ candidates: [{ content: { parts: [{ text: 'Desculpe, nao posso' }] } }] }),
      /respondeu texto em vez de audio: Desculpe/,
    );
  });

  test('resposta vazia nao vira "undefined" na tela', () => {
    assert.throws(() => readInlineAudio({}), /sem audio/);
    assert.throws(
      () => readInlineAudio({ candidates: [{ finishReason: 'MAX_TOKENS', content: {} }] }),
      /MAX_TOKENS/,
    );
  });
});

describe('pcmToMp3', () => {
  test('o audio convertido dura o mesmo que o PCM que entrou', async () => {
    const { pcmToMp3 } = await import('@/lib/tts');
    const { ffmpegPath, parseDuration } = await import('@/lib/video/ffmpeg');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const exec = promisify(execFile);

    const rate = 24_000;
    const segundos = 2;
    // Silencio de 2s em s16le mono: 2 bytes por amostra.
    const pcm = Buffer.alloc(rate * segundos * 2);

    const mp3 = await pcmToMp3(pcm, rate);
    assert.ok(mp3.length > 1_000, `MP3 pequeno demais: ${mp3.length} bytes`);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcm-test-'));
    try {
      const file = path.join(dir, 'voz.mp3');
      await fs.writeFile(file, mp3);

      let saida = '';
      try {
        await exec(await ffmpegPath(), ['-hide_banner', '-i', file]);
      } catch (err: any) {
        saida = String(err?.stderr ?? '');
      }

      const duracao = parseDuration(saida);
      assert.ok(duracao, `nao consegui ler a duracao: ${saida.slice(0, 300)}`);
      // Uma taxa errada aqui e a diferenca entre 2s e 1,3s (ou 4s): a legenda
      // ficaria fora de sincronia com a voz no video inteiro.
      assert.ok(
        Math.abs(duracao! - segundos) < 0.3,
        `converteu em outra velocidade: ${duracao}s para ${segundos}s de PCM`,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('audio vazio e recusado em vez de virar MP3 de zero segundo', async () => {
    const { pcmToMp3 } = await import('@/lib/tts');
    await assert.rejects(() => pcmToMp3(Buffer.alloc(0), 24_000), /vazio/i);
  });
});

describe('pickTtsModel', () => {
  test('escolhe o modelo de voz entre todos os da conta', async () => {
    const { pickTtsModel } = await import('@/lib/ai/gemini-models');
    const escolhido = pickTtsModel([
      'models/gemini-2.5-flash',
      'models/gemini-2.5-pro-preview-tts',
      'models/gemini-2.5-flash-preview-tts',
      'models/embedding-001',
    ]);
    // Flash antes de pro: narrar nao precisa do modelo caro, e a cota gratuita
    // do flash e maior.
    assert.equal(escolhido, 'gemini-2.5-flash-preview-tts');
  });

  test('preview nao e descartado', async () => {
    // Para escrever roteiro, preview vai para o fim da fila porque existe
    // versao estavel. Em voz nao existe: aplicar a mesma regra aqui jogaria
    // fora o unico candidato.
    const { pickTtsModel } = await import('@/lib/ai/gemini-models');
    assert.equal(
      pickTtsModel(['models/gemini-3.0-flash-preview-tts']),
      'gemini-3.0-flash-preview-tts',
    );
  });

  test('versao mais nova ganha', async () => {
    const { pickTtsModel } = await import('@/lib/ai/gemini-models');
    assert.equal(
      pickTtsModel(['models/gemini-2.5-flash-preview-tts', 'models/gemini-3.0-flash-preview-tts']),
      'gemini-3.0-flash-preview-tts',
    );
  });

  test('conta sem modelo de voz devolve nada, e nao um modelo qualquer', async () => {
    // Devolver um modelo de texto aqui produziria uma resposta sem audio, e o
    // erro apareceria tres camadas adiante, sem relacao com a causa.
    const { pickTtsModel } = await import('@/lib/ai/gemini-models');
    assert.equal(pickTtsModel(['models/gemini-2.5-flash', 'models/embedding-001']), null);
  });
});
