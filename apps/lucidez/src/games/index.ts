import type { ComponentType } from 'react';
import { plural } from '@/core/format';
import type { GameId } from '@/core/types';
import type { GameProps } from './shell';
import { GoNoGo } from './gonogo';
import { Pares } from './pares';
import { Reacao } from './reacao';
import { Sequencia } from './sequencia';
import { Stroop } from './stroop';
import { Trilhas } from './trilhas';

export const GAME_COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  reacao: Reacao,
  gonogo: GoNoGo,
  sequencia: Sequencia,
  pares: Pares,
  stroop: Stroop,
  trilhas: Trilhas,
};

export type { GameProps, GameOutcome } from './shell';

const s = (n: number | undefined) => (typeof n === 'number' ? Math.round(n / 100) / 10 : 0);

/**
 * Frase curta com a metrica que a pessoa entende, mostrada logo depois do
 * jogo. Nota de 0 a 100 nao diz nada sozinha; "310 ms" e "chegou a 6 quadros"
 * dizem. A nota fica para o relatorio, onde ha historico para compara-la.
 */
export function gameSummary(game: GameId, m: Record<string, number>): string {
  switch (game) {
    case 'reacao': {
      const extra =
        (m.lapses ?? 0) > 0 ? ` · ${plural(m.lapses!, 'lapso', 'lapsos')} de atenção` : '';
      return `Tempo típico de ${m.medianRt ?? 0} ms${extra}`;
    }
    case 'gonogo': {
      const nogo = m.nogoTrials ?? 0;
      const segurou = nogo - (m.commissions ?? 0);
      return `Segurou o toque em ${segurou} de ${nogo} formas laranjas · ${m.goRt ?? 0} ms de resposta`;
    }
    case 'sequencia':
      return `Chegou a ${m.maxSpan ?? 0} quadros de sequência`;
    case 'pares':
      return `${plural(m.pairs ?? 0, 'par', 'pares')} em ${plural(m.moves ?? 0, 'jogada', 'jogadas')} · ${s(m.durationMs)} s`;
    case 'stroop': {
      const total = (m.congruentTrials ?? 0) + (m.incongruentTrials ?? 0);
      const acertos = (m.congruentCorrect ?? 0) + (m.incongruentCorrect ?? 0);
      return `${acertos} de ${total} certos · a palavra atrapalhou ${m.interferenceMs ?? 0} ms`;
    }
    case 'trilhas':
      return `Parte 1 em ${s(m.timeAMs)} s, parte 2 em ${s(m.timeBMs)} s · ${plural(
        (m.errorsA ?? 0) + (m.errorsB ?? 0),
        'erro',
        'erros',
      )}`;
  }
}
