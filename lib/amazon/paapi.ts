import { env, requireEnv } from '@/lib/env';
import type { NormalizedProduct } from '@/lib/afiliados/types';
import { signRequest } from './sign';

/**
 * Product Advertising API 5.0 — catalogo da Amazon.
 *
 * O que ela da: titulo, preco, categoria, imagem, ranking de vendas e link ja
 * com a sua tag de afiliado.
 *
 * O que ela NAO da, e e a limitacao central deste projeto: quanto voce ganhou.
 * A PA-API e uma API de catalogo; ganhos so existem no relatorio do painel do
 * Associates. Por isso o dinheiro da Amazon entra por importacao de CSV
 * (lib/amazon/relatorio.ts) e nunca e estimado a partir daqui — um percentual
 * de comissao chutado por categoria produziria um painel que parece exato e
 * esta errado todo mes.
 */

export class AmazonError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AmazonError';
  }
}

/**
 * Cada marketplace tem seu host e sua regiao de assinatura. Assinar com a
 * regiao errada e recusado mesmo com a chave certa.
 */
export const MARKETPLACES: Record<string, { host: string; region: string }> = {
  'www.amazon.com.br': { host: 'webservices.amazon.com.br', region: 'us-east-1' },
  'www.amazon.com': { host: 'webservices.amazon.com', region: 'us-east-1' },
  'www.amazon.ca': { host: 'webservices.amazon.ca', region: 'us-east-1' },
  'www.amazon.com.mx': { host: 'webservices.amazon.com.mx', region: 'us-east-1' },
  'www.amazon.co.uk': { host: 'webservices.amazon.co.uk', region: 'eu-west-1' },
  'www.amazon.de': { host: 'webservices.amazon.de', region: 'eu-west-1' },
  'www.amazon.fr': { host: 'webservices.amazon.fr', region: 'eu-west-1' },
  'www.amazon.it': { host: 'webservices.amazon.it', region: 'eu-west-1' },
  'www.amazon.es': { host: 'webservices.amazon.es', region: 'eu-west-1' },
  'www.amazon.in': { host: 'webservices.amazon.in', region: 'eu-west-1' },
  'www.amazon.co.jp': { host: 'webservices.amazon.co.jp', region: 'us-west-2' },
  'www.amazon.com.au': { host: 'webservices.amazon.com.au', region: 'us-west-2' },
};

export function marketplaceConfig(marketplace = env.amazonMarketplace) {
  const key = marketplace.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const config = MARKETPLACES[key];
  if (!config) {
    throw new AmazonError(
      `Marketplace "${marketplace}" nao reconhecido. Use um destes: ${Object.keys(MARKETPLACES).join(', ')}.`,
    );
  }
  return { ...config, marketplace: key };
}

/**
 * Recursos pedidos a cada chamada.
 *
 * `CustomerReviews` fica de fora de proposito: e um recurso restrito, e pedi-lo
 * numa conta sem permissao faz a Amazon recusar a requisicao INTEIRA — some o
 * catalogo todo por causa de um campo decorativo.
 */
const RESOURCES = [
  'ItemInfo.Title',
  'ItemInfo.Classifications',
  'ItemInfo.ByLineInfo',
  'Offers.Listings.Price',
  'Images.Primary.Medium',
  'BrowseNodeInfo.WebsiteSalesRank',
];

async function call(operation: 'SearchItems' | 'GetItems', body: Record<string, unknown>) {
  requireEnv('amazonAccessKey', 'amazonSecretKey', 'amazonPartnerTag');
  const { host, region, marketplace } = marketplaceConfig();

  const payload = JSON.stringify({
    ...body,
    PartnerTag: env.amazonPartnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace,
    Resources: RESOURCES,
  });

  const path = `/paapi5/${operation.toLowerCase()}`;
  const headers = signRequest({
    accessKey: env.amazonAccessKey,
    secretKey: env.amazonSecretKey,
    region,
    host,
    path,
    target: `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`,
    payload,
  });

  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });

  const json = (await res.json().catch(() => ({}))) as {
    Errors?: { Code?: string; Message?: string }[];
  };

  if (!res.ok || json.Errors?.length) {
    const first = json.Errors?.[0];
    throw new AmazonError(explain(res.status, first?.Code, first?.Message), res.status);
  }
  return json;
}

/**
 * Mensagens acionaveis para os erros que realmente acontecem.
 *
 * O `TooManyRequests` do primeiro dia e o mais traicoeiro: a conta nova so
 * ganha cota depois das primeiras vendas, entao "funciona amanha" e a resposta
 * certa, e nao "sua chave esta errada".
 */
function explain(status: number, code?: string, message?: string): string {
  if (code === 'TooManyRequests' || status === 429) {
    return (
      'A Amazon limitou as chamadas. Contas novas do Associates so recebem cota da PA-API ' +
      'depois das primeiras vendas qualificadas — ate la, use a importacao do CSV.'
    );
  }
  if (code === 'InvalidSignature' || status === 401 || status === 403) {
    return (
      'A Amazon recusou a assinatura. Confira Access Key, Secret Key e se o marketplace ' +
      'escolhido e o mesmo da sua conta do Associates.'
    );
  }
  if (code === 'InvalidPartnerTag') {
    return 'A tag de afiliado nao vale neste marketplace. Confira em Configuracoes.';
  }
  if (code === 'NoResults') return 'A Amazon nao encontrou nenhum produto para esta busca.';
  return `A Amazon respondeu ${status}${code ? ` (${code})` : ''}${message ? `: ${message}` : ''}.`;
}

/** Busca produtos por palavra-chave. */
export async function searchItems(
  keywords: string,
  options: { itemCount?: number; category?: string } = {},
): Promise<NormalizedProduct[]> {
  const json = (await call('SearchItems', {
    Keywords: keywords,
    ItemCount: Math.min(10, Math.max(1, options.itemCount ?? 10)),
    ...(options.category ? { SearchIndex: options.category } : {}),
  })) as { SearchResult?: { Items?: unknown[] } };

  return (json.SearchResult?.Items ?? [])
    .map(normalizeItem)
    .filter((item): item is NormalizedProduct => item !== null);
}

/** Busca produtos especificos por ASIN (ate 10 por chamada, limite da API). */
export async function getItems(asins: string[]): Promise<NormalizedProduct[]> {
  if (asins.length === 0) return [];
  const json = (await call('GetItems', { ItemIds: asins.slice(0, 10) })) as {
    ItemsResult?: { Items?: unknown[] };
  };

  return (json.ItemsResult?.Items ?? [])
    .map(normalizeItem)
    .filter((item): item is NormalizedProduct => item !== null);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Traducao do item da PA-API para o formato interno. Exportada para teste. */
export function normalizeItem(item: unknown): NormalizedProduct | null {
  const root = record(item);
  const asin = typeof root.ASIN === 'string' ? root.ASIN : null;
  if (!asin) return null;

  const info = record(root.ItemInfo);
  const title = record(info.Title).DisplayValue;
  const classifications = record(info.Classifications);
  const category = record(classifications.ProductGroup).DisplayValue;

  const listing = record((record(root.Offers).Listings as unknown[])?.[0]);
  const price = record(listing.Price);
  const amount = typeof price.Amount === 'number' ? price.Amount : null;

  const image = record(record(record(root.Images).Primary).Medium).URL;

  const ranks = record(root.BrowseNodeInfo).WebsiteSalesRank as unknown;
  const salesRank = record(ranks).SalesRank;

  return {
    source: 'amazon',
    externalId: asin,
    name: typeof title === 'string' ? title : asin,
    category: typeof category === 'string' ? category : null,
    // DetailPageURL ja vem com a tag de afiliado embutida pela propria Amazon.
    url: typeof root.DetailPageURL === 'string' ? root.DetailPageURL : null,
    imageUrl: typeof image === 'string' ? image : null,
    priceCents: amount != null ? Math.round(amount * 100) : null,
    currency: typeof price.Currency === 'string' ? price.Currency.toUpperCase() : 'USD',
    // A PA-API nao informa percentual de comissao, e a tabela por categoria
    // muda sem aviso. Deixar nulo mantem a promessa de so mostrar dado real.
    commissionRate: null,
    commissionCents: null,
    rating: null,
    reviewCount: null,
    salesRank: typeof salesRank === 'number' ? salesRank : null,
    raw: root,
  };
}

/** Confere as credenciais com uma busca minima — o botao "Testar conexao". */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const items = await searchItems('echo dot', { itemCount: 1 });
    return {
      ok: true,
      message: `Amazon conectada (${marketplaceConfig().marketplace}). ${items.length} produto(s) de teste lido(s).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
