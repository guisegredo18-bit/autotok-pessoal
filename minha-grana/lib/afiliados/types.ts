import type { AffiliateSource } from '@/lib/db/schema';

export type { AffiliateSource };

/**
 * Formato comum para o que as duas plataformas devolvem.
 *
 * Amazon e Hotmart nao se parecem em quase nada: uma fala de ASIN, preco e
 * ranking de vendas; a outra de codigo do produto, temperatura e percentual de
 * comissao. Converter tudo para estes dois tipos logo na borda mantem o resto
 * da aplicacao — banco, painel, exportacao — sem nenhum `if (source === ...)`
 * espalhado.
 */

/** Produto afiliavel, ja normalizado. Valores em centavos da moeda de origem. */
export type NormalizedProduct = {
  source: AffiliateSource;
  externalId: string;
  name: string;
  category: string | null;
  url: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string;
  /** Percentual (0-100). */
  commissionRate: number | null;
  commissionCents: number | null;
  rating: number | null;
  reviewCount: number | null;
  salesRank: number | null;
  raw: Record<string, unknown>;
};

/** Comissao ja normalizada, antes de virar linha no banco. */
export type NormalizedCommission = {
  source: AffiliateSource;
  externalId: string;
  productExternalId: string | null;
  productName: string;
  category: string | null;
  quantity: number;
  status: 'approved' | 'pending' | 'refunded' | 'cancelled';
  amountCents: number;
  currency: string;
  occurredAt: Date;
  raw: Record<string, unknown>;
};

/** Resultado de uma importacao, do jeito que a tela precisa contar. */
export type ImportResult = {
  fetched: number;
  inserted: number;
  updated: number;
  warnings: string[];
};

export function emptyResult(): ImportResult {
  return { fetched: 0, inserted: 0, updated: 0, warnings: [] };
}
