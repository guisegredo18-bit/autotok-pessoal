import Link from 'next/link';
import { duration } from '@/lib/format';

export { duration };

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

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return duration(Math.round((Date.now() - new Date(date).getTime()) / 60_000));
}
