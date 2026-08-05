import { arg, die } from './_bootstrap';

async function main() {
  const { publishVideo } = await import('../lib/pipeline/publish');

  const videoId = arg('video', 'VIDEO_ID');
  if (!videoId) {
    throw new Error('Informe o video: --video=<id> ou VIDEO_ID=<id>');
  }

  console.log(`Publicando video ${videoId} no TikTok…`);
  const result = await publishVideo(videoId);

  console.log(`  publish_id: ${result.publishId}`);
  console.log(`  privacidade: ${result.privacyLevel}`);
  if (result.privateOnly) {
    console.log(
      '  Obs.: o app ainda nao passou na auditoria do TikTok, entao o video ficou privado.\n' +
        '  Abra o TikTok e mude a privacidade para publicar de fato.',
    );
  }
  console.log('✔ Publicacao concluida');
  process.exit(0);
}

main().catch(die);
