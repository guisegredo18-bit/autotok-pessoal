import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  boolean,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';

/** Configuracoes e chaves cifradas, editaveis pelo painel. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Produto afiliavel vindo da Amazon ou da Hotmart.
 *
 * Uma linha por (fonte, id externo) — o ASIN na Amazon, o codigo do produto na
 * Hotmart. A cada importacao as metricas sao atualizadas e o valor do score
 * vai para `history`, que e o que permite ver se o produto esta esquentando ou
 * esfriando ao longo das semanas. Sem esse historico o painel so saberia dizer
 * como esta hoje, e "hoje" nao ajuda a decidir o que promover.
 */
export const affiliateProducts = pgTable(
  'affiliate_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(), // amazon | hotmart
    /** ASIN (Amazon) ou codigo do produto (Hotmart). */
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    url: text('url'),
    imageUrl: text('image_url'),
    /**
     * Preco na moeda de origem, em centavos. Inteiro de proposito: ponto
     * flutuante em dinheiro acumula erro de arredondamento, e isto aqui vai
     * virar declaracao de imposto.
     */
    priceCents: integer('price_cents'),
    currency: text('currency').notNull().default('USD'),
    /** Percentual de comissao (0-100), quando a plataforma informa. */
    commissionRate: real('commission_rate'),
    /** Comissao por venda em centavos da moeda de origem, quando informada. */
    commissionCents: integer('commission_cents'),
    /** Nota 0-100 comparavel entre as duas fontes (veja lib/afiliados/score). */
    score: real('score').notNull().default(0),
    /** Temperatura da Hotmart / avaliacao da Amazon, cru, so para exibir. */
    rating: real('rating'),
    reviewCount: integer('review_count'),
    salesRank: integer('sales_rank'),
    /** Marcado por voce como "estou promovendo isto agora". */
    operating: boolean('operating').notNull().default(false),
    operatingSince: timestamp('operating_since', { withTimezone: true }),
    notes: text('notes'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    history: jsonb('history')
      .$type<{ at: string; score: number; priceCents: number | null }[]>()
      .notNull()
      .default([]),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueProduct: unique('affiliate_products_unique').on(t.source, t.externalId),
    scoreIdx: index('affiliate_products_score_idx').on(t.score),
    operatingIdx: index('affiliate_products_operating_idx').on(t.operating),
  }),
);

/**
 * Comissao de verdade — uma linha por transacao trazida da Hotmart (API) ou do
 * relatorio de ganhos da Amazon (CSV).
 *
 * Guardamos o valor na moeda original E o convertido para USD, com a cotacao
 * usada e a data dela. Converter na hora de exibir daria um numero diferente a
 * cada visita da mesma tela, o que e inutil para conferir com o extrato; e a
 * cotacao do dia da venda e justamente o que o contador precisa.
 *
 * `amountUsdCents` fica nulo quando nao havia cotacao disponivel na hora da
 * importacao. Nulo e proposital: um zero ali some no meio da soma e mente
 * sobre o quanto voce ganhou.
 */
export const commissions = pgTable(
  'commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(), // amazon | hotmart
    /** Id da transacao na origem. Na Amazon o CSV nem sempre traz um — veja lib/amazon/relatorio. */
    externalId: text('external_id').notNull(),
    productExternalId: text('product_external_id'),
    productName: text('product_name').notNull().default(''),
    category: text('category'),
    quantity: integer('quantity').notNull().default(1),
    /** approved | pending | refunded | cancelled */
    status: text('status').notNull().default('approved'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    amountUsdCents: integer('amount_usd_cents'),
    /** Cotacao usada: quantas unidades da moeda original valem 1 USD. */
    usdRate: real('usd_rate'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
  },
  (t) => ({
    uniqueCommission: unique('commissions_unique').on(t.source, t.externalId),
    occurredIdx: index('commissions_occurred_idx').on(t.occurredAt),
    sourceIdx: index('commissions_source_idx').on(t.source),
  }),
);

export type AffiliateProduct = typeof affiliateProducts.$inferSelect;
export type NewAffiliateProduct = typeof affiliateProducts.$inferInsert;
export type Commission = typeof commissions.$inferSelect;
export type NewCommission = typeof commissions.$inferInsert;
/** As duas plataformas de afiliado suportadas. */
export type AffiliateSource = 'amazon' | 'hotmart';
