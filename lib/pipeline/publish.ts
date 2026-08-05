import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { videos } from '@/lib/db/schema';
import { getFile } from '@/lib/storage';
import { push } from '@/lib/notify';
import { env } from '@/lib/env';
import { getValidAccessToken, setCanPostPublic } from '@/lib/tiktok/account';
import {
  getCreatorInfo,
  initDirectPost,
  uploadVideo,
  waitForPublish,
} from '@/lib/tiktok/api';

/**
 * Escolhe a privacidade do post.
 *
 * O TikTok so aceita um nivel que a conta realmente ofereca. Enquanto o app nao
 * passa na auditoria, a unica opcao devolvida e SELF_ONLY — nesse caso o video
 * chega como privado e voce troca a privacidade no app, com um toque.
 */
function pickPrivacy(options: string[], preferred: string): string {
  if (options.includes(preferred)) return preferred;
  if (options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
  if (options.length > 0) return options[0];
  return 'SELF_ONLY';
}

/** Extrai a chave de armazenamento a partir da URL publica salva no banco. */
function keyFromUrl(url: string): string {
  const marker = '/videos/';
  const at = url.indexOf(marker);
  if (at === -1) throw new Error(`Nao consegui identificar o arquivo em ${url}`);
  return url.slice(at + 1);
}

export type PublishResult = {
  publishId: string;
  privacyLevel: string;
  /** true quando o video foi como privado por falta de auditoria do app. */
  privateOnly: boolean;
};

/** Publica um video aprovado no TikTok. */
export async function publishVideo(videoId: string): Promise<PublishResult> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new Error(`Video ${videoId} nao encontrado.`);
  if (!video.videoUrl) throw new Error('Video ainda nao foi renderizado.');
  if (video.status === 'published') throw new Error('Este video ja foi publicado.');

  await db
    .update(videos)
    .set({ status: 'publishing', error: null })
    .where(eq(videos.id, videoId));

  try {
    const accessToken = await getValidAccessToken();

    const creator = await getCreatorInfo(accessToken);
    const options = creator.privacy_level_options ?? [];
    const privacyLevel = pickPrivacy(options, video.privacyLevel);
    const privateOnly = !options.includes('PUBLIC_TO_EVERYONE');
    await setCanPostPublic(!privateOnly);

    const bytes = await getFile(keyFromUrl(video.videoUrl));

    if (
      creator.max_video_post_duration_sec &&
      video.durationSeconds &&
      video.durationSeconds > creator.max_video_post_duration_sec
    ) {
      throw new Error(
        `O video tem ${Math.round(video.durationSeconds)}s e a conta so aceita ate ` +
          `${creator.max_video_post_duration_sec}s.`,
      );
    }

    const { publish_id, upload_url } = await initDirectPost(
      accessToken,
      {
        title: video.caption,
        privacyLevel,
        // Respeitamos as travas da conta: mandar `false` onde o criador
        // desativou comentario/duet/stitch faz o TikTok recusar o post.
        disableComment: creator.comment_disabled ?? false,
        disableDuet: creator.duet_disabled ?? false,
        disableStitch: creator.stitch_disabled ?? false,
      },
      bytes.length,
    );

    await uploadVideo(upload_url, bytes);
    await waitForPublish(accessToken, publish_id, {
      onTick: (status) => console.log(`  status: ${status}`),
    });

    await db
      .update(videos)
      .set({
        status: 'published',
        tiktokPublishId: publish_id,
        privacyLevel,
        publishedAt: new Date(),
        error: null,
      })
      .where(eq(videos.id, videoId));

    await push({
      title: privateOnly ? 'Video enviado (privado)' : 'Video publicado no TikTok',
      message: privateOnly
        ? 'Chegou na sua conta como privado porque o app ainda nao passou na auditoria do TikTok. Abra o TikTok e mude a privacidade para publicar.'
        : video.caption.slice(0, 200),
      url: `${env.appUrl}/fila`,
      tags: privateOnly ? ['lock'] : ['rocket'],
    });

    return { publishId: publish_id, privacyLevel, privateOnly };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(videos)
      .set({ status: 'failed', error: message.slice(0, 2000) })
      .where(eq(videos.id, videoId));

    await push({
      title: 'Falha ao publicar no TikTok',
      message: message.slice(0, 400),
      priority: 4,
      url: `${env.appUrl}/fila`,
      tags: ['warning'],
    });
    throw err;
  }
}
