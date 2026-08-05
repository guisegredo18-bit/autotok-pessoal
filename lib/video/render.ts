import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Scene } from '@/lib/db/schema';
import { synthesize } from '@/lib/tts';
import { downloadAsset, findAsset } from '@/lib/media/stock';
import { env } from '@/lib/env';
import { assertFfmpeg, ffmpeg, probeDuration } from './ffmpeg';
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

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
/** Sobra no fim de cada cena para a voz nao ser cortada no corte. */
const TAIL_SECONDS = 0.35;

export type RenderResult = {
  video: Buffer;
  thumbnail: Buffer;
  durationSeconds: number;
  /** Avisos nao fatais (ex.: cena que ficou sem imagem de fundo). */
  warnings: string[];
};

export async function renderVideo(
  scenes: Scene[],
  onProgress?: (message: string) => void,
): Promise<RenderResult> {
  await assertFfmpeg();
  if (scenes.length === 0) throw new Error('Roteiro sem cenas.');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autotok-'));
  const warnings: string[] = [];

  try {
    const clips: string[] = [];
    let total = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      onProgress?.(`Cena ${i + 1}/${scenes.length}: gerando narracao`);

      const narrationFile = `narration_${i}.mp3`;
      const { audio } = await synthesize(scene.text);
      await fs.writeFile(path.join(dir, narrationFile), audio);

      const spoken = await probeDuration(narrationFile, dir);
      const duration = Math.round((spoken + TAIL_SECONDS) * 100) / 100;

      onProgress?.(`Cena ${i + 1}/${scenes.length}: buscando fundo`);
      const background = await prepareBackground(dir, i, scene.visual, warnings);

      const subsFile = `subs_${i}.ass`;
      await fs.writeFile(
        path.join(dir, subsFile),
        buildAss(chunkScene(scene.text, 0, spoken)),
      );

      onProgress?.(`Cena ${i + 1}/${scenes.length}: renderizando`);
      const clip = `scene_${i}.mp4`;
      await renderScene({ dir, background, narrationFile, subsFile, duration, out: clip });

      clips.push(clip);
      total += duration;
    }

    onProgress?.('Juntando as cenas');
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

type Background =
  | { kind: 'video'; file: string }
  | { kind: 'image'; file: string }
  | { kind: 'color' };

async function prepareBackground(
  dir: string,
  index: number,
  query: string,
  warnings: string[],
): Promise<Background> {
  if (!env.pexelsApiKey) {
    if (index === 0) {
      warnings.push('PEXELS_API_KEY nao configurada — os videos saem com fundo liso.');
    }
    return { kind: 'color' };
  }

  try {
    const asset = await findAsset(query);
    if (!asset) {
      warnings.push(`Sem midia para "${query}" — cena ${index + 1} ficou com fundo liso.`);
      return { kind: 'color' };
    }

    const data = await downloadAsset(asset);
    const file = asset.kind === 'video' ? `bg_${index}.mp4` : `bg_${index}.jpg`;
    await fs.writeFile(path.join(dir, file), data);
    return { kind: asset.kind, file };
  } catch (err) {
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
  const subtitles = `subtitles=${subsFile}`;

  const input: string[] = [];
  let videoFilter: string;

  if (background.kind === 'image') {
    // Um ciclo completo de zoom (Ken Burns) ocupa exatamente a cena.
    const frames = Math.max(1, Math.round(duration * FPS));
    input.push('-loop', '1', '-i', background.file);
    videoFilter =
      `[0:v]scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,` +
      `zoompan=z='min(zoom+0.0006,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
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
