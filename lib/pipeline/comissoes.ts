import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateProducts, commissions } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { currentRates } from '@/lib/db/fx';
import { toUsdCents, type Rates } from '@/lib/money';
import { scoreProduct } from '@/lib/afiliados/score';
import { emptyResult, type ImportResult, type NormalizedCommission, type NormalizedProduct } from '@/lib/afiliados/types';
import { amazonIsReady, hotmartIsReady } from '@/lib/env';
import * as amazon from '@/lib/amazon/paapi';
import { parseEarningsReport } from '@/lib/amazon/relatorio';
import * as hotmart from '@/lib/hotmart/api';
import { normalizeCommission, normalizeProduct } from '@/lib/hotmart/normalize';

/**
 * Importacao e gravacao — a unica camada que conversa com as duas APIs e com o
 * banco ao mesmo tempo.
 *
 * Regra que se repete em todas as funcoes: nada lanca por dado ruim. Uma linha
 * que nao da para entender vira aviso e a importacao segue. Quem importa esta
 * olhando a tela do celular depois de subir um CSV de 400 linhas; derrubar
 * tudo por causa de uma linha estranha transformaria um aviso num trabalho
 * perdido.
 */

/** Quantos pontos de historico guardar por produto (um por importacao). */
const HISTORY_LIMIT = 60;

/**
 * Grava produtos, atualizando os que ja existem.
 *
 * O `history` cresce por acrescimo: cada importacao empilha a nota e o preco
 * do dia. E dai que sai a resposta que a lista sozinha nao da — "isso aqui
 * estava melhor ou pior mes passado?".
 */
export async function upsertProducts(items: NormalizedProduct[]): Promise<ImportResult> {
  const result = emptyResult();
  result.fetched = items.length;
  if (items.length === 0) return result;

  const now = new Date();

  // Uma consulta so para saber o que ja existe: com 50 produtos por
  // importacao, um SELECT por item seria a parte mais lenta do processo.
  const keys = items.map((item) => item.externalId);
  const existing = await db
    .select({
      id: affiliateProducts.id,
      source: affiliateProducts.source,
      externalId: affiliateProducts.externalId,
      history: affiliateProducts.history,
    })
    .from(affiliateProducts)
    .where(inArray(affiliateProducts.externalId, keys));

  const byKey = new Map(existing.map((row) => [`${row.source}:${row.externalId}`, row]));

  for (const item of items) {
    const score = scoreProduct(item.source, {
      salesRank: item.salesRank,
      rating: item.rating,
      reviewCount: item.reviewCount,
      commissionRate: item.commissionRate,
    });

    const previous = byKey.get(`${item.source}:${item.externalId}`);
    const history = [
      ...(previous?.history ?? []),
      { at: now.toISOString(), score, priceCents: item.priceCents },
    ].slice(-HISTORY_LIMIT);

    const values = {
      source: item.source,
      externalId: item.externalId,
      name: item.name,
      category: item.category,
      url: item.url,
      imageUrl: item.imageUrl,
      priceCents: item.priceCents,
      currency: item.currency,
      commissionRate: item.commissionRate,
      commissionCents: item.commissionCents,
      score,
      rating: item.rating,
      reviewCount: item.reviewCount,
      salesRank: item.salesRank,
      raw: item.raw,
      history,
      lastSeenAt: now,
    };

    await db
      .insert(affiliateProducts)
      .values(values)
      .onConflictDoUpdate({
        target: [affiliateProducts.source, affiliateProducts.externalId],
        // `operating`, `operatingSince` e `notes` ficam de fora de proposito:
        // sao seus, e uma reimportacao do catalogo nao pode desmarcar o que
        // voce disse que esta promovendo.
        set: {
          name: values.name,
          category: values.category,
          url: values.url,
          imageUrl: values.imageUrl,
          priceCents: values.priceCents,
          currency: values.currency,
          commissionRate: values.commissionRate,
          commissionCents: values.commissionCents,
          score: values.score,
          rating: values.rating,
          reviewCount: values.reviewCount,
          salesRank: values.salesRank,
          raw: values.raw,
          history: values.history,
          lastSeenAt: now,
        },
      });

    if (previous) result.updated++;
    else result.inserted++;
  }

  return result;
}

/**
 * Grava comissoes, convertendo para dolar no momento da importacao.
 *
 * A conversao acontece aqui, e nao na hora de exibir, porque o valor precisa
 * parar de mudar: um total que muda de tarde para noite, com as mesmas vendas,
 * nao serve para conferir com o extrato nem para entregar ao contador.
 */
export async function upsertCommissions(rows: NormalizedCommission[]): Promise<ImportResult> {
  const result = emptyResult();
  result.fetched = rows.length;
  if (rows.length === 0) return result;

  const quote = await currentRates();
  const rates: Rates = quote?.rates ?? {};
  if (!quote) {
    result.warnings.push(
      'Nao consegui a cotacao do dolar agora. As comissoes foram gravadas na moeda ' +
        'original e o valor em USD fica pendente ate a proxima importacao.',
    );
  }

  const keys = rows.map((row) => row.externalId);
  const existing = await db
    .select({ externalId: commissions.externalId, source: commissions.source })
    .from(commissions)
    .where(inArray(commissions.externalId, keys));
  const known = new Set(existing.map((row) => `${row.source}:${row.externalId}`));

  let semCotacao = 0;

  for (const row of rows) {
    const converted = toUsdCents(row.amountCents, row.currency, rates);
    if (!converted) semCotacao++;

    await db
      .insert(commissions)
      .values({
        source: row.source,
        externalId: row.externalId,
        productExternalId: row.productExternalId,
        productName: row.productName,
        category: row.category,
        quantity: row.quantity,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        amountUsdCents: converted?.usdCents ?? null,
        usdRate: converted?.rate ?? null,
        occurredAt: row.occurredAt,
        raw: row.raw,
      })
      .onConflictDoUpdate({
        target: [commissions.source, commissions.externalId],
        // Reimportar o mesmo periodo e o caso normal (uma venda pendente vira
        // aprovada, ou estornada). Atualizar em vez de ignorar e o que mantem
        // o painel igual ao extrato.
        set: {
          status: row.status,
          amountCents: row.amountCents,
          currency: row.currency,
          amountUsdCents: converted?.usdCents ?? null,
          usdRate: converted?.rate ?? null,
          productName: row.productName,
          occurredAt: row.occurredAt,
          raw: row.raw,
          importedAt: new Date(),
        },
      });

    if (known.has(`${row.source}:${row.externalId}`)) result.updated++;
    else result.inserted++;
  }

  if (semCotacao > 0 && quote) {
    result.warnings.push(
      `${semCotacao} comissao(oes) em moeda sem cotacao disponivel ficaram sem valor em USD.`,
    );
  }

  return result;
}

/** Importa as comissoes da Hotmart no periodo configurado. */
export async function importHotmartCommissions(days?: number): Promise<ImportResult> {
  const result = emptyResult();

  if (!hotmartIsReady()) {
    result.warnings.push(
      'Hotmart nao configurada. Preencha Client ID e Client Secret em Configuracoes > Chaves.',
    );
    return result;
  }

  const settings = await getSettings();
  const window = days ?? settings.importWindowDays;
  const end = new Date();
  const start = new Date(end.getTime() - window * 24 * 60 * 60 * 1000);

  const rows: NormalizedCommission[] = [];
  let lidos = 0;
  let semPapel = 0;

  for await (const item of hotmart.salesCommissions(start, end)) {
    lidos++;
    const normalized = normalizeCommission(item, settings.hotmartRole);
    if (normalized) rows.push(normalized);
    else semPapel++;
  }

  const saved = await upsertCommissions(rows);
  saved.fetched = lidos;
  saved.warnings.push(...result.warnings);

  if (lidos > 0 && rows.length === 0) {
    saved.warnings.push(
      `Li ${lidos} venda(s), mas nenhuma tinha comissao no papel "${settings.hotmartRole}". ` +
        'Se voce e produtor (e nao afiliado) destes produtos, mude o papel em Configuracoes.',
    );
  } else if (semPapel > 0) {
    saved.warnings.push(`${semPapel} venda(s) ignorada(s) por nao terem comissao no seu papel.`);
  }

  return saved;
}

/** Importa seus produtos da Hotmart para a lista de tendencias. */
export async function importHotmartProducts(): Promise<ImportResult> {
  const result = emptyResult();
  if (!hotmartIsReady()) {
    result.warnings.push('Hotmart nao configurada.');
    return result;
  }

  const items: NormalizedProduct[] = [];
  for await (const raw of hotmart.products()) {
    const normalized = normalizeProduct(raw);
    if (normalized) items.push(normalized);
  }

  const saved = await upsertProducts(items);
  saved.warnings.push(
    'A Hotmart nao publica em API o marketplace de produtos afiliaveis (com temperatura ' +
      'e ranking). O que entrou aqui sao os produtos ligados a sua conta.',
  );
  return saved;
}

/** Busca produtos na Amazon pelos termos configurados. */
export async function importAmazonCatalog(keywords?: string[]): Promise<ImportResult> {
  const result = emptyResult();

  if (!amazonIsReady()) {
    result.warnings.push(
      'Amazon nao configurada. Preencha Access Key, Secret Key e a tag de afiliado em Configuracoes.',
    );
    return result;
  }

  const settings = await getSettings();
  const terms = (keywords ?? settings.affiliateKeywords).filter((term) => term.trim() !== '');

  if (terms.length === 0) {
    result.warnings.push(
      'Nenhum termo de busca configurado. Adicione os assuntos que voce promove em ' +
        'Comissoes > Importar.',
    );
    return result;
  }

  const items: NormalizedProduct[] = [];

  for (const term of terms) {
    try {
      items.push(...(await amazon.searchItems(term)));
    } catch (err) {
      // Um termo sem resultado (ou uma cota estourada no meio) nao pode
      // derrubar os termos que ja funcionaram.
      result.warnings.push(
        `"${term}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const saved = await upsertProducts(items);
  saved.warnings.push(...result.warnings);
  return saved;
}

/** Importa o CSV de ganhos do Amazon Associates. */
export async function importAmazonCsv(text: string): Promise<ImportResult> {
  // O relatorio quase nunca traz coluna de moeda — ele e sempre da moeda
  // daquele marketplace, e quem sabe qual marketplace e voce escolheu e a
  // configuracao, nao o arquivo.
  const { rows, warnings } = parseEarningsReport(text, defaultCurrencyForMarketplace());
  const saved = await upsertCommissions(rows);
  saved.fetched = rows.length;
  saved.warnings.push(...warnings);
  return saved;
}

/** Moeda do relatorio, deduzida do marketplace configurado. */
function defaultCurrencyForMarketplace(): string {
  const byMarketplace: Record<string, string> = {
    'www.amazon.com.br': 'BRL',
    'www.amazon.com': 'USD',
    'www.amazon.ca': 'CAD',
    'www.amazon.com.mx': 'MXN',
    'www.amazon.co.uk': 'GBP',
    'www.amazon.de': 'EUR',
    'www.amazon.fr': 'EUR',
    'www.amazon.it': 'EUR',
    'www.amazon.es': 'EUR',
    'www.amazon.in': 'INR',
    'www.amazon.co.jp': 'JPY',
    'www.amazon.com.au': 'AUD',
  };
  try {
    return byMarketplace[amazon.marketplaceConfig().marketplace] ?? 'USD';
  } catch {
    return 'USD';
  }
}

/**
 * Atualiza as metricas dos produtos que voce marcou como "em operacao".
 *
 * E o que faz a lista "Meus Produtos" ter historico: a cada rodada, o preco e a
 * nota de hoje entram no `history` de cada um, mesmo que o produto nao apareca
 * mais nas buscas por palavra-chave.
 */
export async function refreshOperatingProducts(): Promise<ImportResult> {
  const result = emptyResult();

  const operating = await db
    .select()
    .from(affiliateProducts)
    .where(eq(affiliateProducts.operating, true));

  const asins = operating
    .filter((row) => row.source === 'amazon')
    .map((row) => row.externalId);

  if (asins.length === 0) {
    result.warnings.push('Nenhum produto da Amazon em operacao para atualizar.');
    return result;
  }
  if (!amazonIsReady()) {
    result.warnings.push('Amazon nao configurada — nao da para atualizar as metricas.');
    return result;
  }

  const items: NormalizedProduct[] = [];
  // A PA-API aceita no maximo 10 ASINs por chamada.
  for (let i = 0; i < asins.length; i += 10) {
    try {
      items.push(...(await amazon.getItems(asins.slice(i, i + 10))));
    } catch (err) {
      result.warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  const saved = await upsertProducts(items);
  saved.warnings.push(...result.warnings);
  return saved;
}

/** Marca ou desmarca um produto como "estou promovendo isto". */
export async function setOperating(productId: string, operating: boolean): Promise<void> {
  await db
    .update(affiliateProducts)
    .set({ operating, operatingSince: operating ? new Date() : null })
    .where(eq(affiliateProducts.id, productId));
}

// --- Leituras para a tela ---------------------------------------------------

export type ProductFilter = {
  source?: 'amazon' | 'hotmart';
  category?: string;
  operatingOnly?: boolean;
  orderBy?: 'score' | 'commission' | 'price';
  limit?: number;
};

export async function listProducts(filter: ProductFilter = {}) {
  const conditions = [];
  if (filter.source) conditions.push(eq(affiliateProducts.source, filter.source));
  if (filter.category) conditions.push(eq(affiliateProducts.category, filter.category));
  if (filter.operatingOnly) conditions.push(eq(affiliateProducts.operating, true));

  const order =
    filter.orderBy === 'commission'
      ? sql`coalesce(${affiliateProducts.commissionCents}, 0) desc`
      : filter.orderBy === 'price'
        ? sql`coalesce(${affiliateProducts.priceCents}, 0) desc`
        : // Empate de nota (comum: produtos da Amazon sem ranking ficam todos
          // em 0) desempata pelo mais recente, que e o que voce acabou de
          // importar e provavelmente veio ver.
          sql`${affiliateProducts.score} desc, ${affiliateProducts.lastSeenAt} desc`;

  return db
    .select()
    .from(affiliateProducts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(filter.limit ?? 60);
}

/** Categorias existentes, para montar o filtro sem lista fixa no codigo. */
export async function listCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: affiliateProducts.category })
    .from(affiliateProducts);
  return rows
    .map((row) => row.category)
    .filter((category): category is string => Boolean(category))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Comissoes recentes — base de tudo que a tela soma. */
export async function listCommissions(days = 365) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(commissions)
    .where(gte(commissions.occurredAt, since))
    .orderBy(desc(commissions.occurredAt));
}
