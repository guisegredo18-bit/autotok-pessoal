import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppUrl, resolveTikTokRedirect } from '@/lib/env';

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

  test('sem nada configurado, assume desenvolvimento local', () => {
    assert.equal(resolveAppUrl({}), 'http://localhost:3000');
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
