import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';

/** Preferencias de conteudo, editaveis pelo painel no iPhone. */
export type AppSettings = {
  /** Nicho descrito em linguagem natural — entra no prompt da IA. */
  niche: string;
  /** Template padrao das ideias geradas automaticamente. */
  template: 'produto' | 'viral';
  country: string;
  language: string;
  /** Quantas ideias gerar por varredura. */
  ideasPerScan: number;
  /** Quantos videos renderizar automaticamente por dia. */
  videosPerDay: number;
  /** Ideias com score abaixo disso sao descartadas na origem. */
  minScore: number;
  /** Duracao alvo do video em segundos. */
  targetDuration: number;
  /** Assinatura fixa colada no fim de toda legenda. */
  captionSignature: string;
  /** Palavras que nunca devem aparecer no roteiro. */
  blockedWords: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  niche: 'curiosidades e dicas praticas do dia a dia',
  template: 'viral',
  country: 'BR',
  language: 'pt-BR',
  ideasPerScan: 5,
  videosPerDay: 3,
  minScore: 60,
  targetDuration: 30,
  captionSignature: '',
  blockedWords: [],
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  // Mesclar com o padrao garante que campos novos apareçam sem migration.
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await db
    .insert(settings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}
