'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { login, logout, requireAuth } from '@/lib/auth';
import { prepareDatabase } from '@/lib/db/setup';
import { hydrateEnv, saveSecrets, type SecretValues } from '@/lib/secrets';
import { saveSettings } from '@/lib/db/settings';
import { forgetToken, testConnection as testHotmart } from '@/lib/hotmart/api';
import { testConnection as testAmazon } from '@/lib/amazon/paapi';
import {
  importAmazonCatalog,
  importAmazonCsv,
  importHotmartCommissions,
  importHotmartProducts,
  refreshOperatingProducts,
  setOperating,
} from '@/lib/pipeline/comissoes';
import type { ImportResult } from '@/lib/afiliados/types';

/**
 * Server actions do painel.
 *
 * Padrao aqui: toda action devolve `{ ok, message }` em vez de lancar. Assim a
 * tela mostra o erro real (chave faltando, cota estourada, arquivo errado) em
 * vez da pagina de erro generica do Next — o que importa quando o unico lugar
 * onde voce ve isso e a tela do celular.
 */
export type ActionState = { ok: boolean; message: string } | null;

/**
 * Toda action passa por aqui: confere a sessao e carrega as chaves guardadas
 * no banco para dentro do `env`, para que o restante do codigo continue lendo
 * `env.amazonAccessKey` sem saber de onde o valor veio.
 */
async function guard(): Promise<void> {
  await requireAuth();
  await hydrateEnv();
}

function fail(err: unknown): ActionState {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

/** Um resultado de importacao vira a frase que a tela mostra. */
function describe(result: ImportResult, noun: string): ActionState {
  const base =
    result.fetched === 0
      ? `Nenhuma ${noun} encontrada.`
      : `${result.fetched} ${noun}(s) lida(s) — ${result.inserted} nova(s), ${result.updated} atualizada(s).`;

  const warnings = result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : '';

  return {
    // Importar zero nao e falha quando nao houve aviso: pode simplesmente nao
    // ter havido venda no periodo. Marcar como erro treinaria voce a ignorar
    // o vermelho.
    ok: result.fetched > 0 || result.warnings.length === 0,
    message: `${base}${warnings}`,
  };
}

function refresh(): void {
  revalidatePath('/');
  revalidatePath('/importar');
}

// --- Sessao -----------------------------------------------------------------

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get('password') ?? '');
  if (!(await login(password))) {
    return { ok: false, message: 'Senha incorreta.' };
  }
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/login');
}

// --- Primeira instalacao ----------------------------------------------------

/** Cria as tabelas, para quem instalou pelo celular e nao tem terminal. */
export async function prepareDatabaseAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await prepareDatabase();
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  } catch (err) {
    return fail(err);
  }
}

// --- Chaves e preferencias --------------------------------------------------

/**
 * Salva as chaves de integracao.
 *
 * Campo em branco significa "nao mexer" nos campos sensiveis — eles nunca sao
 * devolvidos preenchidos para a tela, entao um envio de formulario nao pode
 * apagar uma chave por omissao. Para remover de fato, digite um hifen.
 */
export async function saveSecretsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();

    const patch: SecretValues = {};
    for (const [key, raw] of form.entries()) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (value === '') continue;
      patch[key as keyof SecretValues] = value === '-' ? '' : value;
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, message: 'Nada para salvar.' };
    }

    await saveSecrets(patch);
    await hydrateEnv(true);
    // As credenciais podem ter mudado; um token guardado da configuracao
    // anterior faria a proxima importacao falhar sem motivo aparente.
    forgetToken();

    revalidatePath('/config');
    revalidatePath('/importar');
    return { ok: true, message: 'Chaves salvas. Teste a conexao em Importar.' };
  } catch (err) {
    return fail(err);
  }
}

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
    return { ok: true, message: 'Preferencias salvas.' };
  } catch (err) {
    return fail(err);
  }
}

// --- Conexoes ---------------------------------------------------------------

export async function testHotmartAction(): Promise<ActionState> {
  try {
    await guard();
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
