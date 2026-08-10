import type { NormalizedCommission, NormalizedProduct } from '@/lib/afiliados/types';

/**
 * Traducao do que a Hotmart devolve para o formato interno.
 *
 * Fica separado do cliente HTTP de proposito: e aqui que mora todo o
 * conhecimento fragil sobre o formato da resposta, e e o unico pedaco que da
 * para testar sem rede. Quando a Hotmart mudar um nome de campo, o teste
 * quebra aqui e nao em producao, no meio de uma importacao.
 *
 * Toda leitura e defensiva: a mesma API devolve `price` ora como numero, ora
 * como objeto `{ value, currency_code }`, e o valor da comissao aparece em
 * `commission.value` ou em `value` conforme o endpoint.
 */

/** Papel do qual a comissao e sua. */
export type HotmartRole = 'AFFILIATE' | 'PRODUCER' | 'COPRODUCER';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Reais -> centavos, sem passar por ponto flutuante duas vezes. */
function toCents(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 100);
}

/**
 * A Hotmart marca tempo em milissegundos desde a epoca. Segundos aparecem em
 * alguns webhooks antigos — um numero de 10 digitos e sempre segundo, porque
 * em milissegundos ele cairia em 1970.
 */
export function toDate(value: unknown): Date | null {
  const n = asNumber(value);
  if (n != null) {
    // Zero (e negativo) e "campo nao preenchido", nao 1970 — a Hotmart manda
    // `approved_date: 0` em venda que ainda nao foi aprovada.
    if (n <= 0) return null;
    const ms = n < 1e11 ? n * 1000 : n;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // So texto chega aqui: passar um numero para `new Date` como string faz
  // "0" virar o ano 2000, o que datava a venda com 26 anos de atraso.
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Status da Hotmart -> os quatro que o painel conhece. */
export function toStatus(raw: unknown): NormalizedCommission['status'] {
  const value = (asString(raw) ?? '').toUpperCase();
  if (['APPROVED', 'COMPLETE', 'COMPLETED'].includes(value)) return 'approved';
  if (['REFUNDED', 'CHARGEBACK', 'DISPUTE'].includes(value)) return 'refunded';
  if (['CANCELED', 'CANCELLED', 'EXPIRED', 'BLOCKED', 'OVERDUE'].includes(value)) {
    return 'cancelled';
  }
  // STARTED, WAITING_PAYMENT, PRINTED_BILLET, UNDER_ANALISYS e o que vier de
  // novo: dinheiro que ainda nao e seu, mas tambem nao foi perdido.
  return 'pending';
}

/** `{ value, currency_code }`, `{ value }` ou um numero solto. */
function readMoney(value: unknown): { cents: number | null; currency: string | null } {
  if (typeof value === 'number') return { cents: toCents(value), currency: null };

  const record = asRecord(value);
  return {
    cents: toCents(asNumber(record.value ?? record.amount)),
    currency: asString(record.currency_code ?? record.currency),
  };
}

/**
 * Uma venda vira zero ou uma comissao.
 *
 * Zero quando a venda nao tem comissao para o papel escolhido — o endpoint
 * devolve, na mesma transacao, o que cada parte ganhou (produtor, coprodutor,
 * afiliado, a propria Hotmart). Somar tudo faria o painel exibir o faturamento
 * do produto como se fosse seu ganho.
 */
export function normalizeCommission(
  item: unknown,
  role: HotmartRole,
): NormalizedCommission | null {
  const root = asRecord(item);
  const purchase = asRecord(root.purchase);
  const product = asRecord(root.product);

  const transaction =
    asString(root.transaction) ??
    asString(purchase.transaction) ??
    asString(root.id) ??
    null;
  if (!transaction) return null;

  const entry = pickCommission(root, purchase, role);
  if (!entry) return null;

  const occurredAt =
    toDate(purchase.approved_date) ??
    toDate(purchase.order_date) ??
    toDate(root.approved_date) ??
    toDate(root.order_date) ??
    null;
  if (!occurredAt) return null;

  const status = toStatus(purchase.status ?? root.status);

  return {
    source: 'hotmart',
    // O papel entra na chave porque a mesma transacao pode render comissao em
    // dois papeis diferentes (produtor e afiliado do proprio produto), e as
    // duas sao dinheiro seu de verdade.
    externalId: `${transaction}:${role.toLowerCase()}`,
    productExternalId: asString(product.id ?? product.ucode),
    productName: asString(product.name) ?? 'Produto sem nome',
    category: null,
    quantity: Math.max(1, Math.round(asNumber(purchase.quantity ?? root.quantity) ?? 1)),
    status,
    amountCents: entry.cents,
    currency: entry.currency,
    occurredAt,
    raw: root,
  };
}

/** Acha, entre as comissoes da venda, a que pertence ao papel pedido. */
function pickCommission(
  root: Record<string, unknown>,
  purchase: Record<string, unknown>,
  role: HotmartRole,
): { cents: number; currency: string } | null {
  const list = Array.isArray(root.commissions)
    ? root.commissions
    : Array.isArray(purchase.commissions)
      ? purchase.commissions
      : null;

  if (list) {
    for (const raw of list) {
      const entry = asRecord(raw);
      const source = (asString(entry.source ?? entry.user_type) ?? '').toUpperCase();
      if (source !== role) continue;

      const money = readMoney(entry.value !== undefined ? entry : entry.commission);
      if (money.cents == null) continue;
      return { cents: money.cents, currency: money.currency ?? currencyOf(purchase, root) };
    }
    // A lista existia e nao tinha o papel: a venda simplesmente nao e sua.
    return null;
  }

  // Endpoints que devolvem uma comissao so, ja filtrada pelo token usado.
  const money = readMoney(purchase.commission ?? root.commission);
  if (money.cents == null) return null;
  return { cents: money.cents, currency: money.currency ?? currencyOf(purchase, root) };
}

function currencyOf(...records: Record<string, unknown>[]): string {
  for (const record of records) {
    const direct = asString(record.currency_code ?? record.currency);
    if (direct) return direct.toUpperCase();
    const price = readMoney(record.price);
    if (price.currency) return price.currency.toUpperCase();
  }
  // A Hotmart e brasileira e a esmagadora maioria das contas opera em real.
  // Assumir isso e melhor do que descartar a venda — e o painel mostra a
  // moeda em cada linha, entao um palpite errado fica visivel.
  return 'BRL';
}

/** Produto do catalogo/marketplace da Hotmart. */
export function normalizeProduct(item: unknown): NormalizedProduct | null {
  const root = asRecord(item);
  const externalId = asString(root.id ?? root.ucode ?? root.product_id);
  const name = asString(root.name ?? root.product_name);
  if (!externalId || !name) return null;

  const price = readMoney(root.price ?? root.max_price);
  const rate =
    asNumber(root.commission_percentage ?? root.affiliation_percentage ?? root.commission) ??
    null;

  return {
    source: 'hotmart',
    externalId,
    name,
    category: asString(root.category ?? root.market_category),
    url: asString(root.url ?? root.sales_page ?? root.hotmart_url),
    imageUrl: asString(root.image ?? root.thumbnail ?? root.picture),
    priceCents: price.cents,
    currency: (price.currency ?? 'BRL').toUpperCase(),
    commissionRate: rate,
    commissionCents:
      price.cents != null && rate != null ? Math.round((price.cents * rate) / 100) : null,
    // A "temperatura" do marketplace vai para `rating` por ser o campo de
    // popularidade equivalente ao das estrelas da Amazon.
    rating: asNumber(root.temperature ?? root.hotness),
    reviewCount: null,
    salesRank: asNumber(root.ranking ?? root.position)
      ? Math.round(asNumber(root.ranking ?? root.position)!)
      : null,
    raw: root,
  };
}

/** Extrai a lista de itens e o token da proxima pagina, em qualquer formato. */
export function readPage(payload: unknown): {
  items: unknown[];
  nextPageToken: string | null;
} {
  const root = asRecord(payload);
  const items = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];

  const pageInfo = asRecord(root.page_info ?? root.pagination);
  return {
    items,
    nextPageToken: asString(pageInfo.next_page_token ?? pageInfo.next_page),
  };
}
