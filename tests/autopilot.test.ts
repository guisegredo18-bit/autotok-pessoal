import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  autopilotBlockers,
  budgetLeft,
  describeAutopilot,
  pickIdeas,
  waitMinutes,
  type AutopilotState,
} from '@/lib/pipeline/autopilot';
import { DEFAULT_SETTINGS, applyStored } from '@/lib/db/settings';

/**
 * O piloto publica sem ninguem olhando — entao o que decide se ele age precisa
 * ser testavel sem banco, sem rede e sem conta do TikTok. E o que estas
 * funcoes puras permitem: a trava e verificavel, e nao so descrita.
 */

describe('budgetLeft', () => {
  test('sobra o que o teto ainda comporta', () => {
    assert.equal(budgetLeft(3, 1), 2);
  });

  test('teto atingido nao deixa passar nem mais um', () => {
    assert.equal(budgetLeft(3, 3), 0);
  });

  test('baixar o teto no meio do dia nao vira divida', () => {
    // Cinco publicados hoje e teto novo de tres: o piloto para, e nao fica
    // "devendo" dois. Negativo aqui viraria numero de itens em outra conta.
    assert.equal(budgetLeft(3, 5), 0);
  });
});

describe('waitMinutes', () => {
  const agora = new Date('2026-08-11T12:00:00Z');

  test('sem publicacao anterior, publica ja', () => {
    // O intervalo e entre um post e o seguinte, nao uma espera na largada.
    assert.equal(waitMinutes(null, 90, agora), 0);
  });

  test('espera o que falta do intervalo', () => {
    const faz30min = new Date('2026-08-11T11:30:00Z');
    assert.equal(waitMinutes(faz30min, 90, agora), 60);
  });

  test('intervalo cumprido libera', () => {
    const faz2h = new Date('2026-08-11T10:00:00Z');
    assert.equal(waitMinutes(faz2h, 90, agora), 0);
  });

  test('intervalo zero desliga o espacamento', () => {
    const agorinha = new Date('2026-08-11T11:59:00Z');
    assert.equal(waitMinutes(agorinha, 0, agora), 0);
  });
});

describe('pickIdeas', () => {
  const ideias = [
    { id: 'fraca', score: 40 },
    { id: 'boa', score: 80 },
    { id: 'otima', score: 95 },
    { id: 'media', score: 72 },
  ];

  test('leva as melhores primeiro quando o teto corta o lote', () => {
    // O que fica de fora precisa ser o pior roteiro, e nao o que chegou
    // depois: com teto de 2, "media" nao pode passar na frente de "boa".
    const escolhidas = pickIdeas(ideias, { minScore: 70, budget: 2 });
    assert.deepEqual(escolhidas.map((i) => i.id), ['otima', 'boa']);
  });

  test('nota minima manda mesmo com espaco de sobra', () => {
    const escolhidas = pickIdeas(ideias, { minScore: 90, budget: 10 });
    assert.deepEqual(escolhidas.map((i) => i.id), ['otima']);
  });

  test('sem teto disponivel nao aprova nada', () => {
    assert.deepEqual(pickIdeas(ideias, { minScore: 0, budget: 0 }), []);
  });

  test('nota na fronteira entra', () => {
    assert.deepEqual(
      pickIdeas([{ id: 'x', score: 75 }], { minScore: 75, budget: 1 }).map((i) => i.id),
      ['x'],
    );
  });
});

describe('padrao do piloto', () => {
  test('nasce desligado', () => {
    // Quem instalou pediu um painel de aprovacao. Ligar sozinho o que publica
    // sozinho seria decidir no lugar da pessoa.
    assert.equal(DEFAULT_SETTINGS.autoApprove, false);
    assert.equal(DEFAULT_SETTINGS.autoPublish, false);
    assert.equal(describeAutopilot(DEFAULT_SETTINGS), 'desligado');
  });

  test('configuracao gravada antes do piloto existir continua desligada', () => {
    // `getSettings` mescla a linha antiga com o padrao. Se o padrao fosse
    // ligado, uma atualizacao do app comecaria a publicar na conta de quem
    // nunca pediu isso.
    const antiga = applyStored({ niche: 'receitas rapidas', minScore: 70 });
    assert.equal(antiga.autoApprove, false);
    assert.equal(antiga.autoPublish, false);
    assert.equal(antiga.autoMinScore, 75);
  });

  test('descricao diz o que esta ligado', () => {
    const ligado = applyStored({ autoApprove: true, autoPublish: true, videosPerDay: 3 });
    const texto = describeAutopilot(ligado);
    assert.match(texto, /nota 75\+/);
    assert.match(texto, /90 min/);
    assert.match(texto, /3\/dia/);
  });

  test('so gravar sozinho nao promete publicar', () => {
    const texto = describeAutopilot(applyStored({ autoApprove: true }));
    assert.doesNotMatch(texto, /publica/);
  });
});

describe('autopilotBlockers', () => {
  const agora = new Date('2026-08-11T12:00:00Z');

  /** Um piloto ligado e saudavel: nada deve ser acusado neste estado. */
  function saudavel(patch: Partial<AutopilotState> = {}): AutopilotState {
    return {
      settings: applyStored({ autoApprove: true, autoPublish: true }),
      connected: true,
      canPostPublic: true,
      pendingIdeas: 4,
      pendingAboveScore: 2,
      lastPublishedAt: new Date('2026-08-11T09:00:00Z'),
      now: agora,
      ...patch,
    };
  }

  test('piloto saudavel nao inventa problema', () => {
    assert.deepEqual(autopilotBlockers(saudavel()), []);
  });

  test('piloto desligado nao gera aviso nenhum', () => {
    // Quem aprova na mao ja esta olhando a tela — nao precisa ser avisado do
    // que ele mesmo esta fazendo.
    const desligado = saudavel({
      settings: DEFAULT_SETTINGS,
      connected: false,
      canPostPublic: false,
      pendingAboveScore: 0,
    });
    assert.deepEqual(autopilotBlockers(desligado), []);
  });

  test('sem auditoria do TikTok, avisa que ninguem vai ver', () => {
    // Este e o fracasso caro: os jobs ficam verdes, os videos saem, e o canal
    // nao cresce um seguidor porque tudo chegou privado.
    const [aviso] = autopilotBlockers(saudavel({ canPostPublic: false }));
    assert.equal(aviso.severity, 'alta');
    assert.match(aviso.label, /privado/i);
    assert.match(aviso.hint, /auditoria/i);
  });

  test('sem conta conectada, avisa antes de qualquer outra coisa', () => {
    const avisos = autopilotBlockers(saudavel({ connected: false, canPostPublic: false }));
    assert.equal(avisos[0].severity, 'alta');
    assert.match(avisos[0].label, /conta do TikTok/i);
    // Nao acusamos "vai sair privado" de quem nem conta tem: seriam dois
    // avisos para um problema so, e o segundo esconderia o primeiro.
    assert.equal(avisos.length, 1);
  });

  test('nota alta demais aparece com o numero que a explica', () => {
    const [aviso] = autopilotBlockers(
      saudavel({
        settings: applyStored({ autoApprove: true, autoMinScore: 95 }),
        pendingIdeas: 7,
        pendingAboveScore: 0,
      }),
    );
    assert.match(aviso.label, /7 ideia/);
    assert.match(aviso.label, /95/);
  });

  test('fila de ideias vazia nao e problema', () => {
    // Zero ideias esperando e o estado normal logo depois de uma rodada que
    // gravou todas. Acusar isso seria alarme em dia de funcionamento.
    assert.deepEqual(autopilotBlockers(saudavel({ pendingIdeas: 0, pendingAboveScore: 0 })), []);
  });

  test('silencio longo vira aviso', () => {
    const [aviso] = autopilotBlockers(
      saudavel({ lastPublishedAt: new Date('2026-08-08T12:00:00Z') }),
    );
    assert.match(aviso.label, /nao publica ha 3 dia/);
  });

  test('quem nunca publicou nao e acusado de ter parado', () => {
    // Sem data nao da para distinguir "parou" de "ligou agora", e um alarme no
    // primeiro dia ensina a ignorar o alarme.
    assert.deepEqual(autopilotBlockers(saudavel({ lastPublishedAt: null })), []);
  });

  test('problema grave vem antes do menos grave', () => {
    const avisos = autopilotBlockers(
      saudavel({
        canPostPublic: false,
        pendingIdeas: 3,
        pendingAboveScore: 0,
      }),
    );
    assert.equal(avisos[0].severity, 'alta');
    assert.equal(avisos[1].severity, 'media');
  });
});
