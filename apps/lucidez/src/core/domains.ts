import type { DomainId, GameId } from './types.ts';

export interface DomainMeta {
  id: DomainId;
  name: string;
  /** O que esse dominio quer dizer, em portugues de gente. */
  plain: string;
}

export const DOMAINS: Record<DomainId, DomainMeta> = {
  velocidade: {
    id: 'velocidade',
    name: 'Velocidade',
    plain: 'Quanto tempo o cerebro leva para registrar algo e reagir.',
  },
  inibicao: {
    id: 'inibicao',
    name: 'Controle de impulso',
    plain: 'A capacidade de segurar uma acao automatica quando ela nao cabe.',
  },
  memoria_trabalho: {
    id: 'memoria_trabalho',
    name: 'Memoria de trabalho',
    plain: 'Segurar informacao na cabeca por alguns segundos e usa-la.',
  },
  memoria_visual: {
    id: 'memoria_visual',
    name: 'Memoria visual',
    plain: 'Guardar e reencontrar onde as coisas estavam.',
  },
  atencao: {
    id: 'atencao',
    name: 'Atencao seletiva',
    plain: 'Focar no que importa ignorando a informacao que atrapalha.',
  },
  flexibilidade: {
    id: 'flexibilidade',
    name: 'Flexibilidade mental',
    plain: 'Alternar entre duas regras sem se perder no caminho.',
  },
};

export interface GameMeta {
  id: GameId;
  name: string;
  domain: DomainId;
  /** Frase curta mostrada no cartao do jogo. */
  tagline: string;
  /** Instrucao lida antes de comecar, escrita para ser entendida de primeira. */
  howTo: string;
  /** Duracao tipica do bloco calibrado, em segundos. */
  approxSeconds: number;
  icon: string;
}

export const GAMES: Record<GameId, GameMeta> = {
  reacao: {
    id: 'reacao',
    name: 'Reflexo',
    domain: 'velocidade',
    tagline: 'Toque assim que a tela ficar verde.',
    howTo:
      'A tela vai ficar cinza. Assim que ela ficar verde, toque o mais rapido que conseguir. Nao adianta adivinhar: tocar antes do verde nao conta.',
    approxSeconds: 60,
    icon: '⚡',
  },
  gonogo: {
    id: 'gonogo',
    name: 'Vai / Nao vai',
    domain: 'inibicao',
    tagline: 'Toque nos circulos azuis. Segure nos laranjas.',
    howTo:
      'Formas vao aparecer uma de cada vez. Toque rapido quando for um circulo AZUL. Quando aparecer um quadrado LARANJA, nao toque em nada — apenas espere passar.',
    approxSeconds: 110,
    icon: '🔵',
  },
  sequencia: {
    id: 'sequencia',
    name: 'Sequencia',
    domain: 'memoria_trabalho',
    tagline: 'Repita a ordem em que os quadros acenderam.',
    howTo:
      'Alguns quadros vao acender, um por vez. Quando parar, toque nos mesmos quadros na mesma ordem. A cada acerto a sequencia fica um pouco maior.',
    approxSeconds: 130,
    icon: '🧩',
  },
  pares: {
    id: 'pares',
    name: 'Pares',
    domain: 'memoria_visual',
    tagline: 'Encontre as figuras iguais.',
    howTo:
      'As cartas estao viradas para baixo. Toque em duas para virar. Se forem iguais, elas ficam abertas. Se nao, viram de novo — guarde onde estavam.',
    approxSeconds: 120,
    icon: '🃏',
  },
  stroop: {
    id: 'stroop',
    name: 'Cor certa',
    domain: 'atencao',
    tagline: 'Responda a COR da tinta, nao a palavra escrita.',
    howTo:
      'Vai aparecer uma palavra colorida. Toque no botao da COR DA TINTA, ignorando o que a palavra diz. Exemplo: a palavra AZUL escrita em vermelho — a resposta e vermelho.',
    approxSeconds: 120,
    icon: '🎨',
  },
  trilhas: {
    id: 'trilhas',
    name: 'Trilhas',
    domain: 'flexibilidade',
    tagline: 'Ligue os pontos na ordem, alternando numero e letra.',
    howTo:
      'Na primeira parte, toque nos numeros em ordem: 1, 2, 3... Na segunda, alterne numero e letra: 1, A, 2, B, 3, C... Va o mais rapido que conseguir sem errar.',
    approxSeconds: 150,
    icon: '🔗',
  },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];
export const DOMAIN_IDS = Object.keys(DOMAINS) as DomainId[];

export function domainOf(game: GameId): DomainId {
  return GAMES[game].domain;
}
