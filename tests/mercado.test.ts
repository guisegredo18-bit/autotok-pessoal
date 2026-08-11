import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MARKET, MARKETS, market, parseMarket, voiceForMarket } from '@/lib/ai/mercado';
import { commonRules } from '@/lib/ai/templates';

/**
 * Vender para os Estados Unidos nao e trocar a moeda do produto: e o roteiro em
 * ingles, narrado com voz americana.
 *
 * Ate esta mudanca o projeto tinha um campo de idioma que nao alcancava nem o
 * prompt de sistema ("especialista no mercado brasileiro", fixo) nem a regra de
 * escrita ("Portugues do Brasil", fixa) nem a voz (pt-BR, fixa). Trocar o campo
 * dava a impressao de ter funcionado e produzia o mesmo video em portugues.
 *
 * Estes testes existem para que o campo continue significando alguma coisa.
 */

describe('parseMarket', () => {
  test('aceita os dois mercados', () => {
    assert.equal(parseMarket('pt-BR'), 'pt-BR');
    assert.equal(parseMarket('en-US'), 'en-US');
  });

  test('valor invalido cai no padrao em vez de quebrar', () => {
    // Uma linha antiga do banco traz 'pt-br' ou vazio; o pipeline nao pode
    // parar por isso no meio de um render.
    assert.equal(parseMarket('klingon'), DEFAULT_MARKET);
    assert.equal(parseMarket(undefined), DEFAULT_MARKET);
    assert.equal(parseMarket(''), DEFAULT_MARKET);
  });
});

describe('regras de escrita', () => {
  test('mercado americano pede ingles, e proibe portugues explicitamente', () => {
    const regras = commonRules('en-US');
    assert.match(regras, /American English/);
    // A proibicao e explicita porque o resto do prompt e todo em portugues —
    // sem ela o modelo tende a responder no idioma em que foi instruido.
    assert.match(regras, /Never write in Portuguese/i);
    assert.ok(!/Portugues do Brasil, informal/.test(regras));
  });

  test('mercado brasileiro segue em portugues', () => {
    const regras = commonRules('pt-BR');
    assert.match(regras, /Portugues do Brasil, informal/);
    assert.ok(!/American English/.test(regras));
  });

  test('a legenda acompanha o idioma do roteiro', () => {
    // Roteiro em ingles com legenda em portugues entrega o video errado pela
    // metade — e a legenda e o que aparece no feed antes do play.
    assert.match(commonRules('en-US'), /caption and the hashtags in American English/i);
    assert.match(commonRules('pt-BR'), /legenda e as hashtags em portugues/i);
  });

  test('nenhum marcador de substituicao sobra no prompt', () => {
    for (const code of ['pt-BR', 'en-US'] as const) {
      assert.ok(
        !commonRules(code).includes('{{'),
        `sobrou marcador nao substituido em ${code}`,
      );
    }
  });

  test('as regras que nao dependem de idioma continuam valendo', () => {
    for (const code of ['pt-BR', 'en-US'] as const) {
      const regras = commonRules(code);
      assert.match(regras, /Nunca prometa resultado financeiro/);
      assert.match(regras, /Nao invente estatistica/);
    }
  });
});

describe('voiceForMarket', () => {
  test('sem voz configurada, usa a do mercado', () => {
    assert.equal(voiceForMarket('en-US'), MARKETS['en-US'].voice);
    assert.equal(voiceForMarket('pt-BR'), MARKETS['pt-BR'].voice);
  });

  test('voz do idioma errado e trocada', () => {
    // E o caso real: a voz brasileira e o padrao do projeto e ficaria para
    // tras ao mudar o mercado. Narrar ingles com ela sai com sotaque de
    // leitura fonetica, e o video nao vende para americano nenhum.
    const voz = voiceForMarket('en-US', 'pt-BR-ThalitaMultilingualNeural');
    assert.equal(voz, MARKETS['en-US'].voice);
    assert.match(voz, /^en-US-/);
  });

  test('voz escolhida no idioma certo e respeitada', () => {
    // Aqui a preferencia e valida: quem escolheu uma voz americana especifica
    // sabe o que quer, e trocar seria arrogancia.
    assert.equal(
      voiceForMarket('en-US', 'en-US-AndrewMultilingualNeural'),
      'en-US-AndrewMultilingualNeural',
    );
    assert.equal(voiceForMarket('pt-BR', 'pt-BR-AntonioNeural'), 'pt-BR-AntonioNeural');
  });

  test('voz com formato estranho nao passa despercebida', () => {
    // Sem prefixo de idioma nao da para saber o que ela fala; o mercado decide.
    assert.equal(voiceForMarket('en-US', 'minha-voz'), MARKETS['en-US'].voice);
  });
});

describe('mercado', () => {
  test('cada mercado tem voz do proprio idioma', () => {
    // Um erro de digitacao aqui produziria exatamente o bug que a funcao
    // acima existe para evitar.
    for (const [code, m] of Object.entries(MARKETS)) {
      assert.ok(m.voice.startsWith(code), `${code}: voz "${m.voice}" e de outro idioma`);
    }
  });

  test('o mercado americano espera dolar', () => {
    assert.equal(market('en-US').currency, 'USD');
    assert.equal(market('pt-BR').currency, 'BRL');
  });
});
