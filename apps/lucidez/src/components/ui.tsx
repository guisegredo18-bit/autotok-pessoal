import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border-brand active:scale-[0.98]',
  secondary: 'bg-surface text-ink border-line active:scale-[0.98]',
  ghost: 'bg-transparent text-muted border-transparent',
  danger: 'bg-bad text-white border-bad active:scale-[0.98]',
};

export function Button({
  variant = 'primary',
  full,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      {...props}
      className={`btn ${VARIANTS[variant]} ${full ? 'w-full' : ''} disabled:opacity-40 ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

/** Estrutura padrao de tela: titulo grande, subtitulo opcional e conteudo. */
export function Page({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.7em] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[0.95em] leading-snug text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

const TONES = {
  bom: 'bg-ok-soft text-ok border-ok/25',
  atencao: 'bg-warn-soft text-warn border-warn/25',
  ruim: 'bg-bad-soft text-bad border-bad/25',
  neutro: 'bg-surface-2 text-muted border-line',
  marca: 'bg-brand-soft text-brand border-brand/25',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutro', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.78em] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-[0.75em] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[1.35em] font-bold leading-none tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[0.78em] text-muted">{hint}</div>}
    </div>
  );
}

/** Barra 0-100 usada para notas. A cor segue a faixa, nunca sozinha: o numero
 *  ao lado carrega a mesma informacao para quem nao distingue as cores. */
export function Meter({ value, tone = 'marca' }: { value: number; tone?: Tone }) {
  const fill = { bom: 'bg-ok', atencao: 'bg-warn', ruim: 'bg-bad', neutro: 'bg-muted', marca: 'bg-brand' }[tone];
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, detail, action }: { icon: string; title: string; detail: string; action?: ReactNode }) {
  return (
    <Card className="text-center">
      <div className="text-[2.2em] leading-none" aria-hidden>
        {icon}
      </div>
      <h2 className="mt-2 text-[1.1em] font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-[0.92em] text-muted">{detail}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

/** Aviso permanente. O app mede desempenho em jogos, nao faz diagnostico, e
 *  isso precisa estar visivel onde as conclusoes sao lidas. */
export function ClinicalNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[0.82em] leading-snug text-muted ${className}`}>
      O Lucidez acompanha desempenho em jogos ao longo do tempo. Ele não faz diagnóstico e não
      substitui avaliação médica ou neuropsicológica. Use os gráficos como assunto para a consulta —
      qualquer mudança importante merece conversa com um profissional de saúde.
    </p>
  );
}
