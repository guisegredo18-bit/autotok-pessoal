import type { AppSettings } from '@/lib/db/settings';
import { market } from './mercado';

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

/**
 * Regras que valem para qualquer template.
 *
 * A regra de idioma sai do mercado configurado, e nao fica escrita aqui: era
 * justamente ela que prendia o projeto ao Brasil enquanto a tela oferecia um
 * campo de idioma que nao surtia efeito nenhum.
 */
export function commonRules(marketCode: unknown): string {
  const alvo = market(marketCode);
  return COMMON_RULES.replace('{{IDIOMA}}', alvo.writingRule).replace(
    '{{LEGENDA_IDIOMA}}',
    alvo.captionRule,
  );
}

const COMMON_RULES = `
REGRAS DE ESCRITA:
{{IDIOMA}}
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
{{LEGENDA_IDIOMA}}
- A legenda tem no maximo 150 caracteres e complementa o video, nao repete o roteiro.
- 4 a 6 hashtags, misturando uma de alto volume, duas do nicho e uma da tendencia usada.
- Escreva as hashtags sem o simbolo #, apenas a palavra.
`.trim();

/** Monta o bloco de contexto do usuario para o prompt. */
/**
 * O produto que o video vai promover, quando houver um.
 *
 * Existe para que o roteiro pare de falar de uma categoria e passe a falar de
 * uma coisa: "essa air fryer de 4 litros por R$ 349" prende mais que "air
 * fryers". Os campos sao os que a Amazon e a Hotmart de fato entregam — nada
 * aqui e inventado para o prompt.
 */
export type ProductContext = {
  name: string;
  source: 'amazon' | 'hotmart';
  category?: string | null;
  /** Preco ja formatado na moeda de origem, ex: "R$ 349,90". */
  price?: string | null;
  /** Percentual de comissao, so para a IA saber que vale insistir. */
  commissionRate?: number | null;
};

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

/**
 * Instrucoes para um video de um produto especifico.
 *
 * Duas regras aqui existem para nao criar problema com as plataformas nem com
 * quem assiste:
 *
 * O preco entra como referencia, e o roteiro precisa dizer que ele muda. Preco
 * de Amazon oscila todo dia, e um video afirmando "custa R$ 349" continua no ar
 * semanas depois valendo outro numero — isso queima a confianca de quem clica.
 *
 * A IA nao pode inventar caracteristica que nao esta aqui. Ela so recebeu nome,
 * categoria e preco; qualquer especificacao alem disso seria chute apresentado
 * como fato sobre um produto de verdade, com o seu link embaixo.
 */
export function productBlock(product: ProductContext): string {
  const loja = product.source === 'amazon' ? 'Amazon' : 'Hotmart';
  const lines = [
    '',
    `PRODUTO A PROMOVER (dado real, vindo da ${loja}):`,
    `- Nome: ${product.name}`,
  ];

  if (product.category) lines.push(`- Categoria: ${product.category}`);
  if (product.price) lines.push(`- Preco de referencia: ${product.price}`);

  lines.push(
    '',
    'REGRAS DESTE VIDEO:',
    '- Fale DESTE produto, pelo nome, nao da categoria em geral.',
    '- Nao invente caracteristica, medida, material ou especificacao que nao esteja acima.',
    '  Voce so sabe o que esta escrito aqui; o resto seria chute sobre um produto real.',
  );

  if (product.price) {
    lines.push(
      '- Se citar o preco, diga que ele pode mudar (ex: "estava por X quando gravei").',
      '  O video fica no ar por semanas e o preco muda; afirmar um valor fixo queima confianca.',
    );
  }

  lines.push(
    product.source === 'hotmart'
      ? '- E um produto digital (curso, ebook, assinatura). Fale do resultado que ele entrega, nao de entrega fisica.'
      : '- E um produto fisico. Fale de uso no dia a dia, nao de especificacao tecnica.',
    '- O CTA final deve mandar para o link da bio, sem prometer desconto que voce nao controla.',
  );

  return lines.join('\n');
}
