import type { AppSettings } from '@/lib/db/settings';

/**
 * Templates de video.
 *
 * Cada template descreve, em linguagem natural, a estrutura narrativa que a IA
 * deve seguir. Manter isso como texto (e nao como codigo) e proposital: mudar
 * o formato de um video vira uma edicao de prompt, nao um deploy de logica.
 */

export type TemplateName = 'produto' | 'viral';

export type VideoTemplate = {
  name: TemplateName;
  label: string;
  description: string;
  /** Instrucao de estrutura injetada no prompt da IA. */
  structure: string;
  /** Numero de cenas alvo (a IA pode variar um pouco). */
  scenes: [min: number, max: number];
};

export const TEMPLATES: Record<TemplateName, VideoTemplate> = {
  produto: {
    name: 'produto',
    label: 'Produto / afiliado',
    description:
      'Mostra um produto em alta, o problema que ele resolve e uma chamada para acao. Foco em conversao.',
    scenes: [4, 6],
    structure: `
ESTRUTURA OBRIGATORIA (video de produto):
1. GANCHO (0-3s): comece pelo problema ou pelo resultado, nunca pelo produto.
   Ex: "Parei de gastar 40 reais por mes com isso" / "Isso aqui resolveu meu problema de..."
2. AGITACAO (3-8s): descreva a dor de forma concreta e reconhecivel.
3. SOLUCAO (8-18s): apresente o produto. Cite 2 ou 3 beneficios praticos, nao especificacoes tecnicas.
4. PROVA (18-25s): um detalhe que gera credibilidade (uso real, comparacao, numero).
5. CTA (25-30s): chamada direta e natural. Ex: "link na bio" ou "comenta EU QUERO".
`.trim(),
  },

  viral: {
    name: 'viral',
    label: 'Viral / entretenimento',
    description:
      'Curiosidades, listas e storytelling curto usando a tendencia do momento. Foco em retencao e crescimento.',
    scenes: [4, 7],
    structure: `
ESTRUTURA OBRIGATORIA (video viral):
1. GANCHO (0-3s): afirmacao surpreendente, pergunta ou promessa. Precisa parar o dedo.
   Ex: "Voce faz isso todo dia e nao sabia que..." / "3 coisas que ninguem te conta sobre..."
2. CONTEXTO (3-8s): entregue rapido o que voce prometeu. Nada de enrolacao.
3. DESENVOLVIMENTO (8-25s): 2 a 4 blocos curtos de informacao, cada um com uma virada.
   Sempre feche cada bloco com um motivo para continuar assistindo.
4. FECHAMENTO (25-30s): conclusao com impacto + convite ao comentario.
   Ex: "comenta se voce ja sabia" / "salva pra nao esquecer".
`.trim(),
  },
};

/** Regras que valem para qualquer template. */
export const COMMON_RULES = `
REGRAS DE ESCRITA:
- Portugues do Brasil, informal, como uma pessoa falando com um amigo.
- Frases curtas. Cada cena e uma ou duas frases no maximo.
- Nada de introducao tipo "ola pessoal" ou "hoje eu vou falar sobre". Va direto.
- Nada de emoji no texto narrado (ele vai ser lido em voz alta).
- Nunca prometa resultado financeiro, cura, ou beneficio de saude nao comprovado.
- Nao invente estatistica, preco ou dado especifico. Se nao tem certeza, fale de forma generica.

CAMPO "visual" DE CADA CENA:
- E um termo de busca em INGLES para achar imagem/video de fundo em banco de imagens.
- Use termos concretos e visuais: "person cooking in modern kitchen", nao "conceito de praticidade".
- 2 a 5 palavras. Sem nomes de marca (nao existe no banco de imagens).

LEGENDA E HASHTAGS:
- A legenda tem no maximo 150 caracteres e complementa o video, nao repete o roteiro.
- 4 a 6 hashtags, misturando uma de alto volume, duas do nicho e uma da tendencia usada.
- Escreva as hashtags sem o simbolo #, apenas a palavra.
`.trim();

/** Monta o bloco de contexto do usuario para o prompt. */
export function contextBlock(settings: AppSettings, trendName?: string, trendKind?: string): string {
  const lines = [
    `NICHO DO CANAL: ${settings.niche}`,
    `IDIOMA: ${settings.language}`,
    `DURACAO ALVO DO VIDEO: ${settings.targetDuration} segundos`,
  ];
  if (trendName) {
    lines.push(
      `TENDENCIA A APROVEITAR: ${trendName} (tipo: ${trendKind ?? 'hashtag'})`,
      'Conecte o roteiro a essa tendencia de forma natural. Se a tendencia nao combinar com o nicho, use apenas o formato dela e mantenha o assunto do nicho.',
    );
  }
  if (settings.blockedWords.length > 0) {
    lines.push(`PALAVRAS PROIBIDAS (nunca use): ${settings.blockedWords.join(', ')}`);
  }
  return lines.join('\n');
}
