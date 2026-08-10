import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * As credenciais da Hotmart e da Amazon ficam no banco para poderem ser
 * registradas pelo celular, dentro do proprio aplicativo. Guardar isso em
 * texto puro seria trocar comodidade por um vazamento inteiro de credenciais —
 * entao estes testes existem para que a cifragem nao possa ser quebrada em
 * silencio por uma mudanca futura.
 */

let encrypt: typeof import('@/lib/secrets').encrypt;
let decrypt: typeof import('@/lib/secrets').decrypt;
let SENSITIVE_FIELDS: typeof import('@/lib/secrets').SENSITIVE_FIELDS;
let SECRET_FIELDS: typeof import('@/lib/secrets').SECRET_FIELDS;
let FIELD_ENV_VAR: typeof import('@/lib/secrets').FIELD_ENV_VAR;
let definedInEnvironment: typeof import('@/lib/secrets').definedInEnvironment;

before(async () => {
  process.env.AUTH_SECRET = 'segredo-de-teste-suficientemente-longo';
  const mod = await import('@/lib/secrets');
  encrypt = mod.encrypt;
  decrypt = mod.decrypt;
  SENSITIVE_FIELDS = mod.SENSITIVE_FIELDS;
  SECRET_FIELDS = mod.SECRET_FIELDS;
  FIELD_ENV_VAR = mod.FIELD_ENV_VAR;
  definedInEnvironment = mod.definedInEnvironment;
});

describe('cifragem das chaves', () => {
  test('ida e volta devolve o valor original', () => {
    const original = 'AKIAEXEMPLO/chave-de-api-qualquer';
    assert.equal(decrypt(encrypt(original)), original);
  });

  test('o texto cifrado nao contem o valor original', () => {
    // E o ponto central: quem ler o banco sem o AUTH_SECRET nao ve a chave.
    const original = 'client-secret-super-secreto';
    assert.ok(!encrypt(original).includes(original));
  });

  test('cifrar o mesmo valor duas vezes da resultados diferentes', () => {
    // IV aleatorio por valor: sem isso, dava para saber que dois campos
    // guardam a mesma chave so olhando o banco.
    assert.notEqual(encrypt('mesma-chave'), encrypt('mesma-chave'));
  });

  test('valor adulterado nao e decifrado', () => {
    // O tag do AES-GCM detecta a alteracao. Sem essa checagem, um banco
    // comprometido poderia trocar a chave por outra sem ninguem notar.
    //
    // A adulteracao e feita byte a byte, e nao concatenando texto no base64:
    // o decodificador de base64 e tolerante e descarta caracteres que nao
    // fecham um grupo, entao um "sufixo" pode nao mudar byte nenhum — o teste
    // passaria sem ter testado coisa alguma.
    const payload = encrypt('chave-verdadeira');
    const [iv, tag, data] = payload.split('.');

    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 0xff;
    assert.equal(decrypt([iv, tag, bytes.toString('base64')].join('.')), null);

    // Adulterar o proprio tag tambem precisa ser recusado.
    const tagBytes = Buffer.from(tag, 'base64');
    tagBytes[0] ^= 0xff;
    assert.equal(decrypt([iv, tagBytes.toString('base64'), data].join('.')), null);
  });

  test('lixo devolve null em vez de lancar', () => {
    // Um AUTH_SECRET trocado deixa todos os valores ilegiveis; a tela precisa
    // continuar abrindo para a pessoa poder preencher tudo de novo.
    assert.equal(decrypt('nao-e-um-payload'), null);
    assert.equal(decrypt(''), null);
  });
});

describe('registro dos campos', () => {
  test('todo campo tem uma variavel de ambiente correspondente', () => {
    // Sem isso, um campo novo seria salvo no banco e nunca lido de volta para
    // dentro do `env` — some sem erro nenhum.
    for (const field of SECRET_FIELDS) {
      assert.ok(FIELD_ENV_VAR[field], `falta a variavel de ambiente de ${field}`);
    }
  });

  test('todo campo sensivel existe na lista de campos', () => {
    for (const field of SENSITIVE_FIELDS) {
      assert.ok(SECRET_FIELDS.includes(field), `${field} nao esta em SECRET_FIELDS`);
    }
  });

  test('os segredos de verdade estao marcados como sensiveis', () => {
    // Um segredo fora desta lista voltaria preenchido para o navegador na tela
    // de configuracoes — exatamente o que a cifragem no banco evita.
    for (const field of ['hotmartClientSecret', 'amazonSecretKey', 'hotmartBasic'] as const) {
      assert.ok(SENSITIVE_FIELDS.includes(field), `${field} deveria ser sensivel`);
    }
  });

  test('campos nao secretos podem voltar para a tela', () => {
    // Tag de afiliado e marketplace aparecem no proprio link do produto: nao
    // ha o que esconder, e mascarar atrapalharia a conferencia.
    assert.ok(!SENSITIVE_FIELDS.includes('amazonPartnerTag'));
    assert.ok(!SENSITIVE_FIELDS.includes('amazonMarketplace'));
  });
});

describe('definedInEnvironment', () => {
  test('distingue definido de vazio', () => {
    // A distincao existe para o ambiente vencer o banco so quando alguem de
    // fato definiu a variavel — um valor vazio nao pode sobrepor a chave que
    // voce registrou na tela.
    assert.equal(definedInEnvironment('amazonAccessKey', { AMAZON_ACCESS_KEY: 'AKIA' }), true);
    assert.equal(definedInEnvironment('amazonAccessKey', { AMAZON_ACCESS_KEY: '' }), false);
    assert.equal(definedInEnvironment('amazonAccessKey', { AMAZON_ACCESS_KEY: '   ' }), false);
    assert.equal(definedInEnvironment('amazonAccessKey', {}), false);
  });
});
