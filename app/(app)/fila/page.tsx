import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { videos } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { hydrateEnv } from '@/lib/secrets';
import { listRecentRuns, queueHealth } from '@/lib/github/repo';
import { getSettings } from '@/lib/db/settings';
import { renderProgress } from '@/lib/db/jobs';
import { colabUrl } from '@/lib/colab';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { AutoRefresh } from '@/components/auto-refresh';
import { CaptionEditor } from '@/components/caption-editor';
import { EmptyState, PageHeader, StatusPill, timeAgo } from '@/components/ui';
import {
  clearQueueAction,
  publishVideoAction,
  rejectVideoAction,
  retryVideoAction,
} from '@/app/actions';

export const dynamic = 'force-dynamic';
// Tentar de novo tambem renderiza aqui mesmo; vale o mesmo teto da tela de
// ideias.
export const maxDuration = 300;

/**
 * Quando o GitHub nao entrega maquina, o job fica em "queued" e o video fica
 * "na fila" sem erro nenhum para justificar.
 *
 * O diagnostico ja existia em Configuracoes, mas ninguem abre Configuracoes
 * enquanto espera um video: quem espera fica nesta tela. Nunca lanca — a fila
 * precisa abrir mesmo com o token errado ou o GitHub fora do ar.
 */
async function githubQueue() {
  if (!env.githubToken || !env.githubRepo) return null;
  try {
    const health = queueHealth(await listRecentRuns(10));
    return health.stuck ? health : null;
  } catch {
    return null;
  }
}

export default async function QueuePage() {
  // Sem isso o token guardado no banco nao chega ao `env` e o diagnostico
  // acima desiste antes de perguntar qualquer coisa ao GitHub.
  await hydrateEnv();

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
  const stuck = rows.filter((v) =>
    ['queued', 'rendering', 'failed'].includes(v.status),
  ).length;

  const { renderEngine } = await getSettings();
  const colab = colabUrl();

  // Um render morto no meio nao grava erro nenhum — a funcao simplesmente
  // deixa de existir. O registro de execucao e o unico lugar que sabe em que
  // passo ele estava e ha quanto tempo parou de dar sinal.
  const progresso = await renderProgress(
    rows.filter((v) => v.status === 'rendering').map((v) => v.id),
  ).catch(() => new Map());

  /**
   * Um render vivo sempre tem um registro de execucao em andamento — o status
   * "renderizando" so e gravado de dentro dele. Entao "renderizando" sem
   * registro nenhum nao e lentidao: e um processo que nao existe mais, e o
   * video ficaria ali para sempre esperando por ele.
   */
  const morto = (id: string, status: string) =>
    status === 'rendering' && (progresso.get(id)?.stalled ?? !progresso.has(id));
  const esperandoColab =
    renderEngine === 'manual' && rows.some((v) => v.status === 'queued');

  // So consulta o GitHub quando ha algo esperando por ele: numa fila parada,
  // ou com outro motor escolhido, a chamada seria puro atraso na abertura.
  const github = working && renderEngine === 'github' ? await githubQueue() : null;

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

      {/* Com o motor manual, "na fila" e um estado de espera legitimo, nao uma
          falha — mas so faz sentido se o caminho para renderizar estiver a um
          toque de distancia. */}
      {esperandoColab && (
        <div className="card mb-4 border-sky-900/60 bg-sky-950/30">
          <p className="text-[13px] leading-snug text-sky-100/90">
            Ha video esperando para ser renderizado. Abra o caderno no Colab,
            toque no ▶ e deixe a aba aberta por alguns minutos.
          </p>
          {colab ? (
            <a
              href={colab}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-3"
            >
              Abrir o Colab
            </a>
          ) : (
            <p className="mt-2 text-[12px] text-muted">
              Configure o repositorio em Configuracoes para o link aparecer.
            </p>
          )}
        </div>
      )}

      {github && (
        <div className="card mb-4 border-amber-900/60 bg-amber-950/30">
          <p className="text-[13px] leading-snug text-amber-200/90">
            <strong>O GitHub nao esta entregando maquina.</strong>{' '}
            {github.waiting} execucao(oes) esperam ha ate {github.oldestMinutes}{' '}
            minutos. O job foi criado, mas nenhum runner assumiu — por isso o
            video nao sai de &quot;na fila&quot;. Reenviar apenas empilha jobs.
            Confira a franquia de minutos e o estado da conta em{' '}
            <Link href="/config" className="underline">
              Configuracoes
            </Link>
            .
          </p>
        </div>
      )}

      {/* Videos presos so atrapalham: nao rendem nada e escondem os que
          importam. O botao so aparece quando ha o que limpar. */}
      {stuck > 0 && (
        <div className="mb-4">
          <ActionButton
            action={clearQueueAction}
            className="btn-danger"
            confirm={`Descartar ${stuck} video(s) preso(s) e cancelar as execucoes pendentes?`}
          >
            Limpar fila ({stuck} preso{stuck > 1 ? 's' : ''})
          </ActionButton>
          <p className="mt-1.5 text-[12px] leading-snug text-muted">
            Descarta apenas o que travou. Videos prontos para aprovacao e ja
            publicados nao sao tocados.
          </p>
        </div>
      )}

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
                  {/* Dizer "renderizando" sobre um video que ninguem comecou a
                      renderizar foi exatamente o que fez a fila parecer
                      quebrada. Com o motor manual, a espera e a verdade. */}
                  {video.status === 'failed'
                    ? 'Renderizacao falhou'
                    : esperandoColab && video.status === 'queued'
                      ? 'Esperando voce abrir o Colab'
                      : morto(video.id, video.status)
                        ? 'Renderizacao interrompida'
                        : (progresso.get(video.id)?.step ??
                          'Renderizando… atualize em alguns minutos')}
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

                {/* "na fila" parado tambem precisa de saida: se o job do
                    GitHub Actions nunca rodou, o video fica preso nesse estado
                    sem nenhum erro para justificar um botao de "tentar de
                    novo". */}
                {morto(video.id, video.status) && (
                  <>
                    <p className="text-center text-[12px] leading-snug text-amber-400">
                      {progresso.get(video.id)
                        ? `Sem sinal ha ${progresso.get(video.id)!.silentMinutes} minutos`
                        : 'Nenhum processo esta renderizando este video'}
                      {progresso.get(video.id)?.step
                        ? ` — parou em "${progresso.get(video.id)!.step}"`
                        : ''}
                      . Provavelmente estourou o tempo do servidor.
                    </p>
                    <ActionButton
                      action={retryVideoAction.bind(null, video.id)}
                      className="btn-ghost"
                    >
                      Renderizar de novo
                    </ActionButton>
                  </>
                )}

                {(video.status === 'failed' || video.status === 'queued') && (
                  <ActionButton
                    action={retryVideoAction.bind(null, video.id)}
                    className="btn-ghost"
                  >
                    {video.status === 'queued'
                      ? 'Reenviar para renderizacao'
                      : 'Tentar renderizar de novo'}
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
