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
    plain: 'Quanto tempo o cérebro leva para registrar algo e reagir.',
  },
  inibicao: {
    id: 'inibicao',
    name: 'Controle de impulso',
    plain: 'A capacidade de segurar uma ação automática quando ela não cabe.',
  },
  memoria_trabalho: {
    id: 'memoria_trabalho',
    name: 'Memória de trabalho',
    plain: 'Segurar informação na cabeça por alguns segundos e usá-la.',
  },
  memoria_visual: {
    id: 'memoria_visual',
    name: 'Memória visual',
    plain: 'Guardar e reencontrar onde as coisas estavam.',
  },
  atencao: {
    id: 'atencao',
    name: 'Atenção seletiva',
    plain: 'Focar no que importa ignorando a informação que atrapalha.',
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
      'A tela vai ficar cinza. Assim que ela ficar verde, toque o mais rápido que conseguir. Não adianta adivinhar: tocar antes do verde não conta.',
    approxSeconds: 60,
    icon: '⚡',
  },
  gonogo: {
    id: 'gonogo',
    name: 'Vai / Não vai',
    domain: 'inibicao',
    tagline: 'Toque nos círculos azuis. Segure nos laranjas.',
    howTo:
      'Formas vão aparecer uma de cada vez. Toque rápido quando for um círculo AZUL. Quando aparecer um quadrado LARANJA, não toque em nada — apenas espere passar.',
    approxSeconds: 110,
    icon: '🔵',
  },
  sequencia: {
    id: 'sequencia',
    name: 'Sequência',
    domain: 'memoria_trabalho',
    tagline: 'Repita a ordem em que os quadros acenderam.',
    howTo:
      'Alguns quadros vão acender, um por vez. Quando parar, toque nos mesmos quadros na mesma ordem. A cada acerto a sequência fica um pouco maior.',
    approxSeconds: 130,
    icon: '🧩',
  },
  pares: {
    id: 'pares',
    name: 'Pares',
    domain: 'memoria_visual',
    tagline: 'Encontre as figuras iguais.',
    howTo:
      'As cartas estão viradas para baixo. Toque em duas para virar. Se forem iguais, elas ficam abertas. Se não, viram de novo — guarde onde estavam.',
    approxSeconds: 120,
    icon: '🃏',
  },
  stroop: {
    id: 'stroop',
    name: 'Cor certa',
    domain: 'atencao',
    tagline: 'Responda à COR da tinta, não à palavra escrita.',
    howTo:
      'Vai aparecer uma palavra colorida. Toque no botão da COR DA TINTA, ignorando o que a palavra diz. Exemplo: a palavra AZUL escrita em vermelho — a resposta é vermelho.',
    approxSeconds: 120,
    icon: '🎨',
  },
  trilhas: {
    id: 'trilhas',
    name: 'Trilhas',
    domain: 'flexibilidade',
    tagline: 'Ligue os pontos na ordem, alternando número e letra.',
    howTo:
      'Na primeira parte, toque nos números em ordem: 1, 2, 3... Na segunda, alterne número e letra: 1, A, 2, B, 3, C... Vá o mais rápido que conseguir sem errar.',
    approxSeconds: 150,
    icon: '🔗',
  },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];
export const DOMAIN_IDS = Object.keys(DOMAINS) as DomainId[];

export function domainOf(game: GameId): DomainId {
  return GAMES[game].domain;
}
