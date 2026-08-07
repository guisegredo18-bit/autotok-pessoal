import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Wrapper fino em cima do ffmpeg.
 *
 * Usamos execFile (e nao exec) de proposito: os argumentos vao como array, sem
 * passar por shell, entao nome de arquivo com espaco ou aspas nao vira injecao
 * de comando.
 *
 * O binario nao vem do sistema. A Vercel — que e onde o painel roda — nao tem
 * ffmpeg instalado e nao da para instalar nada la. Entao ele vem junto no
 * pacote, por `@ffmpeg-installer/ffmpeg`, que traz um build estatico com
 * libass (a legenda depende disso). Em maquina que ja tem ffmpeg proprio, o do
 * sistema continua valendo.
 */

export class FfmpegError extends Error {
  constructor(message: string, readonly stderr: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

let binaryPromise: Promise<string> | null = null;

/** Caminho do ffmpeg a usar, resolvido uma vez por processo. */
export function ffmpegPath(): Promise<string> {
  binaryPromise ??= resolveBinary();
  return binaryPromise;
}

async function resolveBinary(): Promise<string> {
  // O do sistema primeiro: numa maquina de verdade ele e mais novo e mais
  // rapido que o build estatico de 2018.
  if (await works('ffmpeg')) return 'ffmpeg';

  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    const file = (installer as any).default?.path ?? (installer as any).path;
    if (file && (await works(file))) return file;
  } catch {
    // Segue para a mensagem de erro abaixo.
  }

  throw new Error(
    'ffmpeg nao encontrado. Em maquina propria, instale com `apt install ffmpeg` ' +
      '(Linux) ou `brew install ffmpeg` (Mac).',
  );
}

async function works(file: string): Promise<boolean> {
  try {
    await exec(file, ['-version'], { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Onde a fonte da legenda mora.
 *
 * A Vercel roda numa imagem sem nenhuma fonte instalada, e o libass sem fonte
 * nao desenha nada — nem erro ele da, so devolve o video com a legenda
 * invisivel. Por isso a fonte viaja no repositorio, e o fontconfig do processo
 * filho e apontado so para ela.
 */
export const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

let fontconfigPromise: Promise<string | null> | null = null;

async function fontconfigFile(): Promise<string | null> {
  fontconfigPromise ??= (async () => {
    try {
      await fs.access(path.join(FONTS_DIR, 'DejaVuSans.ttf'));
    } catch {
      return null;
    }

    // O arquivo e escrito em /tmp porque e o unico lugar gravavel na Vercel.
    const dir = path.join('/tmp', 'autotok-fontconfig');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'fonts.conf');
    await fs.writeFile(
      file,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR}</dir>
  <cachedir>${path.join(dir, 'cache')}</cachedir>
</fontconfig>
`,
    );
    return file;
  })();

  return fontconfigPromise;
}

export async function ffmpeg(args: string[], cwd?: string): Promise<void> {
  const bin = await ffmpegPath();
  const conf = await fontconfigFile();

  try {
    await exec(bin, ['-hide_banner', '-loglevel', 'error', ...args], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 15 * 60_000,
      env: conf ? { ...process.env, FONTCONFIG_FILE: conf } : process.env,
    });
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? err);
    throw new FfmpegError(`ffmpeg falhou: ${stderr.slice(0, 800)}`, stderr);
  }
}

/**
 * Duracao de um arquivo de midia, em segundos.
 *
 * Lida do proprio ffmpeg em vez do ffprobe: sao dois binarios de ~66 MB cada, e
 * o pacote da funcao na Vercel tem teto de 250 MB. Carregar o segundo so para
 * ler um numero que o primeiro ja imprime nao valeria o espaco.
 */
export async function probeDuration(file: string, cwd?: string): Promise<number> {
  const bin = await ffmpegPath();
  let stderr = '';

  try {
    // Sem saida: o ffmpeg reclama que falta arquivo de destino, mas antes disso
    // ja imprimiu os metadados do arquivo de entrada — que e o que queremos.
    await exec(bin, ['-hide_banner', '-i', file], { cwd, timeout: 60_000 });
  } catch (err: any) {
    stderr = String(err?.stderr ?? '');
  }

  const seconds = parseDuration(stderr);
  if (seconds === null) {
    throw new FfmpegError(
      `nao consegui ler a duracao de ${file}: ${stderr.slice(0, 400)}`,
      stderr,
    );
  }
  return seconds;
}

/** Extrai `Duration: 00:00:06.02` da saida do ffmpeg. Exportada para teste. */
export function parseDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;

  const seconds =
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Verifica se da para renderizar, com mensagem util quando nao da. */
export async function assertFfmpeg(): Promise<void> {
  await ffmpegPath();
}
