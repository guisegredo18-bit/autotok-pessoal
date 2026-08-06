import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isModelNotFound, rankModels, usableModels } from '@/lib/ai/gemini-models';

/**
 * O Google aposentou `gemini-2.5-flash` para contas novas e a aplicacao parou
 * com um 404. Fixar outro nome no codigo apenas adiaria a mesma quebra, entao
 * a escolha do modelo passou a ser automatica — e e ela que estes testes
 * protegem.
 */

describe('isModelNotFound', () => {
  test('reconhece a mensagem real do Google', () => {
    const real =
      'respondeu 404: { "error": { "code": 404, "message": "This model models/gemini-2.5-flash ' +
      'is no longer available to new users.", "status": "NOT_FOUND" } }';
    assert.equal(isModelNotFound(real), true);
  });

  test('reconhece variacoes do mesmo caso', () => {
    assert.equal(isModelNotFound('status: NOT_FOUND'), true);
    assert.equal(isModelNotFound('HTTP 404 model not found'), true);
  });

  test('nao confunde com outros erros, que exigem outra acao', () => {
    // Chave errada ou limite atingido nao se resolvem trocando de modelo;
    // tratar como se fosse mascararia o problema real.
    assert.equal(isModelNotFound('API key not valid'), false);
    assert.equal(isModelNotFound('429 rate limit exceeded'), false);
  });
});

describe('usableModels', () => {
  test('fica so com os que sabem gerar conteudo', () => {
    const json = {
      models: [
        { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    };
    assert.deepEqual(usableModels(json), ['models/gemini-3-flash']);
  });

  test('mantem o modelo quando a lista de metodos nao vem', () => {
    // Descartar por falta de informacao seria pior: perderiamos um modelo que
    // provavelmente funciona.
    const json = { models: [{ name: 'models/gemini-3-flash' }] };
    assert.deepEqual(usableModels(json), ['models/gemini-3-flash']);
  });

  test('resposta vazia nao quebra', () => {
    assert.deepEqual(usableModels({}), []);
    assert.deepEqual(usableModels(null), []);
  });
});

describe('rankModels', () => {
  test('prefere a versao mais nova', () => {
    const ranked = rankModels([
      'models/gemini-2.5-flash',
      'models/gemini-3.6-flash',
      'models/gemini-3-flash',
    ]);
    assert.equal(ranked[0], 'gemini-3.6-flash');
  });

  test('prefere flash normal a flash-lite', () => {
    // O lite escreve roteiro visivelmente pior.
    const ranked = rankModels(['models/gemini-3-flash-lite', 'models/gemini-3-flash']);
    assert.equal(ranked[0], 'gemini-3-flash');
  });

  test('prefere estavel a preview', () => {
    // Preview some sem aviso — trocar uma quebra por outra nao ajuda.
    const ranked = rankModels(['models/gemini-4-flash-preview', 'models/gemini-3-flash']);
    assert.equal(ranked[0], 'gemini-3-flash');
  });

  test('prefere o apelido "latest", que sobrevive as aposentadorias', () => {
    const ranked = rankModels(['models/gemini-3-flash', 'models/gemini-flash-latest']);
    assert.equal(ranked[0], 'gemini-flash-latest');
  });

  test('descarta o que nao e flash', () => {
    // Pro e caro e nao tem free tier util para esta aplicacao.
    const ranked = rankModels(['models/gemini-3-pro', 'models/text-embedding-004']);
    assert.deepEqual(ranked, []);
  });

  test('tira o prefixo models/ que a API devolve', () => {
    assert.equal(rankModels(['models/gemini-3-flash'])[0], 'gemini-3-flash');
  });
});
