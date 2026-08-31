import { clamp } from './stats.ts';
import type { GameId } from './types.ts';

/**
 * Escada de dificuldade do bloco desafio.
 *
 * Regra "um acima, um abaixo" com passo assimetrico: sobe devagar e desce
 * rapido. O objetivo e parar perto de 70-80% de acerto, a faixa em que a
 * pessoa se sente desafiada sem se sentir derrotada — abaixo disso ela
 * desiste, acima disso o jogo vira rotina e ela para de vir.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

export function nextLevel(current: number, accuracy: number): number {
  const level = Number.isFinite(current) ? current : MIN_LEVEL;
  if (accuracy >= 0.85) return clamp(level + 1, MIN_LEVEL, MAX_LEVEL);
  if (accuracy < 0.55) return clamp(level - 1, MIN_LEVEL, MAX_LEVEL);
  return clamp(level, MIN_LEVEL, MAX_LEVEL);
}

export function levelOf(difficulty: Partial<Record<GameId, number>>, game: GameId): number {
  return clamp(difficulty[game] ?? MIN_LEVEL, MIN_LEVEL, MAX_LEVEL);
}

/** Parametros do bloco desafio derivados do nivel. O bloco calibrado NUNCA
 *  consulta isto: ele e fixo justamente para permitir comparacao no tempo. */
export interface ChallengeParams {
  /** Jogos de tentativas: quantas rodadas. */
  trials: number;
  /** Pares: quantos pares na grade. */
  pairs: number;
  /** Stroop / go-no-go: tempo maximo de resposta em ms. */
  deadlineMs: number;
  /** Sequencia: tamanho inicial. */
  startSpan: number;
}

export function challengeParams(level: number): ChallengeParams {
  const l = clamp(level, MIN_LEVEL, MAX_LEVEL);
  return {
    trials: 12 + l * 2,
    pairs: Math.min(12, 4 + Math.floor(l * 0.8)),
    deadlineMs: Math.round(2200 - l * 130),
    startSpan: 2 + Math.floor(l / 2),
  };
}
