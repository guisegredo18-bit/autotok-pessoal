import type { AffiliateSource } from '@/lib/db/schema';

/**
 * Nota 0-100 comparavel entre Amazon e Hotmart.
 *
 * As duas plataformas medem popularidade com regras incompativeis: a Amazon da
 * um ranking de vendas (menor e melhor, escala aberta) e a Hotmart da uma
 * temperatura de 0 a 150. Sem uma nota comum, a lista misturada nao poderia
 * ser ordenada — e ordenar a lista e o que a tela existe para fazer.
 *
 * Regra que vale para tudo aqui: sinal que nao veio nao entra na conta. Um
 * produto sem ranking nao vira nota 0 (o que o esconderia no fim da lista); a
 * nota simplesmente sai dos sinais que existem, e um produto sem sinal nenhum
 * fica com 0 e e ordenado pela comissao, na tela.
 */

export type ScoreSignals = {
  salesRank?: number | null;
  /** Amazon: estrelas 0-5. Hotmart: temperatura 0-150. */
  rating?: number | null;
  reviewCount?: number | null;
  /** Percentual 0-100. */
  commissionRate?: number | null;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Ranking de vendas -> 0-100, em escala logaritmica.
 *
 * Linear nao serviria: a diferenca entre o 1o e o 100o lugar importa muito
 * mais do que entre o 500.000o e o 500.100o, e numa escala linear as duas
 * valeriam o mesmo.
 */
export function rankScore(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  // 1 -> 100, 1.000 -> 50, 1.000.000 -> 0.
  return clamp(100 - (Math.log10(rank) / 6) * 100);
}

export function scoreProduct(source: AffiliateSource, signals: ScoreSignals): number {
  const parts: { value: number; weight: number }[] = [];

  if (signals.salesRank != null && signals.salesRank > 0) {
    parts.push({ value: rankScore(signals.salesRank), weight: 3 });
  }

  if (signals.rating != null && signals.rating > 0) {
    const value =
      source === 'hotmart'
        ? clamp((signals.rating / 150) * 100) // temperatura da Hotmart
        : clamp((signals.rating / 5) * 100); // estrelas da Amazon
    parts.push({ value, weight: 2 });
  }

  if (signals.reviewCount != null && signals.reviewCount > 0) {
    // 10.000 avaliacoes ja e o teto pratico: acima disso a diferenca nao
    // significa mais nada sobre o produto vender ou nao.
    parts.push({ value: clamp((Math.log10(signals.reviewCount) / 4) * 100), weight: 1 });
  }

  if (signals.commissionRate != null && signals.commissionRate > 0) {
    // 50% de comissao (comum na Hotmart) vale nota cheia neste componente.
    parts.push({ value: clamp((signals.commissionRate / 50) * 100), weight: 2 });
  }

  if (parts.length === 0) return 0;

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}
