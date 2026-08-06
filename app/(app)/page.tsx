import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, jobs, trends, videos } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { integrationStatus } from '@/lib/env';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { PageHeader, StatusPill, compact, timeAgo } from '@/components/ui';
import { scanAction, generateFromTrendsAction } from '@/app/actions';
import { runningCommit } from '@/lib/version';

export const dynamic = 'force-dynamic';

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

      <section className="mb-5 flex flex-col gap-3">
        <ActionButton action={scanAction} className="btn-ghost">
          Buscar tendencias agora
        </ActionButton>
        <ActionButton action={generateFromTrendsAction} className="btn-primary">
          Gerar ideias das tendencias
        </ActionButton>
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
