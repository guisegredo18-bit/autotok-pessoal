import { die } from './_bootstrap';

/**
 * Processa toda a fila de renderizacao, respeitando o limite diario.
 *
 * Existe como rede de seguranca: se um disparo de evento se perder (o
 * repository_dispatch e best-effort), o cron diario pega o que ficou para tras.
 */
async function main() {
  const { db } = await import('../lib/db');
  const { videos } = await import('../lib/db/schema');
  const { getSettings } = await import('../lib/db/settings');
  const { renderQueuedVideo } = await import('../lib/pipeline/render');
  const { sql } = await import('drizzle-orm');

  const settings = await getSettings();

  const [publishedToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videos)
    .where(sql`${videos.renderedAt} > now() - interval '24 hours'`);

  const budget = Math.max(0, settings.videosPerDay - (publishedToday?.n ?? 0));
  if (budget === 0) {
    console.log(`Limite diario de ${settings.videosPerDay} videos ja atingido.`);
    process.exit(0);
  }

  const queued = await db
    .select({ id: videos.id })
    .from(videos)
    .where(sql`${videos.status} = 'queued'`)
    .orderBy(sql`${videos.createdAt} asc`)
    .limit(budget);

  if (queued.length === 0) {
    console.log('Fila vazia.');
    process.exit(0);
  }

  console.log(`Renderizando ${queued.length} video(s) (limite restante hoje: ${budget})`);

  let failures = 0;
  for (const video of queued) {
    console.log(`\n→ ${video.id}`);
    try {
      await renderQueuedVideo(video.id);
      console.log('  ✔ pronto');
    } catch (err) {
      // Um video quebrado nao pode impedir os outros de renderizar; o erro
      // ja foi gravado no banco e notificado.
      failures++;
      console.error(`  ✖ ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${queued.length - failures} ok · ${failures} falha(s)`);
  process.exit(failures > 0 && failures === queued.length ? 1 : 0);
}

main().catch(die);
