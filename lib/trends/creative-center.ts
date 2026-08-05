import type { RawTrend, TrendProvider, TrendQuery } from './types';

/**
 * Cliente do TikTok Creative Center.
 *
 * O Creative Center e a vitrine publica de tendencias do TikTok
 * (ads.tiktok.com/business/creativecenter). A pagina consome uma API JSON
 * interna que responde sem login — e e essa API que usamos aqui.
 *
 * Consequencia importante: nao ha contrato publico. O TikTok pode mudar o
 * caminho, os campos ou passar a exigir assinatura nos headers a qualquer
 * momento. Por isso todo acesso e defensivo: se a resposta vier fora do
 * formato esperado, devolvemos lista vazia com um aviso em vez de derrubar
 * a varredura inteira. A interface `TrendProvider` existe justamente para
 * voce poder plugar um provedor pago depois sem tocar no resto do codigo.
 */

const BASE = 'https://ads.tiktok.com/creative_radar_api/v1';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function headers(referer: string): Record<string, string> {
  return {
    'user-agent': UA,
    accept: 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    referer,
    origin: 'https://ads.tiktok.com',
    // O front do Creative Center envia um id anonimo; um UUID aleatorio serve.
    'anonymous-user-id': crypto.randomUUID(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

async function getJson(url: string, referer: string): Promise<any> {
  // Duas tentativas: o endpoint costuma devolver 5xx esporadico sob carga.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: headers(referer),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError;
}

/** Converte "1.2M", "340K" e afins em numero. Exportada para teste. */
export function parseCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  const match = cleaned.match(/^([\d.]+)([KkMmBb]?)$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return Math.round(n * mult);
}

export class CreativeCenterProvider implements TrendProvider {
  readonly name = 'creative_center';
  /** Avisos da ultima coleta, exibidos no painel quando algo degrada. */
  warnings: string[] = [];

  async fetchTrends(query: TrendQuery): Promise<RawTrend[]> {
    this.warnings = [];
    const [hashtags, sounds] = await Promise.all([
      this.fetchHashtags(query).catch((err) => {
        this.warnings.push(`hashtags: ${describe(err)}`);
        return [] as RawTrend[];
      }),
      this.fetchSounds(query).catch((err) => {
        this.warnings.push(`sons: ${describe(err)}`);
        return [] as RawTrend[];
      }),
    ]);
    return [...hashtags, ...sounds];
  }

  async fetchHashtags(query: TrendQuery): Promise<RawTrend[]> {
    const url =
      `${BASE}/popular_trend/hashtag/list?page=1&limit=${query.limit}` +
      `&period=${query.period}&country_code=${query.country}&sort_by=popular`;
    const json = await getJson(
      url,
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
    );

    const list: any[] = json?.data?.list ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('resposta sem lista de hashtags (formato pode ter mudado)');
    }

    return list.map((item, index): RawTrend => {
      const name = String(item?.hashtag_name ?? item?.hashtag ?? '').replace(/^#/, '');
      return {
        kind: 'hashtag',
        name,
        country: query.country,
        category: item?.industry_info?.value ?? item?.industry ?? undefined,
        rank: Number(item?.rank ?? index + 1),
        postCount: parseCount(item?.publish_cnt ?? item?.post_count),
        viewCount: parseCount(item?.video_views ?? item?.view_count),
        // `trend` traz a serie temporal; a inclinacao final indica aceleracao.
        growthRate: slopeOf(item?.trend),
        raw: item,
      };
    }).filter((t) => t.name.length > 0);
  }

  async fetchSounds(query: TrendQuery): Promise<RawTrend[]> {
    const url =
      `${BASE}/popular_trend/song/list?page=1&limit=${query.limit}` +
      `&period=${query.period}&country_code=${query.country}&rank_type=popular`;
    const json = await getJson(
      url,
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en',
    );

    const list: any[] = json?.data?.sound_list ?? json?.data?.list ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('resposta sem lista de sons (formato pode ter mudado)');
    }

    return list.map((item, index): RawTrend => ({
      kind: 'sound',
      name: String(item?.title ?? item?.song_name ?? '').trim(),
      country: query.country,
      category: item?.author ?? undefined,
      rank: Number(item?.rank ?? index + 1),
      postCount: parseCount(item?.user_count ?? item?.post_count),
      viewCount: undefined,
      growthRate: slopeOf(item?.trend),
      raw: item,
    })).filter((t) => t.name.length > 0);
  }
}

/**
 * Aceleracao a partir da serie temporal do Creative Center.
 * Compara a media do ultimo terco com a do primeiro terco: >0 significa
 * que a tendencia ainda esta subindo, que e o que queremos pegar.
 */
export function slopeOf(trend: unknown): number | undefined {
  if (!Array.isArray(trend) || trend.length < 3) return undefined;
  const values = trend
    .map((p: any) => Number(p?.value ?? p?.count ?? p))
    .filter((n) => Number.isFinite(n));
  if (values.length < 3) return undefined;

  const third = Math.max(1, Math.floor(values.length / 3));
  const head = values.slice(0, third);
  const tail = values.slice(-third);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const start = avg(head);
  if (start <= 0) return undefined;
  return (avg(tail) - start) / start;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
