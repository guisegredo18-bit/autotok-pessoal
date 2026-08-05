export type TrendKind = 'hashtag' | 'sound' | 'product' | 'keyword';

export type RawTrend = {
  kind: TrendKind;
  name: string;
  country: string;
  category?: string;
  rank?: number;
  postCount?: number;
  viewCount?: number;
  /** Crescimento no periodo, em fracao (0.35 = +35%). */
  growthRate?: number;
  raw?: Record<string, unknown>;
};

export type TrendQuery = {
  country: string;
  /** Janela de analise em dias. O Creative Center aceita 7, 30 e 120. */
  period: 7 | 30 | 120;
  limit: number;
};

export interface TrendProvider {
  readonly name: string;
  fetchTrends(query: TrendQuery): Promise<RawTrend[]>;
}
