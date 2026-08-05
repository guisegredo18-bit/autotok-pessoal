import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env, requireEnv } from '@/lib/env';

/**
 * Armazenamento dos videos e thumbnails.
 *
 * Dois modos:
 *  - `s3`    : Cloudflare R2 ou qualquer bucket compativel com S3. Obrigatorio
 *              quando o render roda no GitHub Actions, porque o runner e
 *              descartado assim que o job termina.
 *  - `local` : pasta ./data/media, servida por /api/media/[...path]. Serve para
 *              rodar tudo num VPS unico.
 */

const LOCAL_DIR = path.resolve(process.cwd(), 'data', 'media');

export type StoredFile = { key: string; url: string; size: number };

export async function putFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredFile> {
  if (env.storageDriver === 's3') return putS3(key, body, contentType);
  return putLocal(key, body);
}

export async function getFile(key: string): Promise<Buffer> {
  if (env.storageDriver === 's3') return getS3(key);
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export function publicUrl(key: string): string {
  if (env.storageDriver === 's3') return `${env.s3PublicUrl}/${key}`;
  return `${env.appUrl}/api/media/${key}`;
}

// --- S3 / R2 ---------------------------------------------------------------

async function s3Client() {
  requireEnv('s3Bucket', 's3AccessKeyId', 's3SecretAccessKey');
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint || undefined,
    credentials: {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    },
    // R2 e a maioria dos compativeis exigem path-style.
    forcePathStyle: true,
  });
}

async function putS3(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrl(key), size: body.length };
}

async function getS3(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await s3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// --- Local -----------------------------------------------------------------

async function putLocal(key: string, body: Buffer): Promise<StoredFile> {
  const dest = safeLocalPath(key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, body);
  return { key, url: publicUrl(key), size: body.length };
}

/**
 * Impede que uma chave com `..` escape da pasta de midia. As chaves sao
 * geradas internamente hoje, mas a rota /api/media aceita caminho da URL —
 * entao a checagem fica no lugar onde o caminho vira arquivo de verdade.
 */
export function safeLocalPath(key: string): string {
  const resolved = path.resolve(LOCAL_DIR, key);
  if (resolved !== LOCAL_DIR && !resolved.startsWith(LOCAL_DIR + path.sep)) {
    throw new Error('Caminho de midia invalido.');
  }
  return resolved;
}

export const localMediaDir = LOCAL_DIR;
