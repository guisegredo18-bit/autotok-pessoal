import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { colabUrl, COLAB_NOTEBOOK } from '@/lib/colab';

/**
 * O link do Colab e a unica saida quando o GitHub Actions para de entregar
 * maquina. Se ele apontar para o lugar errado, a pessoa cai numa pagina de
 * "notebook not found" sem nenhuma pista do que fazer — e nesse ponto ja nao
 * ha mais nenhum caminho para renderizar.
 */

describe('colabUrl', () => {
  test('monta o endereco a partir do repositorio e do branch', () => {
    assert.equal(
      colabUrl('guisegredo18-bit/autotok-pessoal', 'main'),
      `https://colab.research.google.com/github/guisegredo18-bit/autotok-pessoal/blob/main/${COLAB_NOTEBOOK}`,
    );
  });

  test('branch com barra continua inteiro no caminho', () => {
    // O branch de trabalho tem barras. Escapa-las quebraria o link: o Colab
    // espera o ref cru depois de /blob/.
    const url = colabUrl('dono/repo', 'claude/tiktok-trends-analysis-app-pihsab');
    assert.ok(url?.includes('/blob/claude/tiktok-trends-analysis-app-pihsab/'));
  });

  test('sem branch conhecido, cai no HEAD do repositorio', () => {
    // Fora da Vercel nao existe VERCEL_GIT_COMMIT_REF; ainda assim o link
    // precisa levar a algum lugar valido.
    assert.ok(colabUrl('dono/repo', '')?.includes('/blob/HEAD/'));
  });

  test('sem repositorio configurado nao inventa um link', () => {
    // Melhor a tela dizer "configure o repositorio" do que oferecer um botao
    // que leva a lugar nenhum.
    assert.equal(colabUrl('', 'main'), null);
  });

  test('aponta para o caderno que existe no repositorio', () => {
    assert.equal(COLAB_NOTEBOOK, 'deploy/colab/renderizar.ipynb');
  });
});
