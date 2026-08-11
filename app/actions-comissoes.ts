'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { hydrateEnv } from '@/lib/secrets';
import { saveSettings } from '@/lib/db/settings';
import { forgetToken, testConnection as testHotmart } from '@/lib/hotmart/api';
import { testConnection as testAmazon } from '@/lib/amazon/paapi';
import {
  importAmazonCatalog,
  importAmazonCsv,
  importHotmartCommissions,
  importHotmartProducts,
  refreshOperatingProducts,
  saveManualProduct,
  setOperating,
} from '@/lib/pipeline/comissoes';
import { parseAmountCents } from '@/lib/money';
import { generateIdeaForProduct } from '@/lib/pipeline/produto-video';
import type { ImportResult } from '@/lib/afiliados/types';
import type { ActionState } from '@/app/actions';

/**
 * Acoes do painel de comissoes.
 *
 * Mesmo contrato do resto do painel: nunca lancam, devolvem `{ ok, message }`.
 * A tela do celular e o unico log que existe — um stack trace na pagina de
 * erro do Next nao diz se o problema foi a chave, a cota ou o arquivo.
 */

async function guard(): Promise<void> {
  await requireAuth();
  await hydrateEnv();
}

function fail(err: unknown): ActionState {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

/** Os dois substantivos que as importacoes contam, com genero. */
const NOUNS = {
  comissao: { um: 'Nenhuma comissao encontrada', n: 'comissao(oes)', lidas: 'lida(s)', novas: 'nova(s)', atualizadas: 'atualizada(s)' },
  produto: { um: 'Nenhum produto encontrado', n: 'produto(s)', lidos: 'lido(s)', novos: 'novo(s)', atualizados: 'atualizado(s)' },
} as const;

type Noun = keyof typeof NOUNS;

/**
 * Um resultado de importacao vira a frase que a tela mostra.
 *
 * O genero vem de uma tabela em vez de concatenacao: "Nenhuma produto
 * encontrada" apareceu na tela de verdade, e um painel que erra portugues
 * basico parece quebrado mesmo quando esta certo.
 */
function describe(result: ImportResult, noun: Noun): ActionState {
  const palavras = NOUNS[noun];

  const base =
    result.fetched === 0
      ? `${palavras.um}.`
      : noun === 'comissao'
        ? `${result.fetched} comissao(oes) lida(s) — ${result.inserted} nova(s), ${result.updated} atualizada(s).`
        : `${result.fetched} produto(s) lido(s) — ${result.inserted} novo(s), ${result.updated} atualizado(s).`;

  const warnings = result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : '';

  return {
    /**
     * Importar zero nao e falha; nao poder importar, e.
     *
     * Nao ter venda no periodo, ou nao estar afiliado a nada ainda, sao
     * estados normais — e a explicacao vem junto na mensagem. Pintar isso de
     * vermelho treina voce a ignorar vermelho, e ai o vermelho que exige acao
     * (uma chave faltando) passa batido no meio.
     */
    ok: !result.blocked,
    message: `${base}${warnings}`,
  };
}

function refresh(): void {
  revalidatePath('/comissoes');
  revalidatePath('/comissoes/importar');
}

// --- Importacoes ------------------------------------------------------------

export async function importHotmartAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await importHotmartCommissions();
    refresh();
    return describe(result, 'comissao');
  } catch (err) {
    return fail(err);
  }
}

export async function importHotmartProductsAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await importHotmartProducts();
    refresh();
    return describe(result, 'produto');
  } catch (err) {
    return fail(err);
  }
}

export async function importAmazonCatalogAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await importAmazonCatalog();
    refresh();
    return describe(result, 'produto');
  } catch (err) {
    return fail(err);
  }
}

export async function refreshOperatingAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await refreshOperatingProducts();
    refresh();
    return describe(result, 'produto');
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sobe o CSV de ganhos da Amazon.
 *
 * O limite de tamanho existe porque o arquivo inteiro e lido em memoria: um
 * relatorio anual tem uns poucos MB, e qualquer coisa muito acima disso e
 * provavelmente o arquivo errado — melhor dizer isso do que travar o servidor.
 */
const CSV_MAX_BYTES = 8 * 1024 * 1024;

export async function importAmazonCsvAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();

    const file = form.get('arquivo');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Escolha o arquivo CSV do relatorio de ganhos.' };
    }
    if (file.size > CSV_MAX_BYTES) {
      return { ok: false, message: 'O arquivo passa de 8 MB. Exporte um periodo menor.' };
    }

    const result = await importAmazonCsv(await file.text());
    refresh();
    return describe(result, 'comissao');
  } catch (err) {
    return fail(err);
  }
}

// --- Conexoes ---------------------------------------------------------------

export async function testHotmartAction(): Promise<ActionState> {
  try {
    await guard();
    // As credenciais podem ter acabado de mudar na tela de Chaves; um token
    // guardado da tentativa anterior faria o teste responder sobre o passado.
    forgetToken();
    return await testHotmart();
  } catch (err) {
    return fail(err);
  }
}

export async function testAmazonAction(): Promise<ActionState> {
  try {
    await guard();
    return await testAmazon();
  } catch (err) {
    return fail(err);
  }
}

// --- Meus produtos ----------------------------------------------------------

export async function toggleOperatingAction(
  productId: string,
  operating: boolean,
): Promise<ActionState> {
  try {
    await guard();
    await setOperating(productId, operating);
    refresh();
    return {
      ok: true,
      message: operating
        ? 'Produto marcado como em operacao.'
        : 'Produto saiu da lista de operacao.',
    };
  } catch (err) {
    return fail(err);
  }
}

// --- Cadastro manual --------------------------------------------------------

/**
 * Cadastra um produto na mao.
 *
 * Existe porque a Hotmart nao publica o marketplace de afiliados em API: voce
 * escolhe o produto no site deles e, sem este caminho, ele nunca apareceria
 * aqui — e sem produto na lista nao ha o que virar video. Serve tambem para a
 * Amazon enquanto a conta nova nao tem cota na PA-API.
 *
 * O que voce digita vence qualquer importacao: um produto manual nunca e
 * sobrescrito por busca automatica, porque foi voce que escolheu.
 */
export async function addProductAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();

    const name = String(form.get('name') ?? '').trim();
    if (!name) return { ok: false, message: 'Escreva o nome do produto.' };

    const url = String(form.get('url') ?? '').trim();
    if (!url) {
      return {
        ok: false,
        message: 'Cole o seu link de afiliado — e ele que credita a comissao.',
      };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, message: 'O link precisa comecar com http:// ou https://.' };
    }

    const source = form.get('source') === 'amazon' ? 'amazon' : 'hotmart';
    const priceCents = parseAmountCents(String(form.get('price') ?? ''));
    const rate = Number(form.get('commissionRate'));

    await saveManualProduct({
      source,
      name,
      url,
      category: String(form.get('category') ?? '').trim() || null,
      imageUrl: String(form.get('imageUrl') ?? '').trim() || null,
      priceCents,
      currency: String(form.get('currency') ?? 'BRL').toUpperCase().slice(0, 3),
      commissionRate: Number.isFinite(rate) && rate > 0 ? Math.min(100, rate) : null,
    });

    refresh();
    return {
      ok: true,
      message: `"${name}" cadastrado. Ja da para gerar o video dele na lista abaixo.`,
    };
  } catch (err) {
    return fail(err);
  }
}

// --- Video do produto -------------------------------------------------------

/**
 * Transforma um produto num video.
 *
 * A ideia entra em "aguardando voce" na tela Ideias, e nao vira video sozinha:
 * o roteiro fala de um produto real com o seu link embaixo, entao ler antes de
 * gravar e o passo que evita publicar besteira em nome proprio.
 */
export async function gerarVideoDoProdutoAction(productId: string): Promise<ActionState> {
  try {
    await guard();
    const { title, warnings } = await generateIdeaForProduct(productId);

    revalidatePath('/comissoes');
    revalidatePath('/ideias');

    return {
      ok: true,
      message:
        `Roteiro "${title}" criado. Abra a aba Ideias para ler e aprovar.` +
        (warnings.length > 0 ? ` ${warnings.join(' ')}` : ''),
    };
  } catch (err) {
    return fail(err);
  }
}

// --- Configuracao da importacao ---------------------------------------------

export async function saveAffiliateSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();

    const role = String(form.get('hotmartRole') ?? 'AFFILIATE');
    const days = Number(form.get('importWindowDays'));

    await saveSettings({
      hotmartRole:
        role === 'PRODUCER' || role === 'COPRODUCER'
          ? (role as 'PRODUCER' | 'COPRODUCER')
          : 'AFFILIATE',
      // A Hotmart recusa janelas muito largas numa chamada so; 365 dias e o
      // teto pratico e ja cobre a declaracao do ano inteiro.
      importWindowDays: Math.max(1, Math.min(365, Number.isFinite(days) ? days : 90)),
      affiliateKeywords: String(form.get('affiliateKeywords') ?? '')
        .split(/[\n,]/)
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, 20),
    });

    refresh();
    return { ok: true, message: 'Preferencias de importacao salvas.' };
  } catch (err) {
    return fail(err);
  }
}
