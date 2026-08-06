import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RENDER_ENGINE,
  RENDER_ENGINES,
  parseRenderEngine,
} from '@/lib/render-engine';

/**
 * A leitura deste campo era um ternario que so conhecia dois valores. Quando o
 * terceiro nasceu, escolher "Colab" e salvar devolvia "GitHub Actions" — sem
 * erro, sem aviso, como se a escolha nao valesse nada. O teste abaixo percorre
 * a lista inteira justamente para que acrescentar uma opcao e esquecer de
 * trata-la volte a ser impossivel.
 */

describe('parseRenderEngine', () => {
  test('aceita todos os motores oferecidos na tela', () => {
    for (const valor of Object.keys(RENDER_ENGINES)) {
      assert.equal(parseRenderEngine(valor), valor, `perdeu a escolha "${valor}"`);
    }
  });

  test('todo motor tem rotulo legivel', () => {
    // Sem isso daria para acrescentar um valor ao tipo e a tela mostrar vazio.
    for (const rotulo of Object.values(RENDER_ENGINES)) {
      assert.ok(rotulo.trim().length > 0);
    }
  });

  test('valor desconhecido cai no padrao em vez de gravar lixo', () => {
    assert.equal(parseRenderEngine('nuvem-magica'), DEFAULT_RENDER_ENGINE);
    assert.equal(parseRenderEngine(''), DEFAULT_RENDER_ENGINE);
    assert.equal(parseRenderEngine(null), DEFAULT_RENDER_ENGINE);
    assert.equal(parseRenderEngine(undefined), DEFAULT_RENDER_ENGINE);
  });

  test('o padrao e um motor que existe', () => {
    assert.ok(DEFAULT_RENDER_ENGINE in RENDER_ENGINES);
  });
});
