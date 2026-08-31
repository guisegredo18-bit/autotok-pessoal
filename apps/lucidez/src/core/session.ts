import { GAME_IDS } from './domains.ts';
import type { GameId, Session } from './types.ts';

/** Data local em AAAA-MM-DD. `toISOString` daria o dia em UTC e, a noite no
 *  Brasil, jogaria a sessao para o dia seguinte. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, (d ?? 1) + days);
  return dayKey(date);
}

/**
 * Escolhe os jogos do dia.
 *
 * Rodizio pelo que ficou mais tempo sem ser medido: assim toda a bateria e
 * coberta ao longo da semana sem que a sessao diaria passe de poucos minutos.
 * Sessao curta e a diferenca entre um habito que dura e um app abandonado na
 * segunda semana.
 */
export function planSession(gamesPerSession: number, history: { game: GameId; date: string }[]): GameId[] {
  const lastPlayed = new Map<GameId, string>();
  for (const row of history) {
    const current = lastPlayed.get(row.game);
    if (!current || row.date > current) lastPlayed.set(row.game, row.date);
  }

  const ranked = [...GAME_IDS].sort((a, b) => {
    const da = lastPlayed.get(a) ?? '';
    const db = lastPlayed.get(b) ?? '';
    if (da !== db) return da < db ? -1 : 1;
    // Empate (por exemplo, tudo inedito): ordem estavel pela lista canonica.
    return GAME_IDS.indexOf(a) - GAME_IDS.indexOf(b);
  });

  const count = Math.max(1, Math.min(GAME_IDS.length, Math.round(gamesPerSession)));
  return ranked.slice(0, count);
}

/** Dias seguidos com sessao concluida, contando a partir de hoje ou de ontem
 *  (o dia de hoje ainda pode estar em aberto sem quebrar a sequencia). */
export function streak(sessions: Session[], today: string = dayKey()): number {
  const done = new Set(sessions.filter((s) => s.completed).map((s) => s.date));
  let cursor = done.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (done.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function sessionForDay(sessions: Session[], day: string): Session | null {
  return sessions.find((s) => s.date === day) ?? null;
}
