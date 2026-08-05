import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaption } from '@/lib/ai/script';
import { pickPrivacy } from '@/lib/pipeline/publish';
import { safeLocalPath } from '@/lib/storage';

describe('buildCaption', () => {
  test('junta legenda, assinatura e hashtags', () => {
    const caption = buildCaption('Testa isso hoje', ['dicas', 'brasil'], 'Segue pra mais!');
    assert.match(caption, /Testa isso hoje/);
    assert.match(caption, /Segue pra mais!/);
    assert.match(caption, /#dicas #brasil/);
  });

  test('funciona sem assinatura', () => {
    const caption = buildCaption('Só a legenda', ['x'], '');
    assert.equal(caption, 'Só a legenda\n\n#x');
  });

  test('respeita o limite de 2200 caracteres do TikTok', () => {
    // Estourar o limite faz o TikTok recusar o post inteiro.
    const caption = buildCaption('a'.repeat(3000), ['tag'], 'assinatura');
    assert.ok(caption.length <= 2200, `legenda com ${caption.length} caracteres`);
  });
});

describe('pickPrivacy', () => {
  test('usa a privacidade preferida quando a conta oferece', () => {
    const options = ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'];
    assert.equal(pickPrivacy(options, 'SELF_ONLY'), 'SELF_ONLY');
  });

  test('sobe para publico quando a preferida nao esta disponivel', () => {
    const options = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS'];
    assert.equal(pickPrivacy(options, 'SELF_ONLY'), 'PUBLIC_TO_EVERYONE');
  });

  test('cai para privado quando a conta nao informa nenhuma opcao', () => {
    // Sem informacao, o padrao seguro e o menos exposto: um post publico
    // indesejado nao tem desfazer.
    assert.equal(pickPrivacy([], 'PUBLIC_TO_EVERYONE'), 'SELF_ONLY');
  });

  test('usa a primeira opcao valida quando nao ha publica nem preferida', () => {
    assert.equal(pickPrivacy(['MUTUAL_FOLLOW_FRIENDS'], 'SELF_ONLY'), 'MUTUAL_FOLLOW_FRIENDS');
  });
});

describe('safeLocalPath', () => {
  test('aceita chaves normais de midia', () => {
    assert.match(safeLocalPath('videos/abc-123.mp4'), /data\/media\/videos\/abc-123\.mp4$/);
  });

  test('bloqueia travessia de diretorio', () => {
    // A rota /api/media recebe o caminho da URL; sem isso daria para ler
    // qualquer arquivo do servidor, inclusive o .env.
    for (const attack of ['../../.env', 'videos/../../../etc/passwd', '../../../root/.ssh/id_rsa']) {
      assert.throws(() => safeLocalPath(attack), /invalido/i, `deixou passar: ${attack}`);
    }
  });

  test('bloqueia caminho absoluto', () => {
    assert.throws(() => safeLocalPath('/etc/passwd'), /invalido/i);
  });
});
