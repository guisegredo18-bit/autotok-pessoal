import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSpace, resolveAppUrl, resolveTikTokRedirect } from '@/lib/env';

/**
 * O endereco publico da aplicacao decide para onde o TikTok devolve o login e
 * para onde apontam as notificacoes. Errar isso quebra a instalacao de quem
 * fez tudo pelo celular — e quebra em silencio, so aparecendo no momento de
 * conectar a conta.
 */

describe('endereco da aplicacao', () => {
  test('usa APP_URL quando definida', () => {
    assert.equal(resolveAppUrl({ APP_URL: 'https://meuapp.com' }), 'https://meuapp.com');
  });

  test('remove a barra final para nao gerar URL com barra dupla', () => {
    assert.equal(resolveAppUrl({ APP_URL: 'https://meuapp.com/' }), 'https://meuapp.com');
  });

  test('cai para o dominio de producao da Vercel quando APP_URL falta', () => {
    // E o caso de quem instalou pelo celular: a URL so existe apos o deploy.
    assert.equal(
      resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'autotok.vercel.app' }),
      'https://autotok.vercel.app',
    );
  });

  test('aceita tambem a URL do deploy quando nao ha dominio de producao', () => {
    assert.equal(
      resolveAppUrl({ VERCEL_URL: 'autotok-abc123.vercel.app' }),
      'https://autotok-abc123.vercel.app',
    );
  });

  test('prefere o dominio de producao a URL do deploy', () => {
    // A URL de deploy muda a cada build; a de producao e estavel, e e ela que
    // precisa estar cadastrada no portal do TikTok.
    assert.equal(
      resolveAppUrl({
        VERCEL_PROJECT_PRODUCTION_URL: 'autotok.vercel.app',
        VERCEL_URL: 'autotok-abc123.vercel.app',
      }),
      'https://autotok.vercel.app',
    );
  });

  test('APP_URL tem prioridade sobre os dominios da Vercel', () => {
    assert.equal(
      resolveAppUrl({
        APP_URL: 'https://dominio-proprio.com',
        VERCEL_PROJECT_PRODUCTION_URL: 'autotok.vercel.app',
      }),
      'https://dominio-proprio.com',
    );
  });

  test('deriva do dominio do Space no Hugging Face', () => {
    // Poupa um secret na instalacao pelo celular: o Hugging Face ja injeta o
    // dominio, entao ninguem precisa digita-lo a mao.
    assert.equal(
      resolveAppUrl({ SPACE_HOST: 'usuario-autotok.hf.space' }),
      'https://usuario-autotok.hf.space',
    );
  });

  test('APP_URL tem prioridade sobre o dominio do Space', () => {
    assert.equal(
      resolveAppUrl({
        APP_URL: 'https://dominio-proprio.com',
        SPACE_HOST: 'usuario-autotok.hf.space',
      }),
      'https://dominio-proprio.com',
    );
  });

  test('sem nada configurado, assume desenvolvimento local', () => {
    assert.equal(resolveAppUrl({}), 'http://localhost:3000');
  });
});

describe('isSpace', () => {
  test('reconhece o Space por qualquer uma das duas variaveis', () => {
    assert.equal(isSpace({ SPACE_ID: 'usuario/autotok' }), true);
    assert.equal(isSpace({ SPACE_HOST: 'usuario-autotok.hf.space' }), true);
  });

  test('Vercel e maquina local nao sao Space', () => {
    // Importa: e este `false` que mantem a Vercel despachando para o GitHub
    // em vez de tentar renderizar onde nao ha ffmpeg.
    assert.equal(isSpace({ VERCEL_URL: 'autotok.vercel.app' }), false);
    assert.equal(isSpace({}), false);
  });
});

describe('redirect do TikTok', () => {
  test('deriva do endereco da aplicacao', () => {
    assert.equal(
      resolveTikTokRedirect('https://meuapp.com', {}),
      'https://meuapp.com/api/tiktok/callback',
    );
  });

  test('pode ser sobrescrito, porque precisa bater com o portal do TikTok', () => {
    assert.equal(
      resolveTikTokRedirect('https://meuapp.com', {
        TIKTOK_REDIRECT_URI: 'https://outro.com/callback',
      }),
      'https://outro.com/callback',
    );
  });
});
