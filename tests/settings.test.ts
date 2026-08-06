import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/db/settings';

/**
 * `getSettings` devolve `{ ...DEFAULT_SETTINGS, ...linha }` para que campos
 * novos apareçam sem migration. O risco disso e um campo novo cujo padrao
 * errado muda o comportamento de quem ja usava o app — e `renderEngine` e
 * exatamente esse caso: se uma linha antiga voltasse com o campo indefinido,
 * `usaGithub()` leria diferente de "github" e o painel passaria a renderizar
 * no proprio processo, onde nao ha ffmpeg. Estes testes fixam a mesclagem.
 */
function merge(row: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...row };
}

describe('AppSettings', () => {
  test('linha salva antes do campo existir continua no GitHub Actions', () => {
    // Uma configuracao real gravada quando `renderEngine` nao existia.
    const antiga = {
      niche: 'receitas rapidas',
      template: 'viral' as const,
      minScore: 70,
    };
    assert.equal(merge(antiga).renderEngine, 'github');
  });

  test('a escolha salva ganha do padrao', () => {
    assert.equal(merge({ renderEngine: 'aqui' }).renderEngine, 'aqui');
  });

  test('mesclar preserva os campos que a linha nao traz', () => {
    const merged = merge({ renderEngine: 'aqui' });
    assert.equal(merged.niche, DEFAULT_SETTINGS.niche);
    assert.equal(merged.targetDuration, DEFAULT_SETTINGS.targetDuration);
  });
});
