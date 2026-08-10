'use client';

import { useState, useTransition } from 'react';
import { toggleOperatingAction } from '@/app/actions';
import { formatMoney } from '@/lib/money';
import type { AffiliateProduct } from '@/lib/db/schema';

/**
 * Um produto na lista, com o botao de "estou promovendo isto".
 *
 * O botao muda de estado na hora (otimista) porque marcar produtos e uma
 * acao de varredura: voce passa a lista marcando cinco seguidos, e esperar o
 * servidor a cada toque faria parecer que o primeiro nao pegou.
 */

const SOURCE_LABEL: Record<string, string> = { amazon: 'Amazon', hotmart: 'Hotmart' };

/** Compara a nota de hoje com a mais antiga guardada: subiu ou desceu? */
function trend(history: AffiliateProduct['history']): { delta: number; label: string } | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const first = history[0]?.score;
  const last = history[history.length - 1]?.score;
  if (typeof first !== 'number' || typeof last !== 'number') return null;

  const delta = Math.round((last - first) * 10) / 10;
  if (Math.abs(delta) < 0.5) return null;
  return { delta, label: `${delta > 0 ? '+' : ''}${delta} desde ${history.length} leituras` };
}

export function ProdutoCard({ product }: { product: AffiliateProduct }) {
  const [operating, setOperating] = useState(product.operating);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const movement = trend(product.history);

  function toggle() {
    const next = !operating;
    setOperating(next);
    setError(null);

    startTransition(async () => {
      const result = await toggleOperatingAction(product.id, next);
      if (!result?.ok) {
        // Falhou: volta o botao para o estado real, senao a tela passa a
        // mentir sobre o que esta salvo.
        setOperating(!next);
        setError(result?.message ?? 'Nao consegui salvar.');
      }
    });
  }

  return (
    <li className="card">
      <div className="flex items-start gap-3">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg bg-panel2 object-contain"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{product.name}</p>

          <p className="mt-1 text-[12px] text-muted">
            {SOURCE_LABEL[product.source] ?? product.source}
            {product.category && ` · ${product.category}`}
            {product.priceCents != null &&
              ` · ${formatMoney(product.priceCents, product.currency)}`}
          </p>

          <p className="mt-0.5 text-[12px] text-muted">
            {product.commissionRate != null && (
              <span className="text-emerald-400">{product.commissionRate}% de comissao</span>
            )}
            {product.commissionCents != null && (
              <span className="text-emerald-400">
                {product.commissionRate != null ? ' · ' : ''}
                {formatMoney(product.commissionCents, product.currency)} por venda
              </span>
            )}
            {product.commissionRate == null && product.commissionCents == null && (
              // Dizer que nao se sabe e melhor do que a ausencia silenciosa:
              // sem isto parece que o produto nao paga comissao.
              <span>comissao nao informada pela plataforma</span>
            )}
          </p>

          {movement && (
            <p
              className={`mt-0.5 text-[11px] ${
                movement.delta > 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {movement.label}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`chip ${
              product.score >= 70
                ? 'bg-emerald-950 text-emerald-300'
                : product.score > 0
                  ? 'bg-cyan-950 text-cyan-300'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {product.score > 0 ? `nota ${Math.round(product.score)}` : 'sem nota'}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`btn flex-1 text-[13px] ${
            operating
              ? 'border border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
              : 'btn-ghost'
          }`}
        >
          {operating ? '✓ Em operacao' : 'Marcar como em operacao'}
        </button>

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost px-3 text-[13px]"
          >
            Abrir
          </a>
        )}
      </div>

      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
    </li>
  );
}
