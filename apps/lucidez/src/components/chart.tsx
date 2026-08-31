import { useMemo, useState } from 'react';
import type { Baseline, SeriesPoint } from '@/core/trend';

/**
 * Graficos do relatorio.
 *
 * Tres escolhas guiam tudo aqui:
 *
 *  - O eixo Y e sempre 0-100 fixo. Ajustar a escala aos dados faria uma
 *    oscilacao de tres pontos preencher a tela inteira e parecer despencar.
 *    Num app que fala de doenca neurologica, exagerar ruido nao e um detalhe
 *    de estilo.
 *  - A faixa cinza e a linha de base da propria pessoa, mais ou menos um
 *    desvio padrao. O que esta dentro dela e variacao normal, e isso responde
 *    "devo me preocupar?" antes de qualquer numero.
 *  - Uma serie por grafico. Seis dominios viram seis graficos pequenos, e nao
 *    seis linhas coloridas embaralhadas — que ninguem distingue, ainda mais
 *    quem nao enxerga cor bem.
 */

const W = 320;
const H = 150;
const PAD = { top: 12, right: 14, bottom: 22, left: 30 };

function scaleX(index: number, count: number): number {
  if (count <= 1) return PAD.left + (W - PAD.left - PAD.right) / 2;
  return PAD.left + (index / (count - 1)) * (W - PAD.left - PAD.right);
}

function scaleY(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return H - PAD.bottom - (clamped / 100) * (H - PAD.top - PAD.bottom);
}

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function LineChart({
  points,
  baseline,
  label,
  unitLabel = 'pontos',
}: {
  points: SeriesPoint[];
  baseline: Baseline | null;
  label: string;
  unitLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const path = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i, points.length).toFixed(1)},${scaleY(p.score).toFixed(1)}`)
        .join(' '),
    [points],
  );

  if (points.length === 0) return null;

  const showDots = points.length <= 20;
  const last = points[points.length - 1]!;
  const selected = active !== null ? points[active] : null;

  function pick(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // Converte o toque em coordenada do viewBox antes de procurar o ponto mais
    // proximo, senao a conta erra em qualquer largura diferente de 320.
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDistance = Infinity;
    points.forEach((_, i) => {
      const distance = Math.abs(scaleX(i, points.length) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActive(best);
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto', touchAction: 'pan-y' }}
        role="img"
        aria-label={`${label}: ${points.length} sessões, de ${points[0]!.score.toFixed(0)} a ${last.score.toFixed(0)} pontos.`}
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') pick(e);
        }}
        onPointerLeave={() => setActive(null)}
      >
        {baseline && (
          <>
            <rect
              x={PAD.left}
              y={scaleY(baseline.center + baseline.sd)}
              width={W - PAD.left - PAD.right}
              height={Math.max(2, scaleY(baseline.center - baseline.sd) - scaleY(baseline.center + baseline.sd))}
              fill="var(--color-surface-2)"
            />
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scaleY(baseline.center)}
              y2={scaleY(baseline.center)}
              stroke="var(--color-line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="var(--color-line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              opacity={tick === 0 ? 1 : 0.5}
            />
            <text x={PAD.left - 6} y={scaleY(tick) + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">
              {tick}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {showDots &&
          points.map((p, i) => (
            <circle
              key={`${p.date}-${i}`}
              cx={scaleX(i, points.length)}
              cy={scaleY(p.score)}
              r="3"
              fill="var(--color-brand)"
              stroke="var(--color-surface)"
              strokeWidth="1.5"
            />
          ))}

        {/* Rotulo direto so no ultimo ponto: um numero em cada ponto vira
            poluicao e ninguem le. */}
        <circle cx={scaleX(points.length - 1, points.length)} cy={scaleY(last.score)} r="4.5" fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth="2" />

        {selected && active !== null && (
          <g>
            <line
              x1={scaleX(active, points.length)}
              x2={scaleX(active, points.length)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-muted)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={scaleX(active, points.length)} cy={scaleY(selected.score)} r="5" fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}

        <text x={PAD.left} y={H - 6} fontSize="9" fill="var(--color-muted)">
          {shortDate(points[0]!.date)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-muted)">
          {shortDate(last.date)}
        </text>
      </svg>
      <figcaption className="mt-1 min-h-[1.4em] text-center text-[0.85em] text-muted">
        {selected
          ? `${shortDate(selected.date)}: ${selected.score.toFixed(0)} ${unitLabel}`
          : `Toque no gráfico para ver cada sessão · último: ${last.score.toFixed(0)} ${unitLabel}`}
      </figcaption>
    </figure>
  );
}

/** Versao miniatura para a grade de dominios: sem eixos, so a forma da curva,
 *  a faixa da linha de base e o valor mais recente escrito ao lado. */
export function Sparkline({ points, baseline }: { points: SeriesPoint[]; baseline: Baseline | null }) {
  const w = 120;
  const h = 34;
  if (points.length === 0) return <div className="h-[34px]" />;

  const x = (i: number) => (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (score: number) => h - (Math.max(0, Math.min(100, score)) / 100) * h;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 'auto' }} aria-hidden>
      {baseline && (
        <rect
          x={0}
          y={y(baseline.center + baseline.sd)}
          width={w}
          height={Math.max(1.5, y(baseline.center - baseline.sd) - y(baseline.center + baseline.sd))}
          fill="var(--color-surface-2)"
        />
      )}
      <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]!.score)} r="3" fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth="1.5" />
    </svg>
  );
}
