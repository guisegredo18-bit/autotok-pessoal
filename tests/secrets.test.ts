import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * As chaves de integracao (Gemini, Pexels, TikTok, R2, GitHub) ficam no banco
 * para poderem ser configuradas pelo celular. Guardar isso em texto puro seria
 * trocar comodidade por um vazamento inteiro de credenciais — entao estes
 * testes existem para que a cifragem nao possa ser quebrada em silencio por
 * uma mudanca futura.
 */

let encrypt: typeof import('@/lib/secrets').encrypt;
let decrypt: typeof import('@/lib/secrets').decrypt;
let SENSITIVE_FIELDS: typeof import('@/lib/secrets').SENSITIVE_FIELDS;
let SECRET_FIELDS: typeof import('@/lib/secrets').SECRET_FIELDS;

before(async () => {
  process.env.AUTH_SECRET = 'segredo-de-teste-suficientemente-longo';
  const mod = await import('@/lib/secrets');
  encrypt = mod.encrypt;
  decrypt = mod.decrypt;
  SENSITIVE_FIELDS = mod.SENSITIVE_FIELDS;
  SECRET_FIELDS = mod.SECRET_FIELDS;
});

describe('cifragem das chaves', () => {
  test('ida e volta devolve o valor original', () => {
    const original = 'AIzaSy-uma-chave-de-api-qualquer';
    assert.equal(decrypt(encrypt(original)), original);
  });

  test('o texto cifrado nao contem o valor original', () => {
    // E o ponto central: quem ler o banco sem o AUTH_SECRET nao ve a chave.
    const original = 'chave-super-secreta';
    assert.ok(!encrypt(original).includes(original));
  });

  test('cifrar o mesmo valor duas vezes da resultados diferentes', () => {
    // IV aleatorio por valor: sem isso, dava para saber que dois campos
    // guardam a mesma chave so olhando o banco.
    const a = encrypt('mesmo-valor');
    const b = encrypt('mesmo-valor');
    assert.notEqual(a, b);
    assert.equal(decrypt(a), decrypt(b));
  });

  test('preserva acentos e caracteres especiais', () => {
    const original = 'senha-com-acento-ção-e-símbolo-±§';
    assert.equal(decrypt(encrypt(original)), original);
  });

  test('valor adulterado e recusado, nao devolvido errado', () => {
    // O tag de autenticacao do GCM detecta a alteracao; sem essa checagem,
    // um banco comprometido poderia trocar uma chave por outra.
    const payload = encrypt('valor-legitimo');
    const [iv, tag, data] = payload.split('.');
    const mexido = [iv, tag, Buffer.from('outra-coisa').toString('base64')].join('.');
    assert.equal(decrypt(mexido), null);
  });

  test('payload malformado devolve null em vez de derrubar a aplicacao', () => {
    // Acontece quando o AUTH_SECRET muda: a tela mostra o campo vazio para
    // ser preenchido de novo, em vez de o painel inteiro quebrar.
    assert.equal(decrypt('lixo'), null);
    assert.equal(decrypt(''), null);
    assert.equal(decrypt('a.b.c'), null);
  });
});

describe('classificacao dos campos', () => {
  test('toda chave de API esta marcada como sensivel', () => {
    // Campo sensivel nunca volta preenchido para a tela. Esquecer de marcar
    // um significa expor a credencial no HTML da pagina.
    const deveriamSerSensiveis = SECRET_FIELDS.filter(
      (f) => /ApiKey$|Secret$|Token$/i.test(f),
    );
    for (const field of deveriamSerSensiveis) {
      assert.ok(
        SENSITIVE_FIELDS.includes(field),
        `o campo "${field}" parece uma credencial mas nao esta em SENSITIVE_FIELDS`,
      );
    }
  });

  test('campos de configuracao comum nao sao tratados como sensiveis', () => {
    for (const field of ['aiProvider', 'geminiModel', 'githubRepo', 's3Bucket'] as const) {
      assert.ok(!SENSITIVE_FIELDS.includes(field));
    }
  });
});
