import type { GameId, Session, TestResult } from '../src/core/types.ts';

let counter = 0;

export function makeSession(date: string, overrides: Partial<Session> = {}): Session {
  counter++;
  return {
    id: `s${counter}`,
    profileId: 'p1',
    date,
    startedAt: `${date}T09:00:00.000Z`,
    finishedAt: `${date}T09:10:00.000Z`,
    checkIn: null,
    planned: [],
    completed: true,
    ...overrides,
  };
}

export function makeResult(
  session: Session,
  game: GameId,
  score: number,
  overrides: Partial<TestResult> = {},
): TestResult {
  counter++;
  return {
    id: `r${counter}`,
    profileId: session.profileId,
    sessionId: session.id,
    game,
    block: 'calibrado',
    startedAt: session.startedAt,
    durationMs: 60_000,
    metrics: {},
    score,
    valid: true,
    invalidReason: null,
    ...overrides,
  };
}

/** Constroi n sessoes diarias consecutivas a partir de 2026-01-01. */
export function days(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
