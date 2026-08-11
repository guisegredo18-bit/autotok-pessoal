import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { queueHealth, type WorkflowRun } from '@/lib/github/repo';
import * as repo from '@/lib/github/repo';

/**
 * Franquia de minutos esgotada nao gera erro: o job fica em "queued"
 * esperando uma maquina que nunca chega. Sem detectar isso, o painel diz
 * "renderizando..." indefinidamente e a unica pista fica na pagina de
 * faturamento do GitHub — que ninguem abre pelo celular.
 */

function run(status: string, minutesAgo: number): WorkflowRun {
  return {
    name: 'Renderizar video',
    status,
    conclusion: null,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    url: '',
  };
}

describe('queueHealth', () => {
  test('fila vazia nao acusa problema', () => {
    assert.deepEqual(queueHealth([]), { waiting: 0, oldestMinutes: 0, stuck: false });
  });

  test('execucoes concluidas nao contam como espera', () => {
    const runs: WorkflowRun[] = [
      { ...run('completed', 30), conclusion: 'success' },
      { ...run('completed', 40), conclusion: 'failure' },
    ];
    assert.equal(queueHealth(runs).waiting, 0);
  });

  test('espera curta e normal — job pode so estar comecando', () => {
    const health = queueHealth([run('queued', 1)]);
    assert.equal(health.waiting, 1);
    assert.equal(health.stuck, false);
  });

  test('espera longa acusa fila travada', () => {
    const health = queueHealth([run('queued', 12)]);
    assert.equal(health.stuck, true);
    assert.equal(health.oldestMinutes, 12);
  });

  test('conta pending junto com queued', () => {
    // O GitHub usa os dois nomes para o mesmo estado de espera.
    const health = queueHealth([run('queued', 8), run('pending', 3), run('completed', 1)]);
    assert.equal(health.waiting, 2);
    assert.equal(health.stuck, true);
  });

  test('usa a espera do mais antigo, nao a do ultimo disparo', () => {
    // Reenviar cria um job novo; olhar so para ele esconderia que o primeiro
    // esta parado ha meia hora.
    const health = queueHealth([run('queued', 1), run('queued', 30)]);
    assert.equal(health.oldestMinutes, 30);
    assert.equal(health.stuck, true);
  });
});

describe('runnerCantReadKeys', () => {
  /**
   * O sintoma engana: o painel funciona, o runner do Actions falha dizendo que
   * falta chave, e a conclusao natural — errada — e que alguem esqueceu de
   * preencher. A causa real e o `AUTH_SECRET` diferente nos dois lados, que
   * impede o runner de decifrar as chaves que estao la.
   */
  const tem = (nomes: string[]) => (nome: string) => nomes.includes(nome);

  const falhaDeChave = (msg: string) => ({ status: 'failed', message: msg });

  test('chave que o painel tem e o runner nao le acusa o segredo', () => {
    const jobs = [
      falhaDeChave(
        'Configuracao faltando: geminiApiKey. Preencha em Configuracoes > Chaves no painel.',
      ),
    ];
    assert.equal(repo.runnerCantReadKeys(jobs, tem(['geminiApiKey'])), true);
  });

  test('chave que o painel tambem nao tem e so falta preencher', () => {
    // Acusar o AUTH_SECRET aqui mandaria a pessoa mexer no GitHub quando o
    // conserto e digitar a chave — o tipo de pista errada que custa dias.
    const jobs = [falhaDeChave('Configuracao faltando: pexelsApiKey.')];
    assert.equal(repo.runnerCantReadKeys(jobs, tem(['geminiApiKey'])), false);
  });

  test('varias chaves: basta uma faltar no painel para nao acusar', () => {
    const jobs = [falhaDeChave('Configuracao faltando: geminiApiKey, pexelsApiKey.')];
    assert.equal(repo.runnerCantReadKeys(jobs, tem(['geminiApiKey'])), false);
    assert.equal(repo.runnerCantReadKeys(jobs, tem(['geminiApiKey', 'pexelsApiKey'])), true);
  });

  test('job que deu certo nao acusa nada', () => {
    const jobs = [{ status: 'done', message: 'ok' }];
    assert.equal(repo.runnerCantReadKeys(jobs, tem(['geminiApiKey'])), false);
  });

  test('falha por outro motivo nao vira diagnostico de segredo', () => {
    const jobs = [falhaDeChave('O modelo nao devolveu um roteiro valido em duas tentativas.')];
    assert.equal(repo.runnerCantReadKeys(jobs, () => true), false);
  });

  test('lista vazia nao acusa', () => {
    assert.equal(repo.runnerCantReadKeys([], () => true), false);
  });
});
