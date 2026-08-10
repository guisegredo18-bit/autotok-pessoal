import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { amzDate, deriveSigningKey, signRequest } from '@/lib/amazon/sign';

/**
 * A assinatura ou esta exata ou a Amazon devolve "signature does not match" —
 * e essa mensagem nao diz qual dos passos saiu torto. Por isso a derivacao da
 * chave e conferida contra o vetor publicado pela AWS, e nao contra um valor
 * que esta mesma implementacao produziu (o que so provaria que ela e
 * consistente consigo mesma).
 */

describe('deriveSigningKey', () => {
  test('bate com o vetor de teste publicado pela AWS', () => {
    // Vetor da documentacao do Signature Version 4 (secret de exemplo da
    // propria AWS, servico iam, 30/08/2015, us-east-1).
    const key = deriveSigningKey(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20150830',
      'us-east-1',
      'iam',
    );

    assert.equal(
      key.toString('hex'),
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });

  test('regiao diferente gera chave diferente', () => {
    const a = deriveSigningKey('segredo', '20260810', 'us-east-1');
    const b = deriveSigningKey('segredo', '20260810', 'eu-west-1');
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });
});

describe('amzDate', () => {
  test('sem separadores, com Z no fim', () => {
    assert.equal(amzDate(new Date('2026-08-10T10:30:45.123Z')), '20260810T103045Z');
  });
});

describe('signRequest', () => {
  const base = {
    accessKey: 'AKIAEXEMPLO',
    secretKey: 'segredo-de-teste',
    region: 'us-east-1',
    host: 'webservices.amazon.com.br',
    path: '/paapi5/searchitems',
    target: 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    payload: '{"Keywords":"fone"}',
    now: new Date('2026-08-10T10:30:45.000Z'),
  };

  test('monta os headers que a PA-API exige', () => {
    const headers = signRequest(base);

    assert.equal(headers['content-encoding'], 'amz-1.0');
    assert.equal(headers.host, 'webservices.amazon.com.br');
    assert.equal(headers['x-amz-date'], '20260810T103045Z');
    assert.equal(headers['x-amz-target'], base.target);
    assert.match(headers['content-type'], /application\/json/);
  });

  test('o Authorization traz credencial, escopo e headers assinados', () => {
    const { Authorization } = signRequest(base);

    assert.match(Authorization, /^AWS4-HMAC-SHA256 /);
    assert.match(
      Authorization,
      /Credential=AKIAEXEMPLO\/20260810\/us-east-1\/ProductAdvertisingAPI\/aws4_request/,
    );
    // A ordem alfabetica dos headers assinados faz parte da assinatura: fora
    // de ordem, a Amazon recusa mesmo com a chave certa.
    assert.match(
      Authorization,
      /SignedHeaders=content-encoding;host;x-amz-date;x-amz-target/,
    );
    assert.match(Authorization, /Signature=[0-9a-f]{64}$/);
  });

  test('mesma entrada, mesma assinatura', () => {
    assert.equal(signRequest(base).Authorization, signRequest(base).Authorization);
  });

  test('qualquer parte da requisicao muda a assinatura', () => {
    // A assinatura cobre corpo, caminho, host e momento. Se mudar o corpo e a
    // assinatura continuar igual, ela nao esta protegendo nada — e a Amazon
    // recusaria toda chamada com corpo diferente do primeiro.
    const original = signRequest(base).Authorization;

    assert.notEqual(signRequest({ ...base, payload: '{"Keywords":"airfryer"}' }).Authorization, original);
    assert.notEqual(signRequest({ ...base, path: '/paapi5/getitems' }).Authorization, original);
    assert.notEqual(signRequest({ ...base, host: 'webservices.amazon.com' }).Authorization, original);
    assert.notEqual(
      signRequest({ ...base, now: new Date('2026-08-10T10:30:46.000Z') }).Authorization,
      original,
    );
  });
});
