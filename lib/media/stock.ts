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

/** Procura o melhor fundo vertical para um termo de busca. */
export async function findAsset(query: string): Promise<StockAsset | null> {
  const term = encodeURIComponent(query.trim());

  const video = await findVideo(term).catch(() => null);
  if (video) return video;

  return findImage(term).catch(() => null);
}

async function findVideo(term: string): Promise<StockAsset | null> {
  const json = await getJson(
    `https://api.pexels.com/videos/search?query=${term}&orientation=portrait&size=medium&per_page=8`,
  );
  const videos: any[] = json?.videos ?? [];

  for (const v of videos) {
    // Descartamos clipes muito curtos: um corte de 2s nao cobre uma cena
    // inteira e obrigaria loop visivel.
    if (Number(v?.duration ?? 0) < 5) continue;

    const files: any[] = v?.video_files ?? [];
    const vertical = files
      .filter((f) => f?.height > f?.width && f?.height >= 1080)
      .sort((a, b) => a.height - b.height)[0]
      ?? files.filter((f) => f?.height > f?.width).sort((a, b) => b.height - a.height)[0];

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

/** Baixa o asset para memoria. */
export async function downloadAsset(asset: StockAsset): Promise<Buffer> {
  const res = await fetch(asset.url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Falha ao baixar midia: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
