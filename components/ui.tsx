import Link from 'next/link';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-800 text-slate-300',
  rendering: 'bg-amber-950 text-amber-300',
  ready: 'bg-cyan-950 text-cyan-300',
  publishing: 'bg-amber-950 text-amber-300',
  published: 'bg-emerald-950 text-emerald-300',
  failed: 'bg-red-950 text-red-300',
  rejected: 'bg-slate-800 text-slate-500',
  pending: 'bg-slate-800 text-slate-300',
  approved: 'bg-cyan-950 text-cyan-300',
  rendered: 'bg-emerald-950 text-emerald-300',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'na fila',
  rendering: 'renderizando',
  ready: 'aguardando voce',
  publishing: 'publicando',
  published: 'publicado',
  failed: 'falhou',
  rejected: 'descartado',
  pending: 'aguardando voce',
  approved: 'aprovada',
  rendered: 'virou video',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] ?? 'bg-slate-800 text-slate-300'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 80
      ? 'bg-emerald-950 text-emerald-300'
      : score >= 60
        ? 'bg-cyan-950 text-cyan-300'
        : 'bg-slate-800 text-slate-400';
  return <span className={`chip ${tone}`}>nota {Math.round(score)}</span>;
}

export function EmptyState({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="max-w-xs text-[14px] leading-snug text-muted">{description}</p>
      {href && cta && (
        <Link href={href} className="btn-primary mt-1">
          {cta}
        </Link>
      )}
    </div>
  );
}

/** Formata numeros grandes de views/posts de forma legivel no celular. */
export function compact(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(value);
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const then = new Date(date).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
