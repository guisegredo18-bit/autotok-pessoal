import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { extractJson, repairJson, parseJson, InvalidJsonError } from '@/lib/ai/json';
import { normalizeIdea, type GeneratedIdea } from '@/lib/ai/script';

/**
 * Estes testes existem porque a aplicacao roda com modelos gratuitos, que
 * seguem instrucao de formato pior que os pagos. Cada caso aqui e um desvio
 * real que modelos menores cometem — e que, sem tratamento, quebraria a
 * geracao de roteiro em producao.
 */

describe('extractJson', () => {
  test('pega JSON puro', () => {
    assert.equal(extractJson('{"a":1}'), '{"a":1}');
  });

  test('tira o bloco de codigo cercado', () => {
    assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}');
  });

  test('ignora a conversa antes e depois do JSON', () => {
    const text = 'Claro! Aqui esta o roteiro:\n{"a":1}\nEspero ter ajudado.';
    assert.equal(extractJson(text), '{"a":1}');
  });

  test('respeita objetos aninhados', () => {
    const json = '{"ideas":[{"scenes":[{"seconds":4}]}]}';
    assert.equal(extractJson(`bla ${json} bla`), json);
  });

  test('nao se confunde com chaves dentro de string', () => {
    // Um roteiro pode conter chave no texto narrado; contar chaves sem olhar
    // as aspas cortaria o JSON no meio.
    const json = '{"text":"use } assim {","ok":true}';
    assert.equal(extractJson(json), json);
  });

  test('lida com aspas escapadas dentro de string', () => {
    const json = '{"text":"ele disse \\"oi\\" e saiu"}';
    assert.equal(extractJson(json), json);
  });

  test('devolve null quando nao ha objeto', () => {
    assert.equal(extractJson('nenhum json aqui'), null);
    assert.equal(extractJson(''), null);
  });

  test('devolve null quando o objeto nunca fecha', () => {
    assert.equal(extractJson('{"a":1'), null);
  });
});

describe('repairJson', () => {
  test('remove virgula sobrando', () => {
    assert.equal(repairJson('{"a":1,}'), '{"a":1}');
    assert.equal(repairJson('[1,2,]'), '[1,2]');
  });

  test('troca aspas tipograficas por aspas retas', () => {
    assert.equal(repairJson('{“a”:1}'), '{"a":1}');
  });
});

describe('parseJson', () => {
  const schema = z.object({ nome: z.string(), idade: z.number() });

  test('valida contra o schema', () => {
    assert.deepEqual(parseJson('{"nome":"ana","idade":30}', schema), {
      nome: 'ana',
      idade: 30,
    });
  });

  test('conserta e aceita JSON com virgula sobrando', () => {
    assert.deepEqual(parseJson('{"nome":"ana","idade":30,}', schema), {
      nome: 'ana',
      idade: 30,
    });
  });

  test('explica qual campo esta errado', () => {
    // A mensagem volta para o modelo na segunda tentativa, entao precisa
    // dizer o que consertar.
    assert.throws(
      () => parseJson('{"nome":"ana","idade":"trinta"}', schema),
      (err: unknown) => err instanceof InvalidJsonError && /idade/.test(err.message),
    );
  });

  test('erro claro quando nao veio JSON nenhum', () => {
    assert.throws(
      () => parseJson('desculpe, nao posso ajudar', schema),
      /nao continha nenhum objeto JSON/,
    );
  });
});

describe('normalizeIdea', () => {
  function idea(patch: Partial<GeneratedIdea> = {}): GeneratedIdea {
    return {
      title: 't',
      hook: 'h',
      scenes: [{ text: 'oi', visual: 'person', seconds: 4 }],
      caption: 'legenda',
      hashtags: ['tag'],
      score: 70,
      reasoning: 'r',
      ...patch,
    };
  }

  test('tira a cerquilha das hashtags', () => {
    // O TikTok recebe as hashtags dentro da legenda; guardar com "#" faria
    // sair "##tag" no post.
    assert.deepEqual(normalizeIdea(idea({ hashtags: ['#Dicas', 'BRASIL'] })).hashtags, [
      'dicas',
      'brasil',
    ]);
  });

  test('descarta hashtag vazia ou de uma letra', () => {
    assert.deepEqual(normalizeIdea(idea({ hashtags: ['#', 'a', 'boa'] })).hashtags, ['boa']);
  });

  test('limita a legenda a 150 caracteres', () => {
    assert.equal(normalizeIdea(idea({ caption: 'x'.repeat(300) })).caption.length, 150);
  });

  test('duracao ausente vira o padrao, duracao absurda e trazida para a faixa', () => {
    // Sao duas regras diferentes de proposito: 0 significa "o modelo nao
    // informou" (usa o padrao), enquanto 0.4 significa "informou algo curto
    // demais" (sobe para o piso).
    const scenes = [
      { text: 'a', visual: 'v', seconds: 0 },
      { text: 'b', visual: 'v', seconds: 0.4 },
      { text: 'c', visual: 'v', seconds: 90 },
    ];
    const result = normalizeIdea(idea({ scenes }));
    assert.equal(result.scenes[0].seconds, 4);
    assert.equal(result.scenes[1].seconds, 1.5);
    assert.equal(result.scenes[2].seconds, 10);
  });

  test('remove cena sem texto', () => {
    const scenes = [
      { text: '  ', visual: 'v', seconds: 3 },
      { text: 'vale', visual: 'v', seconds: 3 },
    ];
    assert.equal(normalizeIdea(idea({ scenes })).scenes.length, 1);
  });

  test('mantem a nota entre 0 e 100', () => {
    assert.equal(normalizeIdea(idea({ score: 150 })).score, 100);
    assert.equal(normalizeIdea(idea({ score: -20 })).score, 0);
  });
});
