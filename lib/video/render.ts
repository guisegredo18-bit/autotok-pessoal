import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Scene } from '@/lib/db/schema';
import { synthesize } from '@/lib/tts';
import { downloadAsset, findAsset } from '@/lib/media/stock';
import { env } from '@/lib/env';
import { FONTS_DIR, assertFfmpeg, ffmpeg, probeDuration } from './ffmpeg';
import { buildAss, chunkScene } from './subtitles';

/**
 * Pipeline de renderizacao do video.
 *
 * A estrategia e montar cada cena como um MP4 independente (fundo + narracao +
 * legenda queimada) e depois concatenar com `-c copy`. Alternativa seria um
 * unico filter_complex gigante; separar por cena e mais lento em milissegundos,
 * mas quando algo falha o erro aponta para a cena exata, e uma cena que quebra
 * nao derruba o video inteiro.
 */

/**
 * Tamanho do quadro.
 *
 * Na Vercel a funcao tem 300 segundos e cerca de um nucleo. Medido num nucleo
 * so, uma cena de 6s custa ~12s em 1080x1920 e ~4s em 720x1280 — a diferenca
 * entre um video de 5 cenas levar um minuto ou vinte segundos de codificacao.
 * O TikTok aceita 720x1280 sem reclamar, e sobrar folga importa mais do que a
 * resolucao: estourar o limite mata a renderizacao no meio, sem nada pronto.
 *
 * Onde ha maquina de verdade (container, Colab, GitHub Actions) vale o 1080.
 */
const SERVERLESS = Boolean(process.env.VERCEL);
const WIDTH = SERVERLESS ? 720 : 1080;
const HEIGHT = SERVERLESS ? 1280 : 1920;
const FPS = 30;
/** O zoom (Ken Burns) parte de um quadro maior e vai fechando ate o alvo. */
const ZOOM_WIDTH = Math.round(WIDTH * 4 / 3);
const ZOOM_HEIGHT = Math.round(HEIGHT * 4 / 3);
/** Sobra no fim de cada cena para a voz nao ser cortada no corte. */
const TAIL_SECONDS = 0.35;

export type RenderResult = {
  video: Buffer;
  thumbnail: Buffer;
  durationSeconds: number;
  /** Avisos nao fatais (ex.: cena que ficou sem imagem de fundo). */
  warnings: string[];
};

/**
 * De onde vem a narracao e a midia de fundo.
 *
 * Injetavel para que o pipeline possa ser exercitado de verdade num teste —
 * com ffmpeg, arquivos e MP4 no fim — sem depender do Edge TTS e do Pexels
 * estarem no ar. O que quebra aqui e a montagem, nao a rede, e era justamente
 * a montagem que nunca tinha sido verificada de ponta a ponta.
 */
export type RenderDeps = {
  synthesize: typeof synthesize;
  findAsset: typeof findAsset;
  downloadAsset: typeof downloadAsset;
};

const REAL_DEPS: RenderDeps = { synthesize, findAsset, downloadAsset };

/**
 * Quanto tempo a montagem pode levar antes de fechar com o que ja tem.
 *
 * A funcao da Vercel e morta ao bater o teto, e morta ela nao grava nada: nem
 * erro, nem as cenas prontas. O video ficava em "renderizando" para sempre, e
 * horas de espera terminavam em zero. Guardar uma margem e parar por conta
 * propria troca isso por um video mais curto — que e um video.
 */
const BUDGET_MS = SERVERLESS ? 200_000 : 15 * 60_000;

export async function renderVideo(
  scenes: Scene[],
  onProgress?: (message: string) => void,
  deps: RenderDeps = REAL_DEPS,
  budgetMs: number = BUDGET_MS,
): Promise<RenderResult> {
  await assertFfmpeg();
  if (scenes.length === 0) throw new Error('Roteiro sem cenas.');

  const inicio = Date.now();
  const decorrido = () => Math.round((Date.now() - inicio) / 1000);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autotok-'));
  const warnings: string[] = [];

  try {
    /**
     * Narracao e fundo de todas as cenas ao mesmo tempo.
     *
     * Antes cada cena esperava a sua vez: cinco narracoes, cinco buscas e
     * cinco downloads, um atras do outro. Era o grosso do tempo de um render —
     * e tempo de espera de rede, nao de trabalho, entao serializar nao comprava
     * nada. Numa funcao com poucos minutos de vida, era a diferenca entre
     * terminar e ser morta no meio.
     *
     * A codificacao continua uma de cada vez logo abaixo: aquilo e CPU, e o
     * servidor tem praticamente um nucleo — disputar so deixaria tudo mais
     * lento.
     */
    onProgress?.(`Preparando ${scenes.length} cenas (narracao e imagens)`);
    const resultados = await Promise.allSettled(
      scenes.map(async (scene, i) => {
        const narrationFile = `narration_${i}.mp3`;
        const { audio } = await deps.synthesize(scene.text);
        await fs.writeFile(path.join(dir, narrationFile), audio);

        const background = await prepareBackground(dir, i, scene, warnings, deps);
        return { scene, i, narrationFile, background };
      }),
    );

    // Uma cena que falhou nao pode levar as outras junto: quatro cenas boas
    // valem muito mais que nenhuma, e a narracao e o servico mais instavel de
    // toda a cadeia — foi ela que ja derrubou o app inteiro uma vez.
    const preparadas = resultados.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    for (const r of resultados) {
      if (r.status === 'rejected') {
        const motivo = r.reason instanceof Error ? r.reason.message : String(r.reason);
        warnings.push(`Uma cena ficou de fora: ${motivo.slice(0, 200)}`);
      }
    }

    if (preparadas.length === 0) {
      // Todas falharam pelo mesmo motivo; repetir e o que explica o que houve.
      const motivo = resultados[0].status === 'rejected'
        ? String((resultados[0] as PromiseRejectedResult).reason)
        : 'motivo desconhecido';
      throw new Error(`Nenhuma cena pode ser preparada. ${motivo.slice(0, 400)}`);
    }

    const clips: string[] = [];
    let total = 0;

    for (const { scene, i, narrationFile, background } of preparadas) {
      const spoken = await probeDuration(narrationFile, dir);
      const duration = Math.round((spoken + TAIL_SECONDS) * 100) / 100;

      const subsFile = `subs_${i}.ass`;
      await fs.writeFile(
        path.join(dir, subsFile),
        buildAss(chunkScene(scene.text, 0, spoken)),
      );

      onProgress?.(`Cena ${i + 1}/${scenes.length}: renderizando (${decorrido()}s)`);
      const clip = `scene_${i}.mp4`;
      await renderScene({ dir, background, narrationFile, subsFile, duration, out: clip });

      clips.push(clip);
      total += duration;

      // A checagem vem depois de gravar a cena: uma cena a mais so entra se
      // couber inteira, e o que ja esta pronto nunca e jogado fora.
      const restantes = preparadas.length - clips.length;
      if (restantes > 0 && Date.now() - inicio > budgetMs) {
        warnings.push(
          `O video saiu com ${clips.length} de ${preparadas.length} cenas: ` +
            `o tempo do servidor acabou em ${decorrido()}s. Renderize de novo para tentar inteiro.`,
        );
        onProgress?.(`Fechando com ${clips.length} cenas — tempo esgotado`);
        break;
      }
    }

    onProgress?.(`Juntando ${clips.length} cena(s) (${decorrido()}s)`);
    await fs.writeFile(
      path.join(dir, 'list.txt'),
      clips.map((c) => `file '${c}'`).join('\n') + '\n',
    );
    await ffmpeg(
      ['-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'final.mp4'],
      dir,
    );

    onProgress?.('Gerando capa');
    await ffmpeg(
      ['-y', '-i', 'final.mp4', '-ss', '1', '-frames:v', '1', '-q:v', '3', 'thumb.jpg'],
      dir,
    );

    return {
      video: await fs.readFile(path.join(dir, 'final.mp4')),
      thumbnail: await fs.readFile(path.join(dir, 'thumb.jpg')),
      durationSeconds: Math.round(total * 100) / 100,
      warnings,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Escapa um caminho para caber dentro de um argumento de filtro do ffmpeg,
 * onde `:` separa opcoes e `\` escapa.
 */
function escapeFilterPath(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

type Background =
  | { kind: 'video'; file: string }
  | { kind: 'image'; file: string }
  | { kind: 'color' };

async function prepareBackground(
  dir: string,
  index: number,
  scene: Scene,
  warnings: string[],
  deps: RenderDeps,
): Promise<Background> {
  const query = scene.visual;

  if (!env.pexelsApiKey) {
    if (index === 0) {
      warnings.push('PEXELS_API_KEY nao configurada — os videos saem com fundo liso.');
    }
    return { kind: 'color' };
  }

  try {
    // A altura do render e o alvo: pedir mais so aumenta o download para
    // depois reduzir na hora de compor.
    const asset = await deps.findAsset(query, HEIGHT);
    if (!asset) {
      warnings.push(`Sem midia para "${query}" — cena ${index + 1} ficou com fundo liso.`);
      return { kind: 'color' };
    }

    const data = await deps.downloadAsset(asset);
    const file = asset.kind === 'video' ? `bg_${index}.mp4` : `bg_${index}.jpg`;
    await fs.writeFile(path.join(dir, file), data);
    return { kind: asset.kind, file };
  } catch (err) {
    // Fundo liso e o ultimo recurso, nao o primeiro. Um clipe recusado por
    // tamanho tem substituto obvio — uma foto, que pesa uma fracao disso — e
    // trocar sai muito mais barato do que entregar a cena sem imagem.
    const foto = await deps.findAsset(query, 0).catch(() => null);
    if (foto && foto.kind === 'image') {
      try {
        const data = await deps.downloadAsset(foto);
        const file = `bg_${index}.jpg`;
        await fs.writeFile(path.join(dir, file), data);
        return { kind: 'image', file };
      } catch {
        // Cai no aviso abaixo.
      }
    }

    warnings.push(
      `Falha ao buscar fundo de "${query}" (${err instanceof Error ? err.message : err}).`,
    );
    return { kind: 'color' };
  }
}

async function renderScene(opts: {
  dir: string;
  background: Background;
  narrationFile: string;
  subsFile: string;
  duration: number;
  out: string;
}): Promise<void> {
  const { dir, background, narrationFile, subsFile, duration, out } = opts;

  // Leve escurecida e saturacao a mais: melhora a leitura da legenda branca e
  // deixa a imagem com cara de video editado em vez de foto de banco.
  const grade = 'eq=brightness=-0.05:saturation=1.15';
  // fontsdir e o que faz a legenda existir onde nao ha fonte instalada — e a
  // Vercel nao tem nenhuma. Sem isso o libass devolve o quadro limpo, sem
  // erro nenhum para denunciar o que faltou.
  const subtitles = `subtitles=${subsFile}:fontsdir=${escapeFilterPath(FONTS_DIR)}`;

  const input: string[] = [];
  let videoFilter: string;

  if (background.kind === 'image') {
    const frames = Math.max(1, Math.round(duration * FPS));

    /**
     * Ken Burns dimensionado pela duracao da cena.
     *
     * O passo era fixo em 0.0006 por quadro com teto de 1.12: a 30fps o zoom
     * chegava ao limite em 6,7 segundos e congelava. Como cena com narracao
     * costuma passar disso, a maior parte do tempo era imagem parada de fato —
     * e o video inteiro passava a impressao de ser um slide, nao um video.
     *
     * Derivando o passo da duracao, o movimento cobre a cena toda, seja ela de
     * tres ou de doze segundos.
     */
    const zoomMax = 1.18;
    const passo = (zoomMax - 1) / frames;

    input.push('-loop', '1', '-i', background.file);
    videoFilter =
      `[0:v]scale=${ZOOM_WIDTH}:${ZOOM_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${ZOOM_WIDTH}:${ZOOM_HEIGHT},` +
      `zoompan=z='min(zoom+${passo.toFixed(6)},${zoomMax})':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},${grade},setsar=1,${subtitles}[v]`;
  } else if (background.kind === 'video') {
    // -stream_loop -1 cobre clipes mais curtos que a narracao; o -t corta.
    input.push('-stream_loop', '-1', '-i', background.file);
    videoFilter =
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},fps=${FPS},${grade},setsar=1,${subtitles}[v]`;
  } else {
    input.push('-f', 'lavfi', '-i', `color=c=0x11111a:s=${WIDTH}x${HEIGHT}:r=${FPS}`);
    videoFilter = `[0:v]${subtitles}[v]`;
  }

  await ffmpeg(
    [
      '-y',
      ...input,
      '-i', narrationFile,
      '-filter_complex', videoFilter,
      '-map', '[v]',
      '-map', '1:a',
      // apad + -t garante que o audio nunca termine antes do video (o que
      // faria o concat depois desalinhar as faixas).
      '-af', 'apad',
      '-t', String(duration),
      '-r', String(FPS),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      out,
    ],
    dir,
  );
}
