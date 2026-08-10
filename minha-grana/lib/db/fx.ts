import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';
import { fetchRates, isStale, type FxQuote, type Rates } from '@/lib/money';

/**
 * Cotacao guardada no banco.
 *
 * Guardar em vez de buscar a cada importacao existe por dois motivos: o
 * servico gratuito atualiza uma vez por dia (buscar de hora em hora nao traz
 * numero novo) e, principalmente, uma importacao no meio de uma queda do
 * servico continua acontecendo com a ultima cotacao conhecida em vez de gravar
 * um monte de comissao sem valor em dolar.
 */

/** Prefixo proprio, pelo mesmo motivo das outras chaves (veja lib/secrets.ts). */
export const FX_KEY = 'grana_fx';

export async function getStoredQuote(): Promise<FxQuote | null> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, FX_KEY)).limit(1);
    const value = row?.value as FxQuote | undefined;
    if (!value?.rates || typeof value.fetchedAt !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * A cotacao para usar agora: a do banco se ainda for do dia, senao uma nova.
 *
 * Quando a busca falha e existe uma guardada, a guardada volta mesmo vencida —
 * uma cotacao de ontem erra por centavos, enquanto nenhuma cotacao apagaria a
 * coluna de dolares da importacao inteira.
 */
export async function currentRates(): Promise<{ rates: Rates; fetchedAt: string } | null> {
  const stored = await getStoredQuote();
  if (stored && !isStale(stored)) return stored;

  const fresh = await fetchRates();
  if (!fresh) return stored;

  const quote: FxQuote = { rates: fresh, fetchedAt: new Date().toISOString() };
  try {
    await db
      .insert(settings)
      .values({ key: FX_KEY, value: quote })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: quote, updatedAt: new Date() },
      });
  } catch {
    // Nao conseguir gravar o cache nao impede usar a cotacao recem-buscada.
  }
  return quote;
}
