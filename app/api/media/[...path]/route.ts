import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { isLoggedIn } from '@/lib/auth';
import { safeLocalPath } from '@/lib/storage';
import { env } from '@/lib/env';

/**
 * Serve os videos quando STORAGE_DRIVER=local.
 *
 * Exige sessao: os videos ainda nao publicados sao conteudo privado, e uma URL
 * previsivel sem autenticacao deixaria qualquer um assistir. Com S3/R2 essa
 * rota nao e usada — o bucket serve direto.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  if (env.storageDriver !== 'local') {
    return new NextResponse('Armazenamento local desativado.', { status: 404 });
  }
  if (!(await isLoggedIn())) {
    return new NextResponse('Nao autenticado.', { status: 401 });
  }

  const { path: segments } = await context.params;

  let file: string;
  try {
    // safeLocalPath rejeita qualquer caminho que escape da pasta de midia.
    file = safeLocalPath(segments.join('/'));
  } catch {
    return new NextResponse('Caminho invalido.', { status: 400 });
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('nao e arquivo');

    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        'content-type': mimeFor(file),
        'content-length': String(info.size),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('Arquivo nao encontrado.', { status: 404 });
  }
}

function mimeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}
