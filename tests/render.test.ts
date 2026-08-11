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
let SEM_NARRACAO = '';
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
  SEM_NARRACAO = mod.SEM_NARRACAO;
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

  test('uma narracao que falha nao custa a cena', async () => {
    /**
     * Antes, a cena cuja narracao falhava era descartada: tres cenas viravam
     * duas, e o roteiro perdia um pedaco do meio sem que ninguem soubesse
     * qual. Agora ela fica, muda, com a legenda no tempo que o roteiro pediu —
     * um trecho sem voz da para assistir; um trecho ausente nao volta.
     */
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
        { text: 'primeira cena', visual: 'ceu', seconds: 2 },
        { text: 'segunda cena', visual: 'cidade', seconds: 2 },
        { text: 'terceira cena', visual: 'praia', seconds: 2 },
      ] as any,
      undefined,
      instavel as any,
    );

    assert.ok(resultado.video.length > 10_000);
    const aviso = resultado.warnings.find((w) => w.startsWith(SEM_NARRACAO));
    assert.ok(aviso, `nenhum aviso de cena muda: ${JSON.stringify(resultado.warnings)}`);
    assert.match(aviso!, /1\/3 cena/, 'o aviso precisa dizer quantas cenas ficaram mudas');
    assert.match(aviso!, /Microsoft/, 'o motivo real precisa chegar na tela');

    // As tres cenas continuam no video: ~2s de narracao ou de silencio cada,
    // mais a sobra de 0.35s.
    assert.ok(
      resultado.durationSeconds > 6 && resultado.durationSeconds < 8,
      `duracao ${resultado.durationSeconds}s — alguma cena se perdeu`,
    );
  });

  test('sem os segundos do roteiro, a cena muda dura o que o texto leva para ser lido', async () => {
    /**
     * Este teste exigia o contrario ate aqui: com a narracao fora do ar o
     * render lancava "Nenhuma cena pode ser preparada" e nao entregava nada.
     * Era o comportamento errado — a pessoa esperava minutos para receber uma
     * mensagem de erro em vez de um video que ela poderia julgar.
     *
     * Sem `seconds` no roteiro, a duracao vem da leitura do texto. Se fosse um
     * valor fixo, a legenda de uma frase longa passaria rapido demais para ser
     * lida, que e o mesmo que nao ter legenda.
     */
    const quebrado = {
      ...deps,
      synthesize: async () => {
        throw new Error('a Microsoft recusou a conexao');
      },
    };

    const curta = await renderVideo(
      [{ text: 'texto curto', visual: 'ceu' }] as any,
      undefined,
      quebrado as any,
    );
    const longa = await renderVideo(
      [{ text: 'a'.repeat(140), visual: 'ceu' }] as any,
      undefined,
      quebrado as any,
    );

    assert.ok(curta.video.length > 10_000, 'nao entregou video para o texto curto');
    // 140 caracteres a ~14 por segundo dao ~10s; o piso de 2s cobre o curto.
    assert.ok(
      longa.durationSeconds > curta.durationSeconds + 5,
      `a duracao nao acompanhou o texto: ${curta.durationSeconds}s vs ${longa.durationSeconds}s`,
    );
  });

  test('roteiro sem cenas e recusado em vez de gerar arquivo vazio', async () => {
    await assert.rejects(() => renderVideo([], undefined, deps), /sem cenas/i);
  });
});

describe('renderVideo sem narracao', () => {
  test('entrega o video mudo em vez de morrer sem nada', async () => {
    /**
     * A narracao e o unico servico da cadeia sem substituto proprio: Edge TTS e
     * a voz do Google sao endpoints nao oficiais e recusam IP de servidor com
     * alguma frequencia. Ate aqui isso derrubava o render inteiro — "Nenhuma
     * cena pode ser preparada" — e a pessoa esperava minutos para receber nada.
     */
    const resultado = await renderVideo(
      [
        { text: 'primeira cena sem voz', visual: 'ceu azul', seconds: 4 },
        { text: 'segunda cena sem voz', visual: 'cidade a noite', seconds: 3 },
      ] as any,
      undefined,
      {
        ...deps,
        synthesize: async () => {
          throw new Error('a Microsoft recusou a conexao');
        },
      },
    );

    assert.ok(resultado.video.length > 10_000, 'o MP4 saiu pequeno demais para ser real');
    assert.ok(resultado.thumbnail.length > 1_000, 'a capa saiu vazia');

    const aviso = resultado.warnings.find((w) => w.startsWith(SEM_NARRACAO));
    assert.ok(aviso, `nenhum aviso de video mudo: ${resultado.warnings.join(' | ')}`);
    // O motivo real precisa chegar na tela: "falhou" sem porque nao conserta nada.
    assert.match(aviso!, /recusou a conexao/);
    assert.match(aviso!, /2\/2 cena/);

    // A duracao vem do roteiro (4s + 3s, mais a sobra de 0.35s por cena): sem
    // isso a legenda passaria rapido demais para ser lida.
    assert.ok(
      resultado.durationSeconds > 7 && resultado.durationSeconds < 8,
      `duracao inesperada para cenas mudas: ${resultado.durationSeconds}s`,
    );

    const file = path.join(dir, 'mudo.mp4');
    await fs.writeFile(file, resultado.video);
    const info = await describeFile(file);
    assert.match(info, /Video: h264/, 'sem faixa de video');
    // A faixa de audio continua existindo, so que silenciosa: um MP4 sem faixa
    // nenhuma e recusado por parte dos players, e o TikTok e um deles.
    assert.match(info, /Audio: aac/, 'o video mudo saiu sem faixa de audio');
  });
});

describe('legenda dentro do quadro', () => {
  test('texto longo nao encosta nas bordas', async () => {
    /**
     * Um video renderizado de verdade saiu com "AUTOMATICO ESCOLHENDO POR"
     * cortado nos dois lados. Duas causas somadas: o bloco era montado por
     * numero de palavras sem olhar a largura, e o cabecalho ASS pedia
     * `WrapStyle: 2`, que manda nunca quebrar linha.
     *
     * Contar pixel claro nas colunas da borda e o que separa "a legenda existe"
     * de "a legenda cabe" — o teste anterior passava com o texto vazando.
     */
    const resultado = await renderVideo(
      [
        {
          text: 'O problema nao e a camera e sim o modo automatico escolhendo por voce',
          visual: 'fundo',
          seconds: 6,
        },
      ] as any,
      undefined,
      // Fundo preto: qualquer pixel claro so pode ser letra.
      { ...deps, findAsset: async () => null },
    );

    const file = path.join(dir, 'borda.mp4');
    await fs.writeFile(file, resultado.video);

    const largura = 720; // perfil da Vercel, definido no before()
    const altura = 1280;
    const margem = 20; // colunas de cada lado que precisam ficar limpas

    /**
     * Varre o video inteiro de 0,2 em 0,2 segundo.
     *
     * A primeira versao deste teste amostrava segundos fixos (1 a 5) e passava
     * com o bug presente: a narracao injetada dura 2s, entao o video inteiro
     * tem 2,35s e as amostras de 3, 4 e 5 caiam fora dele. Um teste que olha
     * onde o defeito nao esta da a mesma resposta que um teste que nao existe.
     */
    const passo = 0.2;
    for (let segundo = 0.1; segundo < resultado.durationSeconds; segundo += passo) {
      const { stdout } = await exec(
        ffmpegBin,
        ['-v', 'error', '-ss', segundo.toFixed(2), '-i', file, '-frames:v', '1',
         '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 } as any,
      );
      const pixels = stdout as unknown as Buffer;
      if (pixels.length < largura * altura) continue;

      for (let y = 0; y < altura; y++) {
        for (let x = 0; x < margem; x++) {
          const esquerda = pixels[y * largura + x];
          const direita = pixels[y * largura + (largura - 1 - x)];
          assert.ok(
            esquerda < 200 && direita < 200,
            `legenda vazando em ${segundo.toFixed(1)}s, linha ${y}: ` +
              `esquerda=${esquerda} direita=${direita}`,
          );
        }
      }
    }
  });
});
