import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { anexarImagem, contextoDoProduto, montarLegenda } from '@/lib/pipeline/produto-video';
import { productBlock } from '@/lib/ai/templates';
import type { AffiliateProduct, Scene } from '@/lib/db/schema';

/**
 * Video de um produto real tem dois riscos que video de tendencia nao tem: a
 * IA falar de caracteristica que ninguem informou, e o post sair sem a
 * divulgacao de afiliado que o contrato da Amazon exige. Os dois terminam do
 * mesmo jeito — voce afirmando coisa errada em nome proprio, com o seu link
 * embaixo.
 */

function produto(overrides: Partial<AffiliateProduct> = {}): AffiliateProduct {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    source: 'amazon',
    externalId: 'B0ABC12345',
    name: 'Air Fryer 4L Preta',
    category: 'Cozinha',
    url: 'https://www.amazon.com.br/dp/B0ABC12345?tag=meutag-20',
    imageUrl: 'https://m.media-amazon.com/images/I/abc.jpg',
    priceCents: 34990,
    currency: 'BRL',
    commissionRate: null,
    commissionCents: null,
    score: 72,
    rating: null,
    reviewCount: null,
    salesRank: 120,
    operating: true,
    operatingSince: new Date(),
    notes: null,
    raw: null,
    history: [],
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  } as AffiliateProduct;
}

function cenas(total: number): Scene[] {
  return Array.from({ length: total }, (_, i) => ({
    text: `cena ${i}`,
    visual: 'person in kitchen',
    seconds: 5,
  }));
}

describe('anexarImagem', () => {
  test('a foto do produto entra a partir da terceira cena', () => {
    // As duas primeiras sao gancho e agitacao: elas falam da dor, nao do
    // produto. Mostrar a caixa no primeiro segundo entrega o anuncio antes do
    // interesse, e o dedo rola.
    const resultado = anexarImagem(cenas(5), 'https://exemplo/foto.jpg');

    assert.equal(resultado[0].imageUrl, undefined);
    assert.equal(resultado[1].imageUrl, undefined);
    assert.equal(resultado[2].imageUrl, 'https://exemplo/foto.jpg');
    assert.equal(resultado[4].imageUrl, 'https://exemplo/foto.jpg');
  });

  test('produto sem foto nao altera as cenas', () => {
    const originais = cenas(4);
    assert.deepEqual(anexarImagem(originais, null), originais);
  });

  test('nao muda o texto nem a duracao das cenas', () => {
    const resultado = anexarImagem(cenas(4), 'https://exemplo/foto.jpg');
    assert.equal(resultado[3].text, 'cena 3');
    assert.equal(resultado[3].seconds, 5);
    assert.equal(resultado[3].visual, 'person in kitchen');
  });

  test('roteiro curto ainda mostra o produto na ultima cena', () => {
    // Com 3 cenas, so a ultima recebe. Menos que isso seria um video sem
    // produto nenhum na tela — que e o unico resultado inaceitavel aqui.
    const resultado = anexarImagem(cenas(3), 'https://exemplo/foto.jpg');
    assert.equal(resultado[2].imageUrl, 'https://exemplo/foto.jpg');
  });
});

describe('contextoDoProduto', () => {
  test('formata o preco na moeda de origem', () => {
    const ctx = contextoDoProduto(produto());
    assert.match(ctx.price ?? '', /349,90/);
    assert.equal(ctx.name, 'Air Fryer 4L Preta');
    assert.equal(ctx.source, 'amazon');
    assert.equal(ctx.category, 'Cozinha');
  });

  test('produto sem preco nao inventa um', () => {
    // Preco nulo acontece quando a Amazon nao devolve oferta ativa. Um "R$
    // 0,00" no prompt viraria "de graca" no roteiro.
    const ctx = contextoDoProduto(produto({ priceCents: null }));
    assert.equal(ctx.price, null);
  });
});

describe('productBlock', () => {
  test('proibe inventar caracteristica que nao foi informada', () => {
    // E a instrucao central: a IA so recebeu nome, categoria e preco. Qualquer
    // especificacao alem disso seria chute apresentado como fato sobre um
    // produto real.
    const bloco = productBlock(contextoDoProduto(produto()));
    assert.match(bloco, /Nao invente caracteristica/i);
  });

  test('quando ha preco, exige avisar que ele muda', () => {
    // O video fica no ar por semanas; preco de Amazon muda todo dia.
    const bloco = productBlock(contextoDoProduto(produto()));
    assert.match(bloco, /pode mudar/i);
  });

  test('sem preco, nao fala de preco', () => {
    const bloco = productBlock(contextoDoProduto(produto({ priceCents: null })));
    assert.ok(!/Preco de referencia/.test(bloco));
    assert.ok(!/pode mudar/i.test(bloco));
  });

  test('distingue produto digital de fisico', () => {
    const fisico = productBlock(contextoDoProduto(produto()));
    assert.match(fisico, /produto fisico/i);

    const digital = productBlock(
      contextoDoProduto(produto({ source: 'hotmart', name: 'Curso de Ingles' })),
    );
    assert.match(digital, /produto digital/i);
    // Falar em "entrega" e "frete" de um curso e o erro classico de quem
    // reusa o mesmo roteiro para as duas plataformas.
    assert.match(digital, /nao de entrega fisica/i);
  });

  test('traz o nome do produto, para o roteiro nao falar da categoria', () => {
    const bloco = productBlock(contextoDoProduto(produto()));
    assert.match(bloco, /Air Fryer 4L Preta/);
    assert.match(bloco, /pelo nome, nao da categoria/i);
  });
});

describe('montarLegenda', () => {
  test('acrescenta a divulgacao exigida pela Amazon', () => {
    // O contrato do Associates exige essa frase. Sai automatica para nao
    // depender de lembrar em cada post — esquecer uma vez ja e violacao.
    const legenda = montarLegenda('Testei e virou meu preferido', produto(), '');
    assert.match(legenda, /Associado da Amazon, eu ganho com compras qualificadas/);
  });

  test('na Hotmart, declara o link de afiliado sem citar a Amazon', () => {
    const legenda = montarLegenda('Mudou meu ingles', produto({ source: 'hotmart' }), '');
    assert.match(legenda, /link de afiliado/i);
    assert.ok(!/Amazon/.test(legenda));
  });

  test('a assinatura do canal entra no fim', () => {
    const legenda = montarLegenda('Base', produto(), '@meucanal');
    assert.match(legenda, /@meucanal$/);
  });

  test('assinatura vazia nao deixa espaco sobrando', () => {
    const legenda = montarLegenda('Base', produto(), '   ');
    assert.equal(legenda, legenda.trim());
  });

  test('respeita o limite de 2200 caracteres do TikTok', () => {
    // Passar do limite faz o TikTok recusar o post inteiro.
    const legenda = montarLegenda('x'.repeat(3000), produto(), '@canal');
    assert.ok(legenda.length <= 2200, `legenda com ${legenda.length} caracteres`);
  });
});
