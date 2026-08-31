/** Estatistica minima usada pelo scoring e pela analise de tendencia. */

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/** Desvio padrao amostral (n-1). Com menos de 2 valores nao ha dispersao. */
export function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Mapeia um valor para 0-100 de forma linear e monotona.
 *
 * `worst` vira 0 e `best` vira 100, e vale nos dois sentidos: para tempo de
 * reacao passamos worst=650 e best=230, porque ali menor e melhor.
 */
export function linScore(value: number, worst: number, best: number): number {
  if (worst === best) return 0;
  // O `+ 0` normaliza o zero negativo que aparece quando value === worst numa
  // escala invertida. Sem isso a tela mostraria "-0" em vez de "0".
  return clamp(((value - worst) / (best - worst)) * 100, 0, 100) + 0;
}

/**
 * Regressao linear por minimos quadrados. `slope` sai na unidade de y por
 * unidade de x. Devolve tambem o erro padrao do coeficiente, que e o que
 * separa uma inclinacao real de um serrilhado de ruido.
 */
export function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; slopeStdErr: number; r2: number } | null {
  const n = xs.length;
  if (n !== ys.length || n < 3) return null;

  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  let residual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i]!;
    residual += (ys[i]! - predicted) ** 2;
  }
  const slopeStdErr = n > 2 ? Math.sqrt(residual / (n - 2) / sxx) : Number.POSITIVE_INFINITY;
  const r2 = syy === 0 ? 0 : 1 - residual / syy;

  return { slope, intercept, slopeStdErr, r2 };
}

/** Media movel simples; janelas incompletas usam o que existe ate ali. */
export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - window + 1);
    out.push(mean(values.slice(from, i + 1)));
  }
  return out;
}
