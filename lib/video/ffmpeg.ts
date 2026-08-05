import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Wrapper fino em cima do ffmpeg/ffprobe.
 *
 * Usamos execFile (e nao exec) de proposito: os argumentos vao como array, sem
 * passar por shell, entao nome de arquivo com espaco ou aspas nao vira injecao
 * de comando.
 */

export class FfmpegError extends Error {
  constructor(message: string, readonly stderr: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

export async function ffmpeg(args: string[], cwd?: string): Promise<void> {
  try {
    await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 15 * 60_000,
    });
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? err);
    throw new FfmpegError(`ffmpeg falhou: ${stderr.slice(0, 800)}`, stderr);
  }
}

/** Duracao de um arquivo de midia, em segundos. */
export async function probeDuration(file: string, cwd?: string): Promise<number> {
  try {
    const { stdout } = await exec(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      { cwd, timeout: 60_000 },
    );
    const value = Number(stdout.trim());
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`duracao invalida: "${stdout.trim()}"`);
    }
    return value;
  } catch (err: any) {
    throw new FfmpegError(
      `ffprobe falhou em ${file}: ${err?.stderr ?? err?.message}`,
      String(err?.stderr ?? ''),
    );
  }
}

/** Verifica se o ffmpeg esta instalado, com mensagem util quando nao esta. */
export async function assertFfmpeg(): Promise<void> {
  try {
    await exec('ffmpeg', ['-version'], { timeout: 20_000 });
  } catch {
    throw new Error(
      'ffmpeg nao encontrado. Instale com `apt install ffmpeg` (Linux) ou `brew install ffmpeg` (Mac). ' +
        'No GitHub Actions o workflow ja instala automaticamente.',
    );
  }
}
