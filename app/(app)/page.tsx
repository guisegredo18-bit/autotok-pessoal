import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, jobs, trends, videos } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { autopilotBlockers, describeAutopilot } from '@/lib/pipeline/autopilot';
import { integrationStatus } from '@/lib/env';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { PageHeader, StatusPill, compact, timeAgo } from '@/components/ui';
import { generateFromTrendsAction, runAutopilotAction } from '@/app/actions';
import { runningCommit } from '@/lib/version';

export const dynamic = 'force-dynamic';
// O botao "Gerar ideias" tambem vive aqui, e a geracao roda na requisicao.
// Escrever roteiro leva ~15s; o teto alto cobre um provedor de IA lento sem
// derrubar a tela. Renderizar video nao acontece mais por este caminho — ver
// o comentario em `generateIdeasAction`.
export const maxDuration = 300;

async function count(table: any, where: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row?.n ?? 0;
}

async function counts() {
  const [activeTrends, pendingIdeas, readyVideos, publishedVideos, workingVideos] =
    await Promise.all([
      count(trends, sql`${trends.lastSeenAt} > now() - interval '3 days'`),
      count(ideas, sql`${ideas.status} = 'pending'`),
      count(videos, sql`${videos.status} = 'ready'`),
      count(videos, sql`${videos.status} = 'published'`),
      count(videos, sql`${videos.status} in ('queued','rendering','publishing')`),
    ]);
  return { trends: activeTrends, pendingIdeas, readyVideos, publishedVideos, workingVideos };
}

export default async function Dashboard() {
  const [stats, settings, account, recent, runs] = await Promise.all([
    counts(),
    getSettings(),
    getAccount().catch(() => null),
    db.select().from(videos).orderBy(sql`${videos.createdAt} desc`).limit(4),
    db.select().from(jobs).orderBy(sql`${jobs.startedAt} desc`).limit(5),
  ]);

  const [ideasAboveScore, lastPublished] = await Promise.all([
    count(ideas, sql`${ideas.status} = 'pending' and ${ideas.score} >= ${settings.autoMinScore}`),
    db
      .select({ at: videos.publishedAt })
      .from(videos)
      .where(sql`${videos.status} = 'published'`)
      .orderBy(sql`${videos.publishedAt} desc`)
      .limit(1),
  ]);

  const blockers = autopilotBlockers({
    settings,
    connected: Boolean(account),
    canPostPublic: account?.canPostPublic ?? false,
    pendingIdeas: stats.pendingIdeas,
    pendingAboveScore: ideasAboveScore,
    lastPublishedAt: lastPublished[0]?.at ?? null,
  });

  const status = integrationStatus();
  const missing = Object.entries(status)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return (
    <>
      <PageHeader
        title="AutoTok"
        subtitle={`Nicho: ${settings.niche}`}
      />

      {/* Piloto ligado significa que coisas acontecem sem você abrir o app.
          Quem não sabe disso ao olhar a tela inicial descobre pelo TikTok, que
          é o pior lugar para descobrir. Desligado, não ocupa espaço. */}
      {(settings.autoApprove || settings.autoPublish) && (
        <div
          className={`card mb-4 ${
            blockers.some((b) => b.severity === 'alta')
              ? 'border-amber-900/60 bg-amber-950/30'
              : 'border-brand/40 bg-brand/10'
          }`}
        >
          <Link href="/config" className="block">
            <p className="text-[14px] font-semibold">
              Piloto automatico ligado
              {settings.autoPublish && ' — publicando sozinho'}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              {describeAutopilot(settings)}. Toque para ajustar ou desligar.
            </p>
          </Link>

          {/* Um piloto que roda sem entregar nada nao da erro em lugar nenhum:
              os jobs ficam verdes e o canal fica parado. E aqui que isso vira
              uma frase, com o que fazer a respeito logo abaixo. */}
          {blockers.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              {blockers.map((blocker) => (
                <li key={blocker.label}>
                  <p
                    className={`text-[13px] font-semibold ${
                      blocker.severity === 'alta' ? 'text-amber-300' : ''
                    }`}
                  >
                    {blocker.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{blocker.hint}</p>
                </li>
              ))}
            </ul>
          )}

          {/* O piloto age no cron, de seis em seis horas. Nos primeiros dias
              — que sao os que decidem se voce vai confiar nele — esperar ate
              as 18h para ver o que ele escolhe e tempo demais. */}
          <div className="mt-3 border-t border-line pt-3">
            <ActionButton action={runAutopilotAction}>Rodar o piloto agora</ActionButton>
          </div>
        </div>
      )}

      {/* Só chamamos atenção para o que está faltando; configuração completa
          não merece ocupar espaço na tela principal. */}
      {missing.length > 0 && (
        <div className="card mb-4 border-amber-900/60 bg-amber-950/30">
          <p className="text-[14px] font-semibold text-amber-300">Configuracao incompleta</p>
          <p className="mt-1 text-[13px] leading-snug text-amber-200/80">
            Faltando: {missing.join(', ')}. Veja o que cada item faz em{' '}
            <Link href="/config" className="underline">
              Configuracoes
            </Link>
            .
          </p>
        </div>
      )}

      {!account && (
        <div className="card mb-4 border-brand/40 bg-brand/10">
          <p className="text-[14px] font-semibold">Conecte sua conta do TikTok</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Sem isso, os videos sao gerados mas nao publicados.
          </p>
          <Link href="/config" className="btn-primary mt-3 w-full">
            Conectar agora
          </Link>
        </div>
      )}

      <section className="mb-5 grid grid-cols-2 gap-3">
        <Stat label="Tendencias ativas" value={stats.trends} href="/tendencias" />
        <Stat label="Ideias esperando" value={stats.pendingIdeas} href="/ideias" highlight />
        <Stat label="Videos para aprovar" value={stats.readyVideos} href="/fila" highlight />
        <Stat label="Publicados" value={stats.publishedVideos} href="/fila" />
      </section>

      {/* A busca automatica saiu daqui: o TikTok fechou o acesso publico a
          essa API, e um botao que quase sempre falha nao merece o lugar mais
          nobre da tela. Ele continua em Trends, ao lado do cadastro manual. */}
      <section className="mb-5 flex flex-col gap-3">
        <ActionButton action={generateFromTrendsAction} className="btn-primary">
          Gerar ideias
        </ActionButton>
        {stats.trends === 0 && (
          <Link href="/tendencias" className="btn-ghost">
            Adicionar uma tendencia do TikTok
          </Link>
        )}
      </section>

      {stats.workingVideos > 0 && (
        <p className="mb-4 text-center text-[13px] text-muted">
          {stats.workingVideos} video(s) sendo processado(s) em segundo plano.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Ultimos videos
        </h2>
        {recent.length === 0 ? (
          <p className="text-[14px] text-muted">Nada ainda. Comece buscando tendencias.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((video) => (
              <li key={video.id}>
                <Link href="/fila" className="card flex items-center gap-3">
                  <div className="h-14 w-9 shrink-0 overflow-hidden rounded-md bg-panel2">
                    {video.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{video.caption || 'Sem legenda'}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {timeAgo(video.createdAt)} atras
                      {video.durationSeconds
                        ? ` · ${Math.round(video.durationSeconds)}s`
                        : ''}
                    </p>
                  </div>
                  <StatusPill status={video.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Os jobs pesados rodam no GitHub Actions, longe daqui. Quando um video
          nao aparece, esta lista responde "chegou a rodar?" sem precisar abrir
          a aba de Actions no celular. */}
      {runs.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Ultimas execucoes
          </h2>
          <ul className="card flex flex-col divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px]">{JOB_LABELS[run.type] ?? run.type}</p>
                  <span
                    className={`text-[12px] ${
                      run.status === 'failed'
                        ? 'text-red-400'
                        : run.status === 'running'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {run.status === 'running'
                      ? 'rodando'
                      : run.status === 'failed'
                        ? 'falhou'
                        : 'ok'}{' '}
                    · ha {timeAgo(run.startedAt)}
                  </span>
                </div>
                {run.status === 'failed' && run.message && (
                  <p className="mt-1 text-[12px] leading-snug text-red-300">{run.message}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <VersionFooter />
    </>
  );
}

/**
 * Versao no rodape, sem consultar o GitHub — a comparacao com o repositorio
 * fica em Configuracoes. Aqui e so para dar uma resposta imediata a pergunta
 * "sera que o deploy pegou?".
 */
function VersionFooter() {
  const commit = runningCommit();
  return (
    <p className="mt-6 text-center text-[11px] text-muted">
      versao {commit || 'local'}
    </p>
  );
}

const JOB_LABELS: Record<string, string> = {
  scan: 'Busca de tendencias',
  ideas: 'Geracao de ideias',
  render: 'Renderizacao de video',
  publish: 'Publicacao no TikTok',
  auto: 'Piloto automatico',
};

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card ${highlight && value > 0 ? 'border-brand/50' : ''}`}
    >
      <p className="text-[28px] font-bold leading-none">{compact(value) === '—' ? 0 : value}</p>
      <p className="mt-1.5 text-[12px] leading-tight text-muted">{label}</p>
    </Link>
  );
}
