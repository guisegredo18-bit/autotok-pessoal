import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findList, describeResponse, toTrend } from '@/lib/trends/creative-center';

/**
 * O Creative Center nao tem contrato publico e ja mudou de formato em
 * producao — foi assim que a coleta parou de funcionar. Estes testes fixam o
 * comportamento tolerante: aceitar os formatos ja vistos, sobreviver a
 * renomeacoes, e explicar o que voltou quando nada serve.
 */

describe('findList', () => {
  test('acha a lista nos nomes conhecidos', () => {
    for (const key of ['list', 'hashtag_list', 'sound_list', 'song_list', 'items', 'records']) {
      const json = { data: { [key]: [{ a: 1 }] } };
      assert.deepEqual(findList(json), [{ a: 1 }], `falhou para "${key}"`);
    }
  });

  test('acha uma lista com nome novo, ainda desconhecido', () => {
    // E o que evita a coleta morrer so porque o campo foi renomeado.
    const json = { data: { trending_hashtags_v2: [{ hashtag_name: 'x' }] } };
    assert.deepEqual(findList(json), [{ hashtag_name: 'x' }]);
  });

  test('aceita a lista na raiz, sem o envelope data', () => {
    assert.deepEqual(findList({ list: [{ a: 1 }] }), [{ a: 1 }]);
  });

  test('ignora listas vazias e de valores simples', () => {
    assert.equal(findList({ data: { list: [] } }), null);
    assert.equal(findList({ data: { codes: [1, 2, 3] } }), null);
  });

  test('devolve null quando nao ha nada aproveitavel', () => {
    assert.equal(findList({ data: { message: 'ok' } }), null);
    assert.equal(findList(null), null);
    assert.equal(findList('texto'), null);
  });
});

describe('describeResponse', () => {
  test('destaca o codigo de erro da propria API', () => {
    const texto = describeResponse({ code: 40001, msg: 'invalid params' });
    assert.match(texto, /code=40001/);
    assert.match(texto, /invalid params/);
  });

  test('lista os campos recebidos quando nao ha lista', () => {
    // Sem isso o aviso seria "formato pode ter mudado", que nao ajuda
    // ninguem a consertar.
    const texto = describeResponse({ data: { total: 0, cursor: 'abc' } });
    assert.match(texto, /total/);
    assert.match(texto, /cursor/);
  });

  test('nao confunde sucesso (code=0) com erro', () => {
    const texto = describeResponse({ code: 0, data: { total: 0 } });
    assert.ok(!texto.includes('code=0'));
  });
});

describe('toTrend', () => {
  test('le hashtag no formato conhecido', () => {
    const trend = toTrend(
      { hashtag_name: '#recitas', publish_cnt: '340K', video_views: '1.2M', rank: 3 },
      'hashtag',
      'BR',
      0,
    );
    assert.equal(trend?.name, 'recitas'); // a cerquilha e removida
    assert.equal(trend?.postCount, 340_000);
    assert.equal(trend?.viewCount, 1_200_000);
    assert.equal(trend?.rank, 3);
  });

  test('aceita o campo generico "name" como alternativa', () => {
    assert.equal(toTrend({ name: 'airfryer' }, 'hashtag', 'BR', 0)?.name, 'airfryer');
  });

  test('le som nos varios nomes de campo ja vistos', () => {
    for (const key of ['title', 'song_name', 'music_name', 'name']) {
      const trend = toTrend({ [key]: 'Musica X' }, 'sound', 'BR', 0);
      assert.equal(trend?.name, 'Musica X', `falhou para "${key}"`);
    }
  });

  test('descarta item sem nome em vez de criar tendencia vazia', () => {
    assert.equal(toTrend({ publish_cnt: '10K' }, 'hashtag', 'BR', 0), null);
    assert.equal(toTrend({ hashtag_name: '   ' }, 'hashtag', 'BR', 0), null);
  });

  test('usa a posicao na lista quando a API nao manda rank', () => {
    assert.equal(toTrend({ name: 'x' }, 'hashtag', 'BR', 4)?.rank, 5);
  });
});
