import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, applyStored, type AppSettings } from '@/lib/db/settings';

/**
 * `getSettings` devolve `{ ...DEFAULT_SETTINGS, ...linha }` para que campos
 * novos apareçam sem migration. O preco disso e que um valor gravado errado no
 * passado sobrevive para sempre — e foi o que aconteceu com `renderEngine`,
 * gravado como "github" por um formulario que so sabia ler duas opcoes.
 *
 * Distinguir "valor que alguem escolheu" de "valor que apareceu ali" e o que
 * estes testes protegem: sem essa distincao, corrigir o padrao nao alcanca
 * justamente quem foi mordido pelo bug.
 */
const merge = applyStored;

describe('AppSettings', () => {
  test('linha salva antes do campo existir passa a renderizar sozinha', () => {
    // Uma configuracao real gravada quando `renderEngine` nao existia. O padrao
    // era `github` e virou `aqui` de proposito: quem tem uma linha antiga so
    // conheceu o mundo em que o Actions renderizava, e e justamente esse mundo
    // que pode ter parado de entregar maquina sem aviso. Cair no motor que nao
    // depende de ninguem e o comportamento seguro.
    const antiga = {
      niche: 'receitas rapidas',
      template: 'viral' as const,
      minScore: 70,
    };
    assert.equal(merge(antiga).renderEngine, 'aqui');
  });

  test('escolha de gente ganha do padrao', () => {
    assert.equal(
      merge({ renderEngine: 'manual', renderEngineChosen: true }).renderEngine,
      'manual',
    );
    // Inclusive quando a escolha e voltar para o GitHub Actions.
    assert.equal(
      merge({ renderEngine: 'github', renderEngineChosen: true }).renderEngine,
      'github',
    );
  });

  test('motor gravado sem escolha explicita e descartado', () => {
    // O formulario antigo gravava "github" para qualquer opcao selecionada.
    // Obedecer a esse valor prenderia a pessoa no motor que nao entrega
    // maquina — e foi exatamente o que aconteceu.
    assert.equal(merge({ renderEngine: 'github' }).renderEngine, 'aqui');
    assert.equal(merge({ renderEngine: 'manual' }).renderEngine, 'aqui');
  });

  test('mesclar preserva os campos que a linha nao traz', () => {
    const merged = merge({ renderEngine: 'aqui', renderEngineChosen: true });
    assert.equal(merged.niche, DEFAULT_SETTINGS.niche);
    assert.equal(merged.targetDuration, DEFAULT_SETTINGS.targetDuration);
  });
});
