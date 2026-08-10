import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, applyStored } from '@/lib/db/settings';

/**
 * `getSettings` devolve `{ ...DEFAULT_SETTINGS, ...linha }` para que campos
 * novos apareçam sem migration. O preco disso e que um valor gravado errado no
 * passado sobrevive para sempre — e o papel na Hotmart e justamente o campo em
 * que um valor invalido nao da erro: a importacao descarta todas as vendas em
 * silencio, e o painel mostra zero como se voce nao tivesse vendido nada.
 */

describe('AppSettings', () => {
  test('linha vazia recebe os padroes', () => {
    assert.deepEqual(applyStored({}), DEFAULT_SETTINGS);
  });

  test('mesclar preserva os campos que a linha nao traz', () => {
    const merged = applyStored({ importWindowDays: 30 });
    assert.equal(merged.importWindowDays, 30);
    assert.equal(merged.hotmartRole, DEFAULT_SETTINGS.hotmartRole);
  });

  test('os tres papeis validos passam', () => {
    for (const role of ['AFFILIATE', 'PRODUCER', 'COPRODUCER'] as const) {
      assert.equal(applyStored({ hotmartRole: role }).hotmartRole, role);
    }
  });

  test('papel invalido volta para o padrao em vez de zerar a importacao', () => {
    // Sem esta rede, um valor estranho gravado por uma versao futura faria
    // toda venda ser descartada por nao bater com papel nenhum — e o sintoma
    // seria "a Hotmart nao tem vendas", nao "a configuracao esta errada".
    const merged = applyStored({ hotmartRole: 'AFILIADO' as never });
    assert.equal(merged.hotmartRole, 'AFFILIATE');
  });

  test('lista de termos corrompida nao quebra a tela', () => {
    // O formulario grava um array; uma linha antiga (ou editada na mao) pode
    // trazer texto, e `.filter` num texto derrubaria a pagina inteira.
    assert.deepEqual(applyStored({ affiliateKeywords: 'fone' as never }).affiliateKeywords, []);
  });

  test('termos validos sao mantidos', () => {
    const merged = applyStored({ affiliateKeywords: ['fone', 'airfryer'] });
    assert.deepEqual(merged.affiliateKeywords, ['fone', 'airfryer']);
  });
});
