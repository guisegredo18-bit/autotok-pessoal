import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';

/** Preferencias que mudam o que cada importacao traz. */
export type AppSettings = {
  /**
   * De qual papel sao as suas comissoes na Hotmart.
   *
   * A mesma venda aparece com o quanto cada parte ganhou — produtor,
   * coprodutor, afiliado. Somar todas faria o painel exibir o faturamento do
   * produto como se fosse o seu ganho, entao e preciso dizer qual e o seu.
   */
  hotmartRole: 'AFFILIATE' | 'PRODUCER' | 'COPRODUCER';
  /** Termos usados para buscar produtos na Amazon (PA-API SearchItems). */
  affiliateKeywords: string[];
  /** Quantos dias para tras cada importacao da Hotmart varre. */
  importWindowDays: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  hotmartRole: 'AFFILIATE',
  affiliateKeywords: [],
  importWindowDays: 90,
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  return applyStored(row.value as Partial<AppSettings>);
}

/** Mesclagem com o padrao, exportada porque e onde mora a migracao. */
export function applyStored(stored: Partial<AppSettings>): AppSettings {
  // Mesclar com o padrao garante que campos novos apareçam sem migration.
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // Uma linha antiga pode trazer qualquer coisa no papel; um valor invalido
  // faria a importacao descartar todas as vendas silenciosamente.
  if (!['AFFILIATE', 'PRODUCER', 'COPRODUCER'].includes(merged.hotmartRole)) {
    merged.hotmartRole = DEFAULT_SETTINGS.hotmartRole;
  }
  if (!Array.isArray(merged.affiliateKeywords)) {
    merged.affiliateKeywords = [];
  }
  return merged;
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
