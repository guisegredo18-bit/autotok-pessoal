import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { queueHealth, type WorkflowRun } from '@/lib/github/repo';

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
