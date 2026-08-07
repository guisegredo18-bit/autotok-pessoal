import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Renderiza um video de verdade, do inicio ao fim.
 *
 * Todo o resto da suite testa funcoes puras, e por isso o pipeline — a unica
 * coisa que o app precisa fazer bem — nunca tinha sido exercitado. A narracao e
 * a midia de fundo entram injetadas, geradas aqui com o proprio ffmpeg, entao o
 * teste nao depende do Edge TTS nem do Pexels estarem no ar. O que ele cobre e
 * o que de fato quebra: a montagem dos filtros, a concatenacao, a legenda e o
 * MP4 que sai do outro lado.
 */

let dir = '';
let ffmpegBin = '';
let renderVideo: typeof import('@/lib/video/render').renderVideo;
let deps: import('@/lib/video/render').RenderDeps;

/** Le a saida do ffmpeg sobre um arquivo — ele escreve tudo em stderr. */
async function describeFile(file: string): Promise<string> {
  try {
    await exec(ffmpegBin, ['-hide_banner', '-i', file]);
    return '';
  } catch (err: any) {
    return String(err?.stderr ?? '');
  }
}

before(async () => {
  // Antes de importar: o modulo decide o tamanho do quadro na carga, e aqui
  // queremos o perfil da Vercel — que e o que o usuario vai receber.
  process.env.VERCEL = '1';
  process.env.PEXELS_API_KEY = 'fake-para-o-teste';

  const mod = await import('@/lib/video/render');
  renderVideo = mod.renderVideo;
  ffmpegBin = await (await import('@/lib/video/ffmpeg')).ffmpegPath();

  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-test-'));

  // Uma "foto de banco de imagens" e uma "narracao", fabricadas localmente.
  const bg = path.join(dir, 'bg.jpg');
  const voz = path.join(dir, 'voz.mp3');
  await exec(ffmpegBin, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=1',
    '-frames:v', '1', bg,
  ]);
  await exec(ffmpegBin, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=2',
    '-c:a', 'libmp3lame', voz,
  ]);

  const audio = await fs.readFile(voz);
  const imagem = await fs.readFile(bg);

  deps = {
    synthesize: async () => ({ audio, contentType: 'audio/mpeg' }) as any,
    findAsset: async () => ({ kind: 'image', url: 'file://bg', width: 1280, height: 720 }) as any,
    downloadAsset: async () => imagem,
  };
});

after(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('renderVideo', () => {
  test('monta um MP4 vertical com video, audio e legenda', async () => {
    const passos: string[] = [];
    const resultado = await renderVideo(
      [
        { text: 'primeira cena de teste', visual: 'ceu azul' },
        { text: 'segunda cena de teste', visual: 'cidade a noite' },
      ] as any,
      (msg) => passos.push(msg),
      deps,
    );

    assert.ok(resultado.video.length > 10_000, 'o MP4 saiu pequeno demais para ser real');
    assert.ok(resultado.thumbnail.length > 1_000, 'a capa saiu vazia');
    assert.deepEqual(resultado.warnings, [], 'nao deveria haver avisos com midia disponivel');
    assert.ok(passos.length > 0, 'o progresso nao foi reportado');
    // As cenas sao preparadas juntas e codificadas uma a uma; o progresso tem
    // de refletir isso, senao a Fila mostra um passo que nao existe mais.
    assert.match(passos[0], /Preparando 2 cenas/);
    assert.ok(
      passos.some((p) => /Cena 2\/2: renderizando/.test(p)),
      `nao reportou a codificacao de cada cena: ${passos.join(' | ')}`,
    );

    // As duas narracoes de 2s, mais a sobra de 0.35s em cada uma.
    assert.ok(
      resultado.durationSeconds > 4 && resultado.durationSeconds < 6,
      `duracao inesperada: ${resultado.durationSeconds}s`,
    );

    const file = path.join(dir, 'saida.mp4');
    await fs.writeFile(file, resultado.video);
    const info = await describeFile(file);

    assert.match(info, /Video: h264/, 'sem faixa de video h264');
    assert.match(info, /Audio: aac/, 'sem faixa de audio aac');
    assert.match(info, /720x1280/, 'o quadro nao saiu vertical no perfil da Vercel');
  });

  test('a legenda e mesmo desenhada no quadro', async () => {
    // O libass sem fonte nao reclama: devolve o quadro limpo. Foi por isso que
    // a fonte passou a viajar no repositorio — e e isso que este teste guarda.
    const resultado = await renderVideo(
      [{ text: 'LEGENDA VISIVEL AQUI', visual: 'fundo' }] as any,
      undefined,
      // Fundo liso e preto: qualquer pixel claro so pode ser a letra.
      { ...deps, findAsset: async () => null },
    );

    const file = path.join(dir, 'legenda.mp4');
    await fs.writeFile(file, resultado.video);

    const { stdout } = await exec(
      ffmpegBin,
      ['-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 } as any,
    );

    const claros = (stdout as unknown as Buffer).filter((v) => v > 200).length;
    assert.ok(claros > 500, `so ${claros} pixels claros — a legenda nao foi desenhada`);
  });

  test('sem tempo para tudo, entrega as cenas que ficaram prontas', async () => {
    // Estourar o teto da funcao matava o processo sem gravar nada: nem erro,
    // nem as cenas ja montadas. Horas de espera terminavam em zero. Um video
    // mais curto e um video.
    const passos: string[] = [];
    const resultado = await renderVideo(
      [
        { text: 'primeira cena', visual: 'ceu' },
        { text: 'segunda cena', visual: 'cidade' },
        { text: 'terceira cena', visual: 'praia' },
      ] as any,
      (m) => passos.push(m),
      deps,
      1, // prazo que ja acabou: fecha na primeira cena inteira
    );

    assert.ok(resultado.video.length > 10_000, 'nao entregou video nenhum');
    assert.equal(
      resultado.warnings.length,
      1,
      `esperava um aviso sobre o corte: ${JSON.stringify(resultado.warnings)}`,
    );
    assert.match(resultado.warnings[0], /1 de 3 cenas/);
    assert.ok(passos.some((p) => /tempo esgotado/.test(p)));

    // Uma cena de 2s, e nao as tres.
    assert.ok(resultado.durationSeconds < 3, `duracao ${resultado.durationSeconds}s`);
  });

  test('com prazo de sobra, nenhuma cena e cortada', async () => {
    const resultado = await renderVideo(
      [
        { text: 'primeira cena', visual: 'ceu' },
        { text: 'segunda cena', visual: 'cidade' },
      ] as any,
      undefined,
      deps,
      10 * 60_000,
    );
    assert.deepEqual(resultado.warnings, []);
    assert.ok(resultado.durationSeconds > 4, `duracao ${resultado.durationSeconds}s`);
  });

  test('uma cena que falha nao derruba as outras', async () => {
    // A narracao e o servico mais instavel da cadeia — ja parou o app inteiro
    // uma vez. Quatro cenas boas valem muito mais que nenhuma.
    let chamada = 0;
    const instavel = {
      ...deps,
      synthesize: async (texto: string) => {
        if (++chamada === 2) throw new Error('a Microsoft recusou a conexao');
        return deps.synthesize(texto);
      },
    };

    const resultado = await renderVideo(
      [
        { text: 'primeira cena', visual: 'ceu' },
        { text: 'segunda cena', visual: 'cidade' },
        { text: 'terceira cena', visual: 'praia' },
      ] as any,
      undefined,
      instavel as any,
    );

    assert.ok(resultado.video.length > 10_000);
    assert.ok(
      resultado.warnings.some((w) => /ficou de fora.*Microsoft/.test(w)),
      `o aviso nao explica a cena perdida: ${JSON.stringify(resultado.warnings)}`,
    );
    // Duas cenas de 2s sobreviveram.
    assert.ok(
      resultado.durationSeconds > 4 && resultado.durationSeconds < 6,
      `duracao ${resultado.durationSeconds}s`,
    );
  });

  test('se nenhuma cena pode ser preparada, o erro diz o motivo', async () => {
    const quebrado = {
      ...deps,
      synthesize: async () => {
        throw new Error('a Microsoft recusou a conexao');
      },
    };
    await assert.rejects(
      () => renderVideo([{ text: 'unica', visual: 'ceu' }] as any, undefined, quebrado as any),
      /Nenhuma cena.*Microsoft/s,
    );
  });

  test('roteiro sem cenas e recusado em vez de gerar arquivo vazio', async () => {
    await assert.rejects(() => renderVideo([], undefined, deps), /sem cenas/i);
  });
});
