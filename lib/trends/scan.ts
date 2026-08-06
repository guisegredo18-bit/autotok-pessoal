import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trends } from '@/lib/db/schema';
import { CreativeCenterProvider } from './creative-center';
import type { RawTrend, TrendQuery } from './types';

/**
 * Score 0-100 de uma tendencia.
 *
 * A intuicao: nao queremos o que ja explodiu (todo mundo ja postou), nem o
 * que ninguem viu. Queremos volume razoavel COM aceleracao. Por isso o peso
 * maior fica no crescimento, e o volume entra em escala logaritmica — a
 * diferenca entre 1M e 10M de views importa muito menos do que entre
 * 10 mil e 100 mil.
 */
export function scoreTrend(t: RawTrend): number {
  // Volume: 0-40 pontos, saturando perto de 100M de views.
  const volume = t.viewCount ?? (t.postCount ?? 0) * 500;
  const volumeScore = volume > 0 ? Math.min(40, (Math.log10(volume) / 8) * 40) : 10;

  // Crescimento: 0-40 pontos. +100% no periodo ja crava o teto.
  const growth = t.growthRate ?? 0;
  const growthScore = Math.max(0, Math.min(40, growth * 40));

  // Posicao no ranking: 0-20 pontos, favorecendo o topo da lista.
  const rank = t.rank ?? 50;
  const rankScore = Math.max(0, 20 - (rank - 1) * 0.4);

  // Sem dado de crescimento, o score fica limitado — preferimos tendencias
  // sobre as quais temos evidencia de aceleracao.
  const total = volumeScore + growthScore + rankScore;
  return Math.round(Math.max(0, Math.min(100, total)) * 10) / 10;
}

export type ScanResult = {
  fetched: number;
  inserted: number;
  updated: number;
  warnings: string[];
  /** true quando o TikTok recusou por falta de permissao (nao e defeito nosso). */
  blocked: boolean;
};

/** Varre as fontes, pontua e grava (upsert) as tendencias no banco. */
export async function scanTrends(query: TrendQuery): Promise<ScanResult> {
  const provider = new CreativeCenterProvider();
  const raw = await provider.fetchTrends(query);

  let inserted = 0;
  let updated = 0;
  const now = new Date();

  for (const item of raw) {
    const score = scoreTrend(item);

    const [existing] = await db
      .select({ id: trends.id, history: trends.history })
      .from(trends)
      .where(
        and(
          eq(trends.source, provider.name),
          eq(trends.kind, item.kind),
          eq(trends.name, item.name),
          eq(trends.country, item.country),
        ),
      )
      .limit(1);

    if (existing) {
      // Mantemos as ultimas 30 medicoes: o bastante para ver a curva sem
      // inflar a linha do banco indefinidamente.
      const history = [...(existing.history ?? []), { at: now.toISOString(), score }].slice(-30);
      await db
        .update(trends)
        .set({
          score,
          rank: item.rank,
          postCount: item.postCount,
          viewCount: item.viewCount,
          growthRate: item.growthRate,
          category: item.category,
          raw: item.raw,
          history,
          lastSeenAt: now,
        })
        .where(eq(trends.id, existing.id));
      updated++;
    } else {
      await db.insert(trends).values({
        source: provider.name,
        kind: item.kind,
        name: item.name,
        country: item.country,
        category: item.category,
        score,
        rank: item.rank,
        postCount: item.postCount,
        viewCount: item.viewCount,
        growthRate: item.growthRate,
        raw: item.raw,
        history: [{ at: now.toISOString(), score }],
        firstSeenAt: now,
        lastSeenAt: now,
      });
      inserted++;
    }
  }

  return {
    fetched: raw.length,
    inserted,
    updated,
    warnings: provider.warnings,
    blocked: provider.blocked,
  };
}

/** As melhores tendencias recentes, para alimentar a geracao de ideias. */
export async function topTrends(limit = 10, country?: string) {
  const rows = await db
    .select()
    .from(trends)
    .where(
      country
        ? and(eq(trends.country, country), sql`${trends.lastSeenAt} > now() - interval '3 days'`)
        : sql`${trends.lastSeenAt} > now() - interval '3 days'`,
    )
    .orderBy(sql`${trends.score} desc`)
    .limit(limit);
  return rows;
}

/** Limpa tendencias que nao aparecem ha semanas — evita o banco crescer sem fim. */
export async function pruneOldTrends(days = 30): Promise<number> {
  const result = await db
    .delete(trends)
    .where(sql`${trends.lastSeenAt} < now() - (${days} * interval '1 day')`)
    .returning({ id: trends.id });
  return result.length;
}
