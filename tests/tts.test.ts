import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';

const exec = promisify(execFile);

/**
 * A narracao parou de funcionar sem aviso: a Microsoft passou a exigir um token
 * novo no handshake e o `msedge-tts` rejeitou com `"Connect Error: " + evento`,
 * que virou `Connect Error: [object Object]` na tela do celular. Duas licoes
 * viraram teste aqui — que exista um segundo caminho gratuito quando o primeiro
 * cai, e que a mensagem de erro diga alguma coisa a quem le.
 */

let server: http.Server;
let pedidos: URL[] = [];
let tts: typeof import('@/lib/tts');
let ffmpegBin = '';
let dir = '';
/** Um MP3 de verdade, curto — o servico devolve um destes por trecho. */
let trecho: Buffer;
const TRECHO_SEGUNDOS = 0.5;

before(async () => {
  ffmpegBin = await (await import('@/lib/video/ffmpeg')).ffmpegPath();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-test-'));

  const arquivo = path.join(dir, 'trecho.mp3');
  await exec(ffmpegBin, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=440:d=${TRECHO_SEGUNDOS}`,
    '-c:a', 'libmp3lame', arquivo,
  ]);
  trecho = await fs.readFile(arquivo);

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    pedidos.push(url);

    if (url.pathname === '/falha') {
      res.writeHead(429);
      res.end();
      return;
    }
    if (url.pathname === '/vazio') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end();
      return;
    }

    res.writeHead(200, { 'content-type': 'audio/mpeg' });
    res.end(trecho);
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  process.env.TTS_PROVIDER = 'google';
  process.env.GOOGLE_TTS_URL = `http://127.0.0.1:${port}/tts`;
  process.env.TTS_VOICE = 'pt-BR-ThalitaMultilingualNeural';

  tts = await import('@/lib/tts');
});

after(async () => {
  server?.close();
  if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

/** Duracao real do audio, lida pelo ffmpeg. */
async function duracao(audio: Buffer): Promise<number> {
  const arquivo = path.join(dir, `medir_${Date.now()}.mp3`);
  await fs.writeFile(arquivo, audio);
  const saida = await exec(ffmpegBin, ['-hide_banner', '-i', arquivo]).then(
    () => '',
    (err: any) => String(err?.stderr ?? ''),
  );
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(saida);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** O decodificador reclama de emenda mal feita; aqui a saida tem que vir limpa. */
async function decodificaLimpo(audio: Buffer): Promise<boolean> {
  const arquivo = path.join(dir, `decodificar_${Date.now()}.mp3`);
  await fs.writeFile(arquivo, audio);
  const saida = await exec(ffmpegBin, ['-v', 'error', '-i', arquivo, '-f', 'null', '-']).then(
    (r) => String(r.stderr ?? ''),
    (err: any) => String(err?.stderr ?? 'falhou'),
  );
  return saida.trim() === '';
}

describe('chunkForTts', () => {
  test('texto curto vai inteiro, num pedaco so', () => {
    const t = 'uma frase curta';
    assert.deepEqual(tts.chunkForTts(t, 190), [t]);
  });

  test('nunca parte no meio de uma palavra', () => {
    const texto = 'palavra '.repeat(60).trim();
    const partes = tts.chunkForTts(texto, 50);

    assert.ok(partes.length > 1);
    for (const parte of partes) {
      assert.ok(parte.length <= 50, `pedaco de ${parte.length} passou do limite`);
      assert.ok(/^\S/.test(parte) && /\S$/.test(parte), `pedaco com borda em branco: "${parte}"`);
      // Cada pedaco so pode conter palavras inteiras.
      for (const p of parte.split(' ')) assert.equal(p, 'palavra');
    }
    // Emendar de volta tem que reproduzir o texto original.
    assert.equal(partes.join(' '), texto);
  });

  test('palavra maior que o limite e partida no seco, sem travar', () => {
    // Sem este caso o laco entraria em loop ou devolveria pedaco grande demais.
    const partes = tts.chunkForTts('a'.repeat(120), 50);
    assert.deepEqual(partes.map((p) => p.length), [50, 50, 20]);
  });

  test('texto vazio nao gera chamada nenhuma', () => {
    assert.deepEqual(tts.chunkForTts('   ', 190), []);
  });
});

describe('ttsLanguage', () => {
  test('tira o locale do nome da voz', () => {
    assert.equal(tts.ttsLanguage('pt-BR-ThalitaMultilingualNeural'), 'pt-BR');
    assert.equal(tts.ttsLanguage('en-US-AvaNeural'), 'en-US');
  });

  test('voz com nome fora do padrao nao quebra a narracao', () => {
    assert.equal(tts.ttsLanguage('voz-inventada'), 'pt-BR');
  });
});

describe('voz do Google', () => {
  test('emenda os trechos num audio unico e continuo', async () => {
    pedidos = [];
    const texto = 'palavra '.repeat(80).trim();

    const { audio, mimeType } = await tts.synthesize(texto);

    assert.equal(mimeType, 'audio/mpeg');
    assert.ok(pedidos.length > 1, 'texto longo deveria virar varias chamadas');

    // Nenhum trecho pode ter se perdido pelo caminho.
    const esperado = pedidos.length * TRECHO_SEGUNDOS;
    const medido = await duracao(audio);
    assert.ok(
      Math.abs(medido - esperado) < 0.3,
      `duracao ${medido}s, esperava ~${esperado}s (${pedidos.length} trechos)`,
    );

    // Colar os bytes tambem daria a duracao certa — e faria o decodificador
    // reclamar "Header missing" em cada emenda, engasgando a narracao.
    assert.ok(await decodificaLimpo(audio), 'o audio emendado tem quadro corrompido');
  });

  test('manda o idioma e a posicao de cada trecho', async () => {
    pedidos = [];
    await tts.synthesize('uma frase de teste');

    const [url] = pedidos;
    assert.equal(url.searchParams.get('tl'), 'pt-BR');
    assert.equal(url.searchParams.get('idx'), '0');
    assert.equal(url.searchParams.get('total'), '1');
    assert.equal(url.searchParams.get('q'), 'uma frase de teste');
  });

  test('recusa do servico vira mensagem com o trecho que falhou', async () => {
    const base = process.env.GOOGLE_TTS_URL!.replace('/tts', '/falha');
    await assert.rejects(
      () => tts.googleTts('qualquer texto', base),
      /429.*1\/1/s,
    );
  });

  test('audio vazio e recusado em vez de virar cena muda', async () => {
    // Um MP3 de zero byte passaria adiante e so apareceria no video pronto,
    // como uma cena sem voz que ninguem sabe explicar.
    const base = process.env.GOOGLE_TTS_URL!.replace('/tts', '/vazio');
    await assert.rejects(() => tts.googleTts('qualquer texto', base), /vazio/i);
  });
});

describe('describeTtsError', () => {
  test('traduz o erro cru que aparecia na tela', () => {
    // A mensagem literal que o usuario recebeu.
    const texto = tts.describeTtsError(new Error('Connect Error: [object Object]'));
    assert.match(texto, /Microsoft/);
    assert.doesNotMatch(texto, /object Object/);
  });

  test('rejeicao que nem e Error tambem e lida', () => {
    // O msedge-tts rejeita com string crua, nao com Error.
    assert.match(tts.describeTtsError('Connect Error: [object Object]'), /Microsoft/);
  });

  test('timeout e reconhecido como espera, nao como recusa', () => {
    assert.match(tts.describeTtsError(new Error('Timeout na narracao (60s).')), /tempo/i);
  });

  test('erro comum passa inteiro, sem ser mascarado', () => {
    assert.match(tts.describeTtsError(new Error('voz inexistente')), /voz inexistente/);
  });
});
