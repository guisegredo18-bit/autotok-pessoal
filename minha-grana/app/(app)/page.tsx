import Link from 'next/link';
import { listCategories, listCommissions, listProducts } from '@/lib/pipeline/comissoes';
import { projectMonthly, totals, byProduct } from '@/lib/afiliados/resumo';
import { getStoredQuote } from '@/lib/db/fx';
import { formatMoney } from '@/lib/money';
import { hydrateEnv } from '@/lib/secrets';
import { integrationStatus } from '@/lib/env';
import { EmptyState, PageHeader, timeAgo } from '@/components/ui';
import { ComissoesFiltros } from '@/components/comissoes-filtros';
import { ProdutoCard } from '@/components/comissoes-produto';

export const dynamic = 'force-dynamic';

/**
 * O painel.
 *
 * Tres blocos, nesta ordem por um motivo: quanto entrou (o unico numero que
 * importa), o que voce esta promovendo agora, e o catalogo para escolher o
 * proximo. A ordem inversa — catalogo primeiro — empurraria o dinheiro para
 * baixo da dobra, que e onde ele deixa de ser visto.
 */

function Metric({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'normal' | 'good' | 'warn';
}) {
  const color =
    tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-white';
  return (
    <div className="card flex-1">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`mt-1 text-[22px] font-bold tracking-tight ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

type Search = Promise<{
  fonte?: string;
  ordem?: string;
  categoria?: string;
  operando?: string;
}>;

export default async function PainelPage({ searchParams }: { searchParams: Search }) {
  await hydrateEnv();

  const params = await searchParams;
  const source = params.fonte === 'amazon' || params.fonte === 'hotmart' ? params.fonte : undefined;
  const orderBy = params.ordem === 'commission' || params.ordem === 'price' ? params.ordem : 'score';

  const [entries, produtos, operando, categorias, quote] = await Promise.all([
    listCommissions(),
    listProducts({
      source,
      category: params.categoria || undefined,
      operatingOnly: params.operando === '1',
      orderBy,
    }),
    listProducts({ operatingOnly: true, limit: 100 }),
    listCategories(),
    getStoredQuote(),
  ]);

  const soma = totals(entries);
  const projecao = projectMonthly(entries);
  const porProduto = byProduct(entries);
  const status = integrationStatus();
  const semIntegracao = !status.hotmart && !status.amazon;

  /** Quanto cada produto em operacao ja rendeu — casa a lista com o dinheiro. */
  const ganhoPorChave = new Map(porProduto.map((item) => [item.key, item]));

  return (
    <>
      <PageHeader
        title="Minha Grana"
        subtitle="Amazon e Hotmart, em dolar. So o que foi importado de verdade."
        action={
          <Link href="/importar" className="btn-ghost px-3 text-[13px]">
            Importar
          </Link>
        }
      />

      {semIntegracao && (
        <div className="card mb-4 border-amber-900/60 bg-amber-950/30">
          <p className="text-[14px] font-semibold text-amber-300">Nenhuma conta conectada</p>
          <p className="mt-1 text-[13px] leading-snug text-amber-200/80">
            Registre as credenciais da Hotmart e da Amazon em Configuracoes, depois volte
            em Importar para trazer os dados.
          </p>
          <Link href="/config" className="btn-ghost mt-3 text-[13px]">
            Registrar minhas chaves
          </Link>
        </div>
      )}

      <section className="mb-5">
        <div className="mb-2 flex gap-2">
          <Metric
            label="Aprovado (30 dias)"
            value={formatMoney(soma.last30UsdCents)}
            tone="good"
            hint={`Total historico: ${formatMoney(soma.approvedUsdCents)}`}
          />
          <Metric
            label="Projecao 30 dias"
            value={projecao.monthlyUsdCents == null ? '—' : formatMoney(projecao.monthlyUsdCents)}
            tone={projecao.confidence === 'firme' ? 'normal' : 'warn'}
            hint={
              projecao.confidence === 'sem-dados'
                ? 'Sem comissao aprovada no ultimo mes'
                : `Media de ${formatMoney(projecao.dailyUsdCents)}/dia sobre ${projecao.basisDays} dia(s)` +
                  (projecao.confidence === 'fraca' ? ' — pouco historico, numero instavel' : '')
            }
          />
        </div>

        <div className="flex gap-2">
          <Metric
            label="Aguardando"
            value={formatMoney(soma.pendingUsdCents)}
            hint="Ainda pode nao ser confirmado"
          />
          <Metric
            label="Estornado"
            value={formatMoney(soma.refundedUsdCents)}
            tone={soma.refundedUsdCents > 0 ? 'warn' : 'normal'}
            hint="Ja descontado dos totais"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
          {Object.entries(soma.bySource).map(([fonte, cents]) => (
            <span key={fonte}>
              {fonte === 'amazon' ? 'Amazon' : 'Hotmart'}: {formatMoney(cents)}
            </span>
          ))}
          {quote && <span>cotacao de {timeAgo(quote.fetchedAt)} atras</span>}
          {soma.withoutRate > 0 && (
            // Dizer quantas linhas ficaram de fora e o que impede o total de
            // parecer completo quando nao esta.
            <span className="text-amber-400">
              {soma.withoutRate} comissao(oes) sem conversao para USD
            </span>
          )}
        </div>
      </section>

      {operando.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Meus produtos ({operando.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {operando.map((produto) => {
              const ganho = ganhoPorChave.get(`${produto.source}:${produto.externalId}`);
              return (
                <li key={produto.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[14px] font-semibold leading-snug">
                        {produto.name}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {produto.source === 'amazon' ? 'Amazon' : 'Hotmart'} · em operacao ha{' '}
                        {timeAgo(produto.operatingSince ?? produto.firstSeenAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold text-emerald-400">
                        {ganho ? formatMoney(ganho.usdCents) : formatMoney(0)}
                      </p>
                      <p className="text-[11px] text-muted">
                        {ganho ? `${ganho.sales} venda(s)` : 'sem venda ainda'}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Produtos
        </h2>

        <ComissoesFiltros categories={categorias} />

        {produtos.length === 0 ? (
          <EmptyState
            title="Nenhum produto ainda"
            description="Importe o catalogo da Amazon pelos seus termos de busca, ou traga seus produtos da Hotmart."
            href="/importar"
            cta="Ir para Importar"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {produtos.map((produto) => (
              <ProdutoCard key={produto.id} product={produto} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
