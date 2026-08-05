import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Testa o codigo de rede dos provedores contra um servidor local.
 *
 * Nao chama nenhuma API de verdade: o que esta sob teste e o que a aplicacao
 * envia (modelo, mensagens, modo JSON, cabecalho de autorizacao) e como ela le
 * a resposta — inclusive quando a resposta vem quebrada. Esses sao justamente
 * os erros que so apareceriam em producao, no meio da madrugada.
 */

type Handler = (body: any) => { status: number; payload: unknown | string };

let received: any = null;
let receivedUrl = '';
let receivedHeaders: Record<string, string | string[] | undefined> = {};
let handler: Handler = () => ({ status: 200, payload: {} });

const server: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    receivedUrl = req.url ?? '';
    receivedHeaders = req.headers;
    const { status, payload } = handler(received);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
});

let baseUrl = '';
let openAiCompatible: typeof import('@/lib/ai/providers').openAiCompatible;
let gemini: typeof import('@/lib/ai/providers').gemini;

before(async () => {
  // A ordem aqui e o ponto delicado: o modulo de provedores le o ambiente na
  // carga, e a porta do servidor so existe depois do listen. Por isso o import
  // e dinamico e acontece depois de configurar as variaveis.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  process.env.GEMINI_API_KEY = 'chave-gemini-de-teste';
  process.env.GEMINI_BASE_URL = baseUrl;
  process.env.GEMINI_MODEL = 'gemini-de-teste';

  const providers = await import('@/lib/ai/providers');
  openAiCompatible = providers.openAiCompatible;
  gemini = providers.gemini;
});

after(() => server.close());

function openAiProvider() {
  return openAiCompatible(
    'groq',
    baseUrl,
    () => 'chave-de-teste',
    () => 'modelo-de-teste',
    { 'x-extra': 'valor' },
  );
}

describe('provedor compativel com OpenAI (Groq, OpenRouter)', () => {
  test('envia modelo, mensagens e modo JSON', async () => {
    handler = () => ({
      status: 200,
      payload: { choices: [{ message: { content: '{"ok":true}' } }] },
    });

    const text = await openAiProvider().complete({
      system: 'voce e um roteirista',
      prompt: 'escreva algo',
      maxTokens: 500,
    });

    assert.equal(text, '{"ok":true}');
    assert.equal(received.model, 'modelo-de-teste');
    assert.equal(received.max_tokens, 500);
    // Sem o modo JSON, modelos menores respondem em prosa e a geracao falha.
    assert.deepEqual(received.response_format, { type: 'json_object' });
    assert.deepEqual(received.messages, [
      { role: 'system', content: 'voce e um roteirista' },
      { role: 'user', content: 'escreva algo' },
    ]);
  });

  test('manda a chave no cabecalho de autorizacao e os cabecalhos extras', async () => {
    handler = () => ({
      status: 200,
      payload: { choices: [{ message: { content: '{}' } }] },
    });

    await openAiProvider().complete({ system: 's', prompt: 'p', maxTokens: 10 });

    assert.equal(receivedHeaders.authorization, 'Bearer chave-de-teste');
    assert.equal(receivedHeaders['x-extra'], 'valor');
  });

  test('erro HTTP vira mensagem legivel com o corpo da resposta', async () => {
    // Limite diario estourado e o erro mais provavel num plano gratuito;
    // a mensagem precisa dizer isso, nao "undefined".
    handler = () => ({
      status: 429,
      payload: { error: { message: 'Rate limit reached for model' } },
    });

    await assert.rejects(
      () => openAiProvider().complete({ system: 's', prompt: 'p', maxTokens: 10 }),
      /429.*Rate limit reached/s,
    );
  });

  test('resposta que nao e JSON tambem vira erro claro', async () => {
    handler = () => ({ status: 200, payload: '<html>gateway timeout</html>' });

    await assert.rejects(
      () => openAiProvider().complete({ system: 's', prompt: 'p', maxTokens: 10 }),
      /nao e JSON/,
    );
  });

  test('resposta sem conteudo nao passa silenciosamente', async () => {
    handler = () => ({ status: 200, payload: { choices: [] } });

    await assert.rejects(
      () => openAiProvider().complete({ system: 's', prompt: 'p', maxTokens: 10 }),
      /nao devolveu texto/,
    );
  });
});

describe('provedor Gemini (padrao da aplicacao)', () => {
  test('monta a URL com modelo e chave, e envia a instrucao de sistema', async () => {
    handler = () => ({
      status: 200,
      payload: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
    });

    const text = await gemini.complete({
      system: 'voce e um roteirista',
      prompt: 'escreva algo',
      maxTokens: 500,
    });

    assert.equal(text, '{"ok":true}');
    assert.match(receivedUrl, /\/models\/gemini-de-teste:generateContent/);
    assert.match(receivedUrl, /key=chave-gemini-de-teste/);
    // O Gemini separa a instrucao de sistema do turno do usuario.
    assert.equal(received.systemInstruction.parts[0].text, 'voce e um roteirista');
    assert.equal(received.contents[0].parts[0].text, 'escreva algo');
    assert.equal(received.generationConfig.responseMimeType, 'application/json');
  });

  test('junta as partes que o Gemini devolve fatiadas', async () => {
    // O Gemini costuma quebrar a resposta em varias partes; ler so a primeira
    // truncaria o roteiro no meio.
    handler = () => ({
      status: 200,
      payload: {
        candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }],
      },
    });

    const text = await gemini.complete({ system: 's', prompt: 'p', maxTokens: 10 });
    assert.equal(text, '{"a":1}');
  });

  test('explica quando a resposta e bloqueada por filtro de conteudo', async () => {
    handler = () => ({
      status: 200,
      payload: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] },
    });

    await assert.rejects(
      () => gemini.complete({ system: 's', prompt: 'p', maxTokens: 10 }),
      /nao devolveu texto.*SAFETY/s,
    );
  });
});
