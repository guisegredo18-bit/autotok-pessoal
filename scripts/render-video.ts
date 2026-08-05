import { arg, die } from './_bootstrap';

/**
 * Renderiza um video. Com `--video=<id>` (ou VIDEO_ID) processa aquele; sem
 * argumento, pega o mais antigo da fila — o que permite usar o mesmo script
 * tanto no disparo por evento quanto num cron de recuperacao.
 */
async function main() {
  const { db } = await import('../lib/db');
  const { videos } = await import('../lib/db/schema');
  const { renderQueuedVideo } = await import('../lib/pipeline/render');
  const { sql } = await import('drizzle-orm');

  let videoId = arg('video', 'VIDEO_ID');

  if (!videoId) {
    const [next] = await db
      .select({ id: videos.id })
      .from(videos)
      .where(sql`${videos.status} = 'queued'`)
      .orderBy(sql`${videos.createdAt} asc`)
      .limit(1);

    if (!next) {
      console.log('Nada na fila de renderizacao.');
      process.exit(0);
    }
    videoId = next.id;
  }

  console.log(`Renderizando video ${videoId}…`);
  await renderQueuedVideo(videoId);
  console.log('✔ Video renderizado e disponivel para aprovacao');
  process.exit(0);
}

main().catch(die);
