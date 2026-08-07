import { env, requireEnv } from '@/lib/env';

/**
 * Busca de imagens e videos de fundo no Pexels (API gratuita).
 *
 * Preferimos video vertical quando existe — fundo com movimento segura muito
 * mais atencao no TikTok do que foto parada. Quando nao ha video decente,
 * caimos para imagem e aplicamos Ken Burns (zoom lento) no render.
 */

export type StockAsset = {
  kind: 'video' | 'image';
  url: string;
  width: number;
  height: number;
  /** Credito do autor — o Pexels pede atribuicao quando possivel. */
  credit?: string;
};

const HEADERS = () => {
  requireEnv('pexelsApiKey');
  return { Authorization: env.pexelsApiKey };
};

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: HEADERS(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}`);
  return res.json();
}

/**
 * Altura minima aceitavel de um clipe, quando ninguem diz qual e o alvo.
 *
 * Importa mais do que parece: o Pexels oferece o mesmo clipe em varias
 * resolucoes, e pedir a maior significa baixar 20 a 80 MB por cena para depois
 * reduzir tudo na hora de renderizar. Cinco cenas assim eram centenas de
 * megabytes numa funcao com poucos minutos de vida — o download virava o gargalo
 * do render inteiro.
 */
const DEFAULT_MIN_HEIGHT = 1280;

/** Procura o melhor fundo vertical para um termo de busca. */
export async function findAsset(
  query: string,
  minHeight = DEFAULT_MIN_HEIGHT,
): Promise<StockAsset | null> {
  const term = encodeURIComponent(query.trim());

  const video = await findVideo(term, minHeight).catch(() => null);
  if (video) return video;

  return findImage(term).catch(() => null);
}

/**
 * Entre os arquivos de um clipe, o menor que ainda cobre a altura alvo.
 *
 * Exportada porque e a decisao que define o tamanho do download, e ela precisa
 * ser verificavel sem chamar o Pexels.
 */
export function pickVideoFile(files: any[], minHeight: number): any | null {
  const verticais = (files ?? []).filter(
    (f) => Number(f?.height) > Number(f?.width) && f?.link,
  );
  if (verticais.length === 0) return null;

  const cobrem = verticais
    .filter((f) => Number(f.height) >= minHeight)
    .sort((a, b) => Number(a.height) - Number(b.height));

  // Se nenhum alcanca o alvo, o maior disponivel e o melhor que da para fazer:
  // esticar um pouco incomoda menos do que ficar sem fundo.
  return cobrem[0] ?? verticais.sort((a, b) => Number(b.height) - Number(a.height))[0];
}

async function findVideo(term: string, minHeight: number): Promise<StockAsset | null> {
  const json = await getJson(
    `https://api.pexels.com/videos/search?query=${term}&orientation=portrait&size=medium&per_page=8`,
  );
  const videos: any[] = json?.videos ?? [];

  for (const v of videos) {
    // Descartamos clipes muito curtos: um corte de 2s nao cobre uma cena
    // inteira e obrigaria loop visivel.
    if (Number(v?.duration ?? 0) < 5) continue;

    const vertical = pickVideoFile(v?.video_files ?? [], minHeight);

    if (vertical?.link) {
      return {
        kind: 'video',
        url: vertical.link,
        width: vertical.width,
        height: vertical.height,
        credit: v?.user?.name,
      };
    }
  }
  return null;
}

async function findImage(term: string): Promise<StockAsset | null> {
  const json = await getJson(
    `https://api.pexels.com/v1/search?query=${term}&orientation=portrait&per_page=8`,
  );
  const photos: any[] = json?.photos ?? [];
  const photo = photos.find((p) => p?.src?.large2x || p?.src?.large);
  if (!photo) return null;

  return {
    kind: 'image',
    url: photo.src.large2x ?? photo.src.large,
    width: photo.width,
    height: photo.height,
    credit: photo?.photographer,
  };
}

/**
 * Teto por arquivo de fundo.
 *
 * Um clipe grande nao da erro: ele so consome o tempo todo da renderizacao
 * baixando, e o video fica preso em "renderizando" ate a funcao ser morta —
 * sem nada gravado que explique o que houve. Recusar cedo transforma isso numa
 * troca por outra midia.
 */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

/** Baixa o asset para memoria, recusando o que for grande demais. */
export async function downloadAsset(
  asset: StockAsset,
  maxBytes = MAX_ASSET_BYTES,
): Promise<Buffer> {
  const res = await fetch(asset.url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Falha ao baixar midia: HTTP ${res.status}`);

  const declarado = Number(res.headers.get('content-length') ?? 0);
  if (declarado > maxBytes) {
    throw new Error(
      `midia de ${(declarado / 1024 / 1024).toFixed(0)}MB e grande demais ` +
        `(teto de ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
    );
  }

  const data = Buffer.from(await res.arrayBuffer());
  // Nem todo servidor manda content-length; a checagem final e no que chegou.
  if (data.length > maxBytes) {
    throw new Error(`midia de ${(data.length / 1024 / 1024).toFixed(0)}MB e grande demais`);
  }
  return data;
}
