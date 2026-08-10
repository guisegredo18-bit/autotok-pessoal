/**
 * Dinheiro: centavos inteiros, conversao para USD e cotacao com cache.
 *
 * Duas regras que valem para o arquivo inteiro:
 *
 * 1. Valor monetario e inteiro em centavos. Ponto flutuante acumula erro
 *    (0.1 + 0.2 !== 0.3) e isto vai virar declaracao de imposto — a soma de
 *    trezentas comissoes precisa fechar com o extrato ao centavo.
 *
 * 2. Sem cotacao, o valor em USD e `null`, nunca zero. Um zero desaparece
 *    dentro de uma soma e faz o painel afirmar que voce ganhou menos do que
 *    ganhou; um `null` a tela sabe mostrar como "sem cotacao".
 */

/** Quantas unidades de cada moeda valem 1 USD. `{ BRL: 5.4 }` = 1 USD -> 5,40 BRL. */
export type Rates = Record<string, number>;

/** Cotacao pronta para uso, com a data em que foi buscada. */
export type FxQuote = { rates: Rates; fetchedAt: string };

/**
 * Converte para centavos de dolar.
 *
 * Devolve `null` quando nao ha cotacao para a moeda — quem chama decide o que
 * fazer com isso, e o unico caminho errado seria fingir que e zero.
 */
export function toUsdCents(
  cents: number,
  currency: string,
  rates: Rates,
): { usdCents: number; rate: number } | null {
  const code = currency.trim().toUpperCase();
  if (!Number.isFinite(cents)) return null;

  if (code === 'USD') return { usdCents: Math.round(cents), rate: 1 };

  const rate = rates[code];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;

  return { usdCents: Math.round(cents / rate), rate };
}

/**
 * Le um numero escrito por gente — ou por uma planilha.
 *
 * O relatorio da Amazon sai no formato do marketplace: "1.234,56" no Brasil e
 * "1,234.56" nos EUA. Adivinhar errado troca mil dolares por um dolar e vinte,
 * entao a regra e explicita: o ultimo separador que aparecer, se sobrarem 1 ou
 * 2 casas depois dele, e o decimal. Com 3 casas exatas (1.234) e milhar.
 */
export function parseAmountCents(raw: string): number | null {
  if (typeof raw !== 'string') return null;

  // Fora simbolo de moeda, espaco (inclusive o nao-separavel das planilhas) e
  // qualquer letra que venha grudada ("USD 12.30", "R$ 12,30").
  let text = raw.replace(/[^\d.,\-+]/g, '').trim();
  if (text === '' || text === '-' || text === '+') return null;

  const negative = text.startsWith('-') || /^\(.*\)$/.test(raw.trim());
  text = text.replace(/[-+]/g, '');

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);

  let decimals = '';
  let integer = text;

  if (lastSep >= 0) {
    const after = text.slice(lastSep + 1);
    // 1 ou 2 digitos depois do separador: e a parte decimal. Tres digitos
    // (1.234) e separador de milhar, e o valor nao tem centavos.
    if (after.length === 1 || after.length === 2) {
      decimals = after.padEnd(2, '0');
      integer = text.slice(0, lastSep);
    }
  }

  const digits = integer.replace(/\D/g, '');
  if (digits === '' && decimals === '') return null;

  const cents = Number(`${digits || '0'}${decimals || '00'}`);
  if (!Number.isFinite(cents)) return null;

  return negative ? -cents : cents;
}

/** Centavos -> texto para a tela. `1234, 'USD'` vira "US$ 12,34". */
export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null || !Number.isFinite(cents)) return '—';

  const value = cents / 100;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    // Moeda desconhecida (a Hotmart ja devolveu codigos exoticos): melhor
    // mostrar o numero com o codigo cru do que quebrar a pagina inteira.
    return `${currency.toUpperCase()} ${value.toFixed(2)}`;
  }
}

/**
 * Resposta do open.er-api.com — sem chave, sem cadastro, atualizado 1x/dia.
 *
 * A escolha por um servico sem chave e deliberada: a cotacao nao pode ser mais
 * uma credencial para configurar antes do painel servir para alguma coisa.
 */
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

/** Exportada para teste: valida o payload antes de confiar nele. */
export function parseRates(payload: unknown): Rates | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { result?: string; rates?: Record<string, unknown> };
  if (body.result && body.result !== 'success') return null;
  if (!body.rates || typeof body.rates !== 'object') return null;

  const rates: Rates = {};
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      rates[code.toUpperCase()] = value;
    }
  }
  // Sem BRL a cotacao nao serve para o caso principal (Hotmart em real), e um
  // payload assim provavelmente e uma pagina de erro que respondeu 200.
  return rates.BRL ? rates : null;
}

/** Uma cotacao vale o dia. Depois disso vale a pena buscar de novo. */
export const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isStale(quote: FxQuote | null, now = Date.now()): boolean {
  if (!quote) return true;
  const at = new Date(quote.fetchedAt).getTime();
  return !Number.isFinite(at) || now - at > FX_MAX_AGE_MS;
}

/** Busca a cotacao. Devolve null (em vez de lancar) quando o servico falha. */
export async function fetchRates(url = FX_URL): Promise<Rates | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return parseRates(await res.json());
  } catch {
    return null;
  }
}
