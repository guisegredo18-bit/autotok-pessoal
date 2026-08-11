import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, videos, type Scene } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { buildCaption } from '@/lib/ai/script';
import { voiceForMarket } from '@/lib/ai/mercado';
import { autoPublishReady } from '@/lib/pipeline/autopilot';
import { SEM_NARRACAO, renderVideo } from '@/lib/video/render';
import { putFile } from '@/lib/storage';
import { push } from '@/lib/notify';
import { withJob } from '@/lib/db/jobs';
import { hydrateEnv } from '@/lib/secrets';
import { env } from '@/lib/env';

/** Coloca uma ideia aprovada na fila de renderizacao. */
export async function enqueueRender(ideaId: string): Promise<string> {
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1);
  if (!idea) throw new Error('Ideia nao encontrada.');

  const settings = await getSettings();

  const [video] = await db
    .insert(videos)
    .values({
      ideaId: idea.id,
      status: 'queued',
      caption: buildCaption(idea.caption, idea.hashtags, settings.captionSignature),
      hashtags: idea.hashtags,
    })
    .returning({ id: videos.id });

  await db.update(ideas).set({ status: 'approved' }).where(eq(ideas.id, idea.id));
  return video.id;
}

/**
 * Renderiza um video da fila e guarda o resultado.
 *
 * Roda no GitHub Actions (onde tem ffmpeg e tempo de CPU sobrando), nao no
 * processo do painel — renderizar um video leva minutos e derrubaria qualquer
 * request HTTP por timeout.
 */
export async function renderQueuedVideo(videoId: string): Promise<void> {
  await hydrateEnv();
  return withJob('render', videoId, (log) => renderInner(videoId, log));
}

async function renderInner(videoId: string, log: (message: string) => void): Promise<void> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new Error(`Video ${videoId} nao encontrado.`);
  if (!video.ideaId) throw new Error(`Video ${videoId} nao tem roteiro associado.`);

  const [idea] = await db.select().from(ideas).where(eq(ideas.id, video.ideaId)).limit(1);
  if (!idea) throw new Error('Roteiro do video nao encontrado.');

  await db.update(videos).set({ status: 'rendering', error: null }).where(eq(videos.id, videoId));

  /**
   * A voz precisa falar o idioma do roteiro.
   *
   * Sem isto, um roteiro em ingles sairia narrado pela voz brasileira padrao —
   * com sotaque de leitura fonetica, que nao vende para publico americano
   * nenhum. Ajustar `env` aqui segue o mesmo padrao de `hydrateEnv`: a origem
   * do valor e detalhe de configuracao, e o modulo de narracao continua lendo
   * `env.ttsVoice` sem saber de mercado.
   */
  const settings = await getSettings();
  env.ttsVoice = voiceForMarket(settings.language, env.ttsVoice);

  try {
    const result = await renderVideo(idea.scenes as Scene[], (msg) => {
      console.log(`  ${msg}`);
      log(msg);
    });

    const stamp = Date.now();
    const [stored, thumb] = await Promise.all([
      putFile(`videos/${videoId}-${stamp}.mp4`, result.video, 'video/mp4'),
      putFile(`thumbs/${videoId}-${stamp}.jpg`, result.thumbnail, 'image/jpeg'),
    ]);

    // Video mudo existe para ser assistido e julgado, nao para ir sozinho ao
    // seu perfil. O piloto respeita esta marca.
    const semVoz = result.warnings.some((w) => w.startsWith(SEM_NARRACAO));

    await db
      .update(videos)
      .set({
        needsReview: semVoz,
        status: 'ready',
        videoUrl: stored.url,
        videoKey: stored.key,
        thumbUrl: thumb.url,
        thumbKey: thumb.key,
        durationSeconds: result.durationSeconds,
        sizeBytes: stored.size,
        renderedAt: new Date(),
        error: result.warnings.length > 0 ? result.warnings.join(' | ') : null,
      })
      .where(eq(videos.id, videoId));

    await db.update(ideas).set({ status: 'rendered' }).where(eq(ideas.id, idea.id));

    const publicaSozinho = settings.autoPublish && !semVoz;

    await push({
      title: semVoz
        ? 'Video pronto, mas sem voz'
        : publicaSozinho
          ? 'Video pronto — indo para o TikTok'
          : 'Video pronto para aprovacao',
      message: semVoz
        ? `${idea.hook}\n\n${Math.round(result.durationSeconds)}s legendados, sem narracao — a narracao falhou. O piloto nao vai publicar este; assista e decida.`
        : publicaSozinho
          ? `${idea.hook}\n\n${Math.round(result.durationSeconds)}s — o piloto automatico publica sozinho. Abra a Fila se quiser barrar antes.`
          : `${idea.hook}\n\n${Math.round(result.durationSeconds)}s — abra o painel para assistir e aprovar.`,
      url: `${env.appUrl}/fila`,
      tags: semVoz ? ['mute'] : ['clapper'],
    });

    /**
     * Com o piloto ligado, o video vai ao ar aqui mesmo.
     *
     * Publicar logo apos renderizar e o que faz a automacao valer: o roteiro
     * nasceu de uma tendencia do dia, e esperar o proximo cron pode custar
     * justamente a janela em que o assunto rende. A trava de intervalo e o
     * teto diario continuam valendo — quem decide e o piloto, nao este ponto
     * do codigo.
     *
     * Falhar aqui nao desfaz o render: o video esta pronto e guardado, e o
     * erro da publicacao ja foi gravado e notificado. Marcar o render como
     * falho por causa disso mandaria voce renderizar de novo o que nao
     * precisa.
     */
    if (settings.autoPublish) {
      try {
        const auto = await autoPublishReady(log);
        if (auto.published.length === 0 && auto.reason) log(`piloto: ${auto.reason}`);
      } catch (err) {
        log(`piloto: falhou ao publicar — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(videos)
      .set({ status: 'failed', error: message.slice(0, 2000) })
      .where(eq(videos.id, videoId));

    await push({
      title: 'Falha ao renderizar video',
      message: message.slice(0, 400),
      priority: 4,
      url: `${env.appUrl}/fila`,
      tags: ['warning'],
    });
    throw err;
  }
}
