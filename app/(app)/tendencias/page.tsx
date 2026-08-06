import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trends } from '@/lib/db/schema';
import { ActionButton } from '@/components/action-button';
import { AddTrendForm } from '@/components/add-trend-form';
import { EmptyState, PageHeader, ScorePill, compact, timeAgo } from '@/components/ui';
import { scanAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  hashtag: '#',
  sound: '♪',
  product: '🛍',
  keyword: '⌕',
};

export default async function TrendsPage() {
  const rows = await db
    .select()
    .from(trends)
    .where(sql`${trends.lastSeenAt} > now() - interval '7 days'`)
    .orderBy(sql`${trends.score} desc`)
    .limit(40);

  return (
    <>
      <PageHeader
        title="Tendencias"
        subtitle="Do TikTok Creative Center. Nota alta = volume bom com crescimento."
      />

      <AddTrendForm />

      <div className="mb-5">
        <ActionButton action={scanAction} className="btn-ghost w-full">
          Buscar automaticamente
        </ActionButton>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma tendencia ainda"
          description="Adicione uma que voce viu no TikTok, ou tente a busca automatica. Se as duas falharem, voce ainda pode gerar ideias digitando um assunto na tela Ideias."
          href="/ideias"
          cta="Ir para Ideias"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((trend) => (
            <li key={trend.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">
                    <span className="mr-1 text-muted">{KIND_LABEL[trend.kind] ?? '•'}</span>
                    {trend.name}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {compact(trend.viewCount)} views · {compact(trend.postCount)} posts
                    {trend.growthRate != null && (
                      <span
                        className={
                          trend.growthRate > 0 ? ' text-emerald-400' : ' text-muted'
                        }
                      >
                        {' '}
                        · {trend.growthRate > 0 ? '+' : ''}
                        {Math.round(trend.growthRate * 100)}%
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    visto ha {timeAgo(trend.lastSeenAt)} · {trend.country}
                  </p>
                </div>
                <ScorePill score={trend.score} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
