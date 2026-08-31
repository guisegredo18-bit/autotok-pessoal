import { clamp, linScore } from './stats.ts';
import type { GameId } from './types.ts';

/**
 * Conversao das metricas cruas de cada jogo em uma nota 0-100.
 *
 * As ancoras (o que vale 0 e o que vale 100) sao deliberadamente largas: elas
 * existem para deixar a nota legivel, nao para dizer se alguem esta "dentro do
 * normal". A leitura que importa e sempre a comparacao da pessoa com ela mesma
 * — e isso quem faz e o `trend.ts`. Nao ha tabela normativa por idade aqui de
 * proposito: seria um numero com cara de diagnostico e sem validacao nenhuma.
 */

export interface Scored {
  score: number;
  valid: boolean;
  invalidReason: string | null;
}

function ok(score: number): Scored {
  return { score: Math.round(clamp(score, 0, 100) * 10) / 10, valid: true, invalidReason: null };
}

function invalid(score: number, reason: string): Scored {
  return { score: Math.round(clamp(score, 0, 100) * 10) / 10, valid: false, invalidReason: reason };
}

export interface ReactionMetrics {
  /** Mediana dos tempos validos, em ms. Mediana e nao media: um bocejo no meio
   *  do teste desloca a media e nao diz nada sobre a cognicao. */
  medianRt: number;
  /** Desvio padrao dos tempos validos, em ms. */
  sdRt: number;
  /** Toques abaixo de 150 ms: a pessoa chutou antes do sinal. */
  anticipations: number;
  /** Respostas acima de 1000 ms: lapso de atencao. */
  lapses: number;
  validTrials: number;
  trials: number;
}

export function scoreReaction(m: ReactionMetrics): Scored {
  // A checagem de antecipacao vem primeiro porque e a mais especifica: quem
  // chuta em tudo tambem fica sem toques validos, e a mensagem generica
  // esconderia justamente o que a pessoa precisa corrigir.
  if (m.anticipations > m.trials * 0.3) {
    return invalid(0, 'Muitos toques antes do sinal — parece que foi no chute.');
  }
  if (m.validTrials < Math.ceil(m.trials * 0.5) || m.validTrials < 5) {
    return invalid(0, 'Poucos toques válidos para valer como medida.');
  }

  const speed = linScore(m.medianRt, 650, 230);
  // Variabilidade intraindividual: oscilar muito de tentativa para tentativa e
  // um sinal mais precoce que ficar lento, entao entra com peso proprio.
  const cv = m.medianRt > 0 ? m.sdRt / m.medianRt : 1;
  const consistency = linScore(cv, 0.5, 0.1);
  const cleanliness = linScore((m.anticipations + m.lapses) / m.trials, 0.3, 0);

  return ok(0.6 * speed + 0.25 * consistency + 0.15 * cleanliness);
}

export interface GoNoGoMetrics {
  /** Tempo medio de resposta nos acertos "vai", em ms. */
  goRt: number;
  goTrials: number;
  /** Deixou de responder quando devia: desatencao. */
  omissions: number;
  nogoTrials: number;
  /** Respondeu quando nao devia: falha de inibicao, a medida central do teste. */
  commissions: number;
}

export function scoreGoNoGo(m: GoNoGoMetrics): Scored {
  if (m.goTrials < 10 || m.nogoTrials < 4) {
    return invalid(0, 'Tentativas insuficientes.');
  }
  const commissionRate = m.commissions / m.nogoTrials;
  if (commissionRate > 0.8 && m.omissions === 0) {
    // Tocar em tudo produz "velocidade otima" e nenhuma omissao. Sem esse
    // corte, martelar a tela viraria a melhor nota do historico.
    return invalid(0, 'Parece que houve toque em tudo, sem esperar a forma certa.');
  }

  const inhibition = 100 * (1 - commissionRate);
  const sustained = 100 * (1 - m.omissions / m.goTrials);
  const speed = linScore(m.goRt, 800, 320);

  return ok(0.5 * inhibition + 0.2 * sustained + 0.3 * speed);
}

export interface SequenceMetrics {
  /** Maior sequencia reproduzida corretamente. E a medida classica de span. */
  maxSpan: number;
  correctTrials: number;
  trials: number;
}

export function scoreSequence(m: SequenceMetrics): Scored {
  if (m.trials < 3) return invalid(0, 'Tentativas insuficientes.');

  const span = linScore(m.maxSpan, 2, 9);
  const volume = linScore(m.correctTrials, 0, 10);
  return ok(0.85 * span + 0.15 * volume);
}

export interface PairsMetrics {
  pairs: number;
  /** Uma jogada = virar duas cartas. */
  moves: number;
  durationMs: number;
  completed: number;
}

export function scorePairs(m: PairsMetrics): Scored {
  if (m.completed < m.pairs) return invalid(0, 'Jogo não concluído.');
  if (m.moves < m.pairs) return invalid(0, 'Número de jogadas impossível.');

  // Com memoria perfeita, achar N pares custa por volta de 1,6N jogadas: e o
  // preco de ter que descobrir cada carta pelo menos uma vez.
  const benchmark = 1.6 * m.pairs;
  const efficiency = clamp((benchmark / m.moves) * 100, 0, 100);
  const perPair = m.durationMs / m.pairs;
  const speed = linScore(perPair, 14000, 3500);

  return ok(0.75 * efficiency + 0.25 * speed);
}

export interface StroopMetrics {
  /** Tempo medio nos acertos congruentes (palavra e cor batem), em ms. */
  congruentRt: number;
  /** Tempo medio nos acertos incongruentes, em ms. */
  incongruentRt: number;
  congruentTrials: number;
  incongruentTrials: number;
  congruentCorrect: number;
  incongruentCorrect: number;
}

export function scoreStroop(m: StroopMetrics): Scored {
  const trials = m.congruentTrials + m.incongruentTrials;
  const correct = m.congruentCorrect + m.incongruentCorrect;
  if (trials < 16) return invalid(0, 'Tentativas insuficientes.');

  const accuracy = correct / trials;
  if (accuracy < 0.5) {
    // Com quatro botoes, o acaso da 25%. Abaixo de 50% a pessoa provavelmente
    // nao entendeu a regra, e a nota mediria confusao, nao cognicao.
    return invalid(accuracy * 100, 'Acertos abaixo do esperado — vale reler a instrução e repetir.');
  }

  // Efeito de interferencia: o quanto a palavra escrita atrapalha a leitura da
  // cor. E a medida especifica do teste; o resto e velocidade geral.
  const interference = m.incongruentRt - m.congruentRt;
  const interferenceScore = linScore(interference, 450, 0);
  const speed = linScore(m.incongruentRt, 1700, 650);

  return ok(0.35 * interferenceScore + 0.35 * accuracy * 100 + 0.3 * speed);
}

export interface TrailsMetrics {
  /** Parte A: so numeros. Mede velocidade motora e busca visual. */
  timeAMs: number;
  errorsA: number;
  /** Parte B: numero/letra alternados. A diferenca para A e o custo de alternar. */
  timeBMs: number;
  errorsB: number;
  /** 1 quando a parte B foi ate o fim. */
  completedB: number;
  /** Quantos alvos cada parte tinha. Usado so para checar plausibilidade. */
  nodesA?: number;
  nodesB?: number;
}

/** Nenhum dedo humano acerta um alvo a cada 250 ms por quinze alvos seguidos.
 *  Abaixo disso o que houve foi toque fantasma, multitoque ou dado corrompido
 *  — e um tempo desses, aceito, vira a melhor nota do historico. */
const MIN_MS_PER_NODE = 250;

/**
 * As ancoras de tempo assumem o formato do app — 15 alvos na parte A e 16 na
 * parte B — e nao os 25 do teste em papel. Um tempo daqui nao se compara com
 * um tempo de consultorio.
 */
export function scoreTrails(m: TrailsMetrics): Scored {
  if (!m.completedB) return invalid(0, 'Parte B não concluída.');

  const floorA = (m.nodesA ?? 15) * MIN_MS_PER_NODE;
  const floorB = (m.nodesB ?? 16) * MIN_MS_PER_NODE;
  if (m.timeAMs < floorA || m.timeBMs < floorB) {
    return invalid(0, 'Tempos rápidos demais para serem reais — vale refazer com calma.');
  }

  const speedA = linScore(m.timeAMs, 60000, 12000);
  const speedB = linScore(m.timeBMs, 120000, 25000);
  // A razao B/A isola o custo de alternar de regra: quem so ficou mais lento
  // piora nas duas partes e mantem a razao, e a nota cai bem menos.
  const ratio = m.timeBMs / m.timeAMs;
  const shifting = linScore(ratio, 3.2, 1.2);
  const errorPenalty = (m.errorsA + m.errorsB) * 2.5;

  return ok(0.25 * speedA + 0.35 * speedB + 0.4 * shifting - errorPenalty);
}

/** Despacha para a funcao certa a partir do id do jogo. */
export function scoreGame(game: GameId, metrics: Record<string, number>): Scored {
  switch (game) {
    case 'reacao':
      return scoreReaction(metrics as unknown as ReactionMetrics);
    case 'gonogo':
      return scoreGoNoGo(metrics as unknown as GoNoGoMetrics);
    case 'sequencia':
      return scoreSequence(metrics as unknown as SequenceMetrics);
    case 'pares':
      return scorePairs(metrics as unknown as PairsMetrics);
    case 'stroop':
      return scoreStroop(metrics as unknown as StroopMetrics);
    case 'trilhas':
      return scoreTrails(metrics as unknown as TrailsMetrics);
  }
}
