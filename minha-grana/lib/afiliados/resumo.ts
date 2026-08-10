/**
 * Somas e projecao do painel — aritmetica pura, sem banco.
 *
 * Vive fora do pipeline porque e a parte que precisa estar certa: se a
 * projecao mente, o painel inteiro vira decoracao. Aqui da para testar cada
 * regra (o que entra na soma, o que e ignorado, como a projecao se comporta
 * com poucos dias de dado) sem subir Postgres nenhum.
 */

export type CommissionLike = {
  source: string;
  status: string;
  amountUsdCents: number | null;
  occurredAt: Date;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Comissao que ja e sua: aprovada e com valor em dolar conhecido. */
function counts(entry: CommissionLike): boolean {
  return entry.status === 'approved' && entry.amountUsdCents != null;
}

export type Totals = {
  /** Soma em centavos de dolar do que esta aprovado. */
  approvedUsdCents: number;
  /** Aprovado nos ultimos 30 dias. */
  last30UsdCents: number;
  /** Aguardando aprovacao — dinheiro que ainda pode nao vir. */
  pendingUsdCents: number;
  /** Estornos e cancelamentos, ja em valor absoluto. */
  refundedUsdCents: number;
  /** Quantas linhas nao puderam ser convertidas para dolar. */
  withoutRate: number;
  bySource: Record<string, number>;
};

export function totals(entries: CommissionLike[], now = new Date()): Totals {
  const cutoff = now.getTime() - 30 * DAY_MS;

  const result: Totals = {
    approvedUsdCents: 0,
    last30UsdCents: 0,
    pendingUsdCents: 0,
    refundedUsdCents: 0,
    withoutRate: 0,
    bySource: {},
  };

  for (const entry of entries) {
    if (entry.amountUsdCents == null) {
      result.withoutRate++;
      continue;
    }

    if (entry.status === 'pending') {
      result.pendingUsdCents += entry.amountUsdCents;
      continue;
    }
    if (entry.status === 'refunded' || entry.status === 'cancelled') {
      result.refundedUsdCents += Math.abs(entry.amountUsdCents);
      continue;
    }
    if (entry.status !== 'approved') continue;

    result.approvedUsdCents += entry.amountUsdCents;
    result.bySource[entry.source] = (result.bySource[entry.source] ?? 0) + entry.amountUsdCents;
    if (entry.occurredAt.getTime() >= cutoff) result.last30UsdCents += entry.amountUsdCents;
  }

  return result;
}

export type Projection = {
  /** Projecao para 30 dias, em centavos de dolar. Null quando nao da para projetar. */
  monthlyUsdCents: number | null;
  /** Quantos dias de historico entraram na conta. */
  basisDays: number;
  /** Media diaria observada, em centavos de dolar. */
  dailyUsdCents: number;
  /**
   * `firme` = ao menos 14 dias de historico.
   * `fraca` = tem dado, mas pouco: o numero balanca muito.
   * `sem-dados` = nada aprovado ainda; nao ha projecao honesta a dar.
   */
  confidence: 'firme' | 'fraca' | 'sem-dados';
};

/**
 * Projecao mensal a partir do que ja aconteceu.
 *
 * Nao ha modelo nenhum aqui de proposito: e a media diaria do periodo
 * observado multiplicada por 30. O pedido era "soma estimada com base nos
 * dados reais importados, nao simulados" — qualquer curva de tendencia que eu
 * inventasse seria simulacao com cara de precisao.
 *
 * O periodo observado e limitado a 30 dias e nunca conta dias antes da sua
 * primeira comissao: quem importou o primeiro relatorio ontem veria a media
 * dividida por 30 e concluiria que nao ganha quase nada.
 */
export function projectMonthly(entries: CommissionLike[], now = new Date()): Projection {
  const approved = entries.filter(counts);
  if (approved.length === 0) {
    return { monthlyUsdCents: null, basisDays: 0, dailyUsdCents: 0, confidence: 'sem-dados' };
  }

  const cutoff = now.getTime() - 30 * DAY_MS;
  const window = approved.filter((entry) => entry.occurredAt.getTime() >= cutoff);
  if (window.length === 0) {
    // Tem historico, mas nada no ultimo mes. Projetar zero seria uma
    // afirmacao forte demais para um painel que talvez so esteja sem
    // importacao recente — melhor nao projetar e dizer isso na tela.
    return { monthlyUsdCents: null, basisDays: 0, dailyUsdCents: 0, confidence: 'sem-dados' };
  }

  const first = Math.min(...window.map((entry) => entry.occurredAt.getTime()));
  const observedDays = Math.min(30, Math.max(1, Math.ceil((now.getTime() - first) / DAY_MS)));

  const sum = window.reduce((total, entry) => total + (entry.amountUsdCents ?? 0), 0);
  const dailyUsdCents = sum / observedDays;

  return {
    monthlyUsdCents: Math.round(dailyUsdCents * 30),
    basisDays: observedDays,
    dailyUsdCents: Math.round(dailyUsdCents),
    confidence: observedDays >= 14 ? 'firme' : 'fraca',
  };
}

/** Quanto cada produto rendeu — para ordenar "Meus Produtos" pelo que paga. */
export function byProduct(
  entries: (CommissionLike & { productExternalId: string | null; productName: string })[],
): { key: string; name: string; source: string; usdCents: number; sales: number }[] {
  const map = new Map<string, { name: string; source: string; usdCents: number; sales: number }>();

  for (const entry of entries) {
    if (!counts(entry)) continue;
    const key = `${entry.source}:${entry.productExternalId ?? entry.productName}`;
    const current = map.get(key) ?? {
      name: entry.productName,
      source: entry.source,
      usdCents: 0,
      sales: 0,
    };
    current.usdCents += entry.amountUsdCents ?? 0;
    current.sales += 1;
    map.set(key, current);
  }

  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.usdCents - a.usdCents);
}
