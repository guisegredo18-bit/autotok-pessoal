import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { videos } from '@/lib/db/schema';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { AutoRefresh } from '@/components/auto-refresh';
import { CaptionEditor } from '@/components/caption-editor';
import { EmptyState, PageHeader, StatusPill, timeAgo } from '@/components/ui';
import { publishVideoAction, rejectVideoAction, retryVideoAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const [rows, account] = await Promise.all([
    db
      .select()
      .from(videos)
      .where(sql`${videos.status} <> 'rejected'`)
      .orderBy(sql`${videos.createdAt} desc`)
      .limit(30),
    getAccount().catch(() => null),
  ]);

  const waiting = rows.filter((v) => v.status === 'ready');
  const working = rows.some((v) =>
    ['queued', 'rendering', 'publishing'].includes(v.status),
  );

  return (
    <>
      {working && <AutoRefresh />}
      <PageHeader
        title="Fila"
        subtitle={
          waiting.length > 0
            ? `${waiting.length} video(s) esperando sua aprovacao.`
            : 'Nada esperando por voce agora.'
        }
      />

      {account && !account.canPostPublic && (
        <div className="card mb-4 border-amber-900/60 bg-amber-950/30">
          <p className="text-[13px] leading-snug text-amber-200/90">
            Seu app do TikTok ainda nao passou pela auditoria, entao os videos
            chegam na sua conta como <strong>privados</strong>. E so abrir o
            TikTok e mudar a privacidade. Depois da auditoria, a publicacao vira
            100% automatica.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Fila vazia"
          description="Aprove uma ideia para que ela vire video."
          href="/ideias"
          cta="Ver ideias"
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((video) => (
            <li key={video.id} className="card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[12px] text-muted">
                  ha {timeAgo(video.createdAt)}
                  {video.durationSeconds ? ` · ${Math.round(video.durationSeconds)}s` : ''}
                  {video.sizeBytes
                    ? ` · ${(video.sizeBytes / 1024 / 1024).toFixed(1)}MB`
                    : ''}
                </p>
                <StatusPill status={video.status} />
              </div>

              {video.videoUrl ? (
                <video
                  src={video.videoUrl}
                  poster={video.thumbUrl ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="mb-3 aspect-[9/16] w-full rounded-xl bg-black"
                />
              ) : (
                <div className="mb-3 flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-panel2 text-[13px] text-muted">
                  {video.status === 'failed'
                    ? 'Renderizacao falhou'
                    : 'Renderizando… atualize em alguns minutos'}
                </div>
              )}

              {video.status === 'ready' ? (
                <CaptionEditor videoId={video.id} caption={video.caption} />
              ) : (
                <p className="whitespace-pre-line text-[13px] leading-snug text-muted">
                  {video.caption}
                </p>
              )}

              {video.error && (
                <p className="mt-2 rounded-lg bg-red-950/40 p-2.5 text-[12px] leading-snug text-red-300">
                  {video.error}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {video.status === 'ready' && (
                  <div className="flex gap-2">
                    <ActionButton
                      action={publishVideoAction.bind(null, video.id)}
                      className="btn-primary"
                      wrapperClassName="flex flex-[2] flex-col gap-1.5"
                      confirm="Publicar este video no TikTok?"
                    >
                      Aprovar e publicar
                    </ActionButton>
                    <ActionButton
                      action={rejectVideoAction.bind(null, video.id)}
                      className="btn-danger"
                      wrapperClassName="flex flex-1 flex-col gap-1.5"
                      feedback="none"
                    >
                      Descartar
                    </ActionButton>
                  </div>
                )}

                {video.status === 'failed' && (
                  <ActionButton
                    action={retryVideoAction.bind(null, video.id)}
                    className="btn-ghost"
                  >
                    Tentar renderizar de novo
                  </ActionButton>
                )}

                {video.status === 'published' && (
                  <p className="text-center text-[13px] text-emerald-400">
                    Publicado ha {timeAgo(video.publishedAt)}
                    {video.privacyLevel === 'SELF_ONLY' && ' (privado)'}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
