import type { RawTrend, TrendProvider, TrendQuery } from './types';

/**
 * Cliente do TikTok Creative Center.
 *
 * O Creative Center e a vitrine publica de tendencias do TikTok
 * (ads.tiktok.com/business/creativecenter). A pagina consome uma API JSON
 * interna que responde sem login — e e essa API que usamos aqui.
 *
 * Consequencia importante: nao ha contrato publico. O TikTok muda caminhos e
 * formatos sem aviso, e ja mudou. Por isso o cliente e escrito para degradar,
 * nao para quebrar: tenta mais de um endereco conhecido, aceita a lista em
 * varios formatos, e quando nada funciona relata o que de fato voltou — para
 * o conserto partir de evidencia, e nao de chute.
 *
 * Se um dia parar de vez, a aplicacao continua util: da para cadastrar
 * tendencias a mao no painel, ou gerar roteiros a partir do nicho.
 */

const BASE = 'https://ads.tiktok.com/creative_radar_api/v1';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const REFERERS = {
  hashtag: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
  sound: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en',
};

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

type Attempt = { url: string; status?: number; problem: string };

async function getJson(url: string, referer: string): Promise<any> {
  let lastError: unknown;

  // Duas tentativas: o endpoint devolve 5xx esporadico sob carga.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: headers(referer),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const error: any = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        // 404 e mudanca de caminho: insistir nao ajuda, o proximo candidato sim.
        if (res.status === 404) throw error;
        throw error;
      }
      return await res.json();
    } catch (err: any) {
      lastError = err;
      if (err?.status === 404) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError;
}

/**
 * Acha a lista de itens dentro da resposta.
 *
 * Os nomes conhecidos vem primeiro; se nenhum bater, procuramos qualquer
 * propriedade que seja um array de objetos. E o que permite sobreviver a uma
 * renomeacao de campo sem precisar de deploy.
 */
export function findList(json: any): any[] | null {
  const data = json?.data ?? json;
  if (!data || typeof data !== 'object') return null;

  const known = ['list', 'hashtag_list', 'sound_list', 'song_list', 'items', 'records'];
  for (const key of known) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      return value as any[];
    }
  }
  return null;
}

/** Descreve o que voltou, para o aviso dizer algo util em vez de "formato mudou". */
export function describeResponse(json: any): string {
  const code = json?.code ?? json?.status_code;
  const message = json?.msg ?? json?.message ?? json?.status_msg;
  if (code !== undefined && code !== 0 && code !== 'ok') {
    return `a API respondeu code=${code}${message ? ` (${message})` : ''}`;
  }

  const data = json?.data;
  const keys =
    data && typeof data === 'object' ? Object.keys(data) : Object.keys(json ?? {});
  return keys.length > 0
    ? `resposta sem lista reconhecivel; campos recebidos: ${keys.slice(0, 8).join(', ')}`
    : 'resposta vazia';
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

/** Le hashtag ou som de qualquer um dos formatos ja vistos. */
export function toTrend(item: any, kind: 'hashtag' | 'sound', country: string, index: number): RawTrend | null {
  const name = String(
    kind === 'hashtag'
      ? (item?.hashtag_name ?? item?.hashtag ?? item?.name ?? '')
      : (item?.title ?? item?.song_name ?? item?.music_name ?? item?.name ?? ''),
  ).replace(/^#/, '').trim();

  if (!name) return null;

  return {
    kind,
    name,
    country,
    category:
      kind === 'hashtag'
        ? (item?.industry_info?.value ?? item?.industry ?? undefined)
        : (item?.author ?? item?.singer ?? undefined),
    rank: Number(item?.rank ?? index + 1),
    postCount: parseCount(item?.publish_cnt ?? item?.post_count ?? item?.user_count),
    viewCount: parseCount(item?.video_views ?? item?.view_count),
    growthRate: slopeOf(item?.trend),
    raw: item,
  };
}

export class CreativeCenterProvider implements TrendProvider {
  readonly name = 'creative_center';
  /** Avisos da ultima coleta, exibidos no painel quando algo degrada. */
  warnings: string[] = [];

  async fetchTrends(query: TrendQuery): Promise<RawTrend[]> {
    this.warnings = [];

    const [hashtags, sounds] = await Promise.all([
      this.collect('hashtag', query),
      this.collect('sound', query),
    ]);

    return [...hashtags, ...sounds];
  }

  /** Tenta os caminhos conhecidos ate um responder com uma lista utilizavel. */
  private async collect(
    kind: 'hashtag' | 'sound',
    query: TrendQuery,
  ): Promise<RawTrend[]> {
    const common = `page=1&limit=${query.limit}&period=${query.period}&country_code=${query.country}`;

    // Ordenados do mais provavel para o mais antigo. O TikTok ja renomeou
    // esses caminhos antes, entao manter alternativas evita ficar sem coleta
    // ate alguem publicar uma correcao.
    const candidates =
      kind === 'hashtag'
        ? [
            `${BASE}/popular_trend/hashtag/list?${common}&sort_by=popular`,
            `${BASE}/trending/hashtag/list?${common}&sort_by=popular`,
            `${BASE}/popular_trend/hashtag?${common}&sort_by=popular`,
          ]
        : [
            `${BASE}/popular_trend/song/list?${common}&rank_type=popular`,
            `${BASE}/popular_trend/music/list?${common}&rank_type=popular`,
            `${BASE}/trending/song/list?${common}&rank_type=popular`,
          ];

    const attempts: Attempt[] = [];

    for (const url of candidates) {
      try {
        const json = await getJson(url, REFERERS[kind]);
        const list = findList(json);

        if (!list) {
          attempts.push({ url, problem: describeResponse(json) });
          continue;
        }

        const trends = list
          .map((item, index) => toTrend(item, kind, query.country, index))
          .filter((t): t is RawTrend => t !== null);

        if (trends.length === 0) {
          attempts.push({ url, problem: 'lista veio sem nomes reconheciveis' });
          continue;
        }
        return trends;
      } catch (err: any) {
        attempts.push({ url, status: err?.status, problem: describe(err) });
      }
    }

    // Nenhum candidato serviu: registramos o diagnostico completo, porque e
    // essa informacao — e nao "deu erro" — que permite consertar depois.
    const label = kind === 'hashtag' ? 'hashtags' : 'sons';
    const detail = attempts
      .map((a) => `${new URL(a.url).pathname} → ${a.problem}`)
      .join(' | ');
    this.warnings.push(`${label}: nenhum endereco funcionou. ${detail}`);
    return [];
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
