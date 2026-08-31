/** Tipos compartilhados por todo o app. Nada aqui depende de DOM ou React. */

export type GameId = 'reacao' | 'gonogo' | 'sequencia' | 'pares' | 'stroop' | 'trilhas';

export type DomainId =
  | 'velocidade'
  | 'inibicao'
  | 'memoria_trabalho'
  | 'memoria_visual'
  | 'atencao'
  | 'flexibilidade';

/**
 * Bloco do resultado.
 *
 * `calibrado` roda sempre com os mesmos parametros (mesmo numero de tentativas,
 * mesmo tamanho de grade, mesmo intervalo). So esses resultados entram na linha
 * do tempo — comparar hoje com o mes passado so faz sentido se a prova foi a
 * mesma. `desafio` e a versao adaptativa, que fica mais dificil conforme a
 * pessoa melhora: serve para manter o interesse, e de proposito fica fora da
 * analise de tendencia.
 */
export type Block = 'calibrado' | 'desafio';

export interface ProfileSettings {
  textSize: 'normal' | 'grande' | 'enorme';
  highContrast: boolean;
  sound: boolean;
  /** Quantos jogos entram na sessao diaria (2 a 6). */
  gamesPerSession: number;
  /** Liga o bloco desafio depois do bloco calibrado. */
  challengeBlock: boolean;
}

export interface Profile {
  id: string;
  name: string;
  birthYear: number | null;
  /** Texto livre: 'Alzheimer', 'Parkinson', 'investigacao', 'nenhum'. */
  condition: string;
  createdAt: string;
  settings: ProfileSettings;
  /** Nivel adaptativo por jogo, usado apenas pelo bloco desafio. */
  difficulty: Partial<Record<GameId, number>>;
}

/** Auto-relato rapido antes da sessao. Contextualiza quedas pontuais. */
export interface CheckIn {
  /** 1 = dormi muito mal, 5 = dormi muito bem. */
  sleep: number;
  /** 1 = muito mal, 5 = muito bem. */
  mood: number;
  /** Tomou os remedios de hoje como sempre? null = nao se aplica. */
  meds: boolean | null;
  notes: string;
}

export interface Session {
  id: string;
  profileId: string;
  /** AAAA-MM-DD no fuso local, para a nocao de "uma sessao por dia". */
  date: string;
  startedAt: string;
  finishedAt: string | null;
  checkIn: CheckIn | null;
  planned: GameId[];
  completed: boolean;
}

export interface TestResult {
  id: string;
  profileId: string;
  sessionId: string;
  game: GameId;
  block: Block;
  startedAt: string;
  durationMs: number;
  /** Metricas cruas do jogo (ms, contagens). Guardadas para reanalise futura. */
  metrics: Record<string, number>;
  /** 0-100, comparavel entre sessoes do mesmo jogo no bloco calibrado. */
  score: number;
  /** Resultado confiavel? Um invalido aparece no historico mas nao na tendencia. */
  valid: boolean;
  invalidReason: string | null;
}

/** Um dia de dados ja reduzido a uma nota por dominio. */
export interface DayPoint {
  date: string;
  /** Milissegundos do inicio da sessao, para regressao no eixo do tempo. */
  time: number;
  scores: Partial<Record<DomainId, number>>;
  /** Media dos dominios medidos naquele dia. */
  overall: number | null;
  checkIn: CheckIn | null;
}
