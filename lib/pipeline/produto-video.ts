import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateProducts, ideas, type AffiliateProduct, type Scene } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { hydrateEnv } from '@/lib/secrets';
import { generateIdeas } from '@/lib/ai/script';
import type { ProductContext } from '@/lib/ai/templates';
import { formatMoney } from '@/lib/money';

/**
 * Video de um produto especifico.
 *
 * A diferenca para o resto do pipeline e o que entra no prompt: em vez de uma
 * tendencia ("air fryer" como palavra), entra um produto com nome, preco e
 * categoria reais. Um roteiro que diz "essa air fryer de 4 litros" convence
 * mais que um que fala de air fryers em geral — e e o produto cujo link voce
 * vai colocar na bio, entao falar dele e o minimo.
 *
 * O ganho colateral e no render: as cenas do produto ja saem apontando para a
 * foto dele, e o pipeline nem consulta o banco de imagens. A foto pesa
 * kilobytes; o clipe de video que o Pexels devolve pesa dezenas de megabytes
 * por cena, e baixar isso e o que estourava o tempo da funcao.
 */

/** A partir de qual cena o produto aparece na tela. */
const PRIMEIRA_CENA_DO_PRODUTO = 2;

/**
 * O template `produto` comeca pelo problema, nao pelo produto: gancho e
 * agitacao falam da dor. Mostrar a caixa do produto logo no primeiro segundo
 * entrega o anuncio antes do interesse, e o dedo rola. Por isso a foto so
 * entra a partir da terceira cena, quando o roteiro chega na solucao.
 */
export function anexarImagem(scenes: Scene[], imageUrl: string | null): Scene[] {
  if (!imageUrl) return scenes;

  return scenes.map((scene, i) =>
    i >= PRIMEIRA_CENA_DO_PRODUTO ? { ...scene, imageUrl } : scene,
  );
}

/** O que a IA precisa saber do produto — so o que a plataforma de fato informou. */
export function contextoDoProduto(product: AffiliateProduct): ProductContext {
  return {
    name: product.name,
    source: product.source as 'amazon' | 'hotmart',
    category: product.category,
    price: product.priceCents != null ? formatMoney(product.priceCents, product.currency) : null,
    commissionRate: product.commissionRate,
  };
}

/**
 * Monta a legenda do post.
 *
 * O link vai no texto por documentacao, nao por clique: o TikTok nao torna
 * clicavel nada na legenda. Quem decide converter e a bio — e a legenda existe
 * para dizer que o link esta la.
 */
export function montarLegenda(
  base: string,
  product: AffiliateProduct,
  assinatura: string,
): string {
  const partes = [base.trim()];

  // A divulgacao de afiliado e exigida pelo contrato da Amazon e e boa pratica
  // na Hotmart. Sai automatica para nao depender de lembrar em cada post.
  partes.push(
    product.source === 'amazon'
      ? 'Link na bio. Como Associado da Amazon, eu ganho com compras qualificadas.'
      : 'Link na bio. Publicacao com link de afiliado.',
  );

  if (assinatura.trim()) partes.push(assinatura.trim());

  return partes.join(' ').slice(0, 2200);
}

export type ProductIdeaResult = {
  ideaId: string;
  title: string;
  warnings: string[];
};

/** Gera a ideia de video para um produto e a deixa pronta para aprovacao. */
export async function generateIdeaForProduct(productId: string): Promise<ProductIdeaResult> {
  await hydrateEnv();

  const [product] = await db
    .select()
    .from(affiliateProducts)
    .where(eq(affiliateProducts.id, productId))
    .limit(1);

  if (!product) throw new Error('Produto nao encontrado. Importe o catalogo de novo.');

  const settings = await getSettings();
  const warnings: string[] = [];

  if (!product.imageUrl) {
    warnings.push(
      'Este produto veio sem foto, entao as cenas usam imagem de banco. ' +
        'Produtos da Amazon costumam ter foto; os da Hotmart nem sempre.',
    );
  }

  const [gerada] = await generateIdeas({
    settings,
    // O template `produto` e obrigatorio aqui, qualquer que seja o padrao do
    // canal: e o unico com estrutura de conversao (gancho, dor, solucao, CTA).
    template: 'produto',
    count: 1,
    product: contextoDoProduto(product),
  });

  if (!gerada) throw new Error('A IA nao devolveu roteiro para este produto.');

  const scenes = anexarImagem(gerada.scenes, product.imageUrl);

  const [idea] = await db
    .insert(ideas)
    .values({
      trendId: null,
      template: 'produto',
      title: gerada.title,
      hook: gerada.hook,
      scenes,
      caption: montarLegenda(gerada.caption, product, settings.captionSignature),
      hashtags: gerada.hashtags,
      score: gerada.score,
      status: 'pending',
      // O link fica registrado aqui porque a ideia sobrevive a reimportacoes do
      // catalogo — e e ele que voce vai colar na pagina da bio na hora de
      // publicar.
      notes: [gerada.reasoning, product.url ? `Link de afiliado: ${product.url}` : null]
        .filter(Boolean)
        .join('\n'),
    })
    .returning({ id: ideas.id });

  return { ideaId: idea.id, title: gerada.title, warnings };
}
