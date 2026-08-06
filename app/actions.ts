'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, trends, videos } from '@/lib/db/schema';
import { getSettings, saveSettings, type AppSettings } from '@/lib/db/settings';
import { prepareDatabase } from '@/lib/db/setup';
import { hydrateEnv, saveSecrets, type SecretValues } from '@/lib/secrets';
import { login, logout, requireAuth } from '@/lib/auth';
import { runScan } from '@/lib/pipeline/trends';
import { generateIdeasFromTrends, generateIdeasForTopic } from '@/lib/pipeline/ideas';
import { enqueueRender, renderQueuedVideo } from '@/lib/pipeline/render';
import { publishVideo } from '@/lib/pipeline/publish';
import { canDispatch, dispatch } from '@/lib/dispatch';
import { disconnectAccount } from '@/lib/tiktok/account';
import { env } from '@/lib/env';

/**
 * Server actions do painel.
 *
 * Padrao aqui: toda action devolve `{ ok, message }` em vez de lancar. Assim a
 * tela mostra o erro real (chave faltando, tendencia vazia, TikTok recusou)
 * em vez da pagina de erro generica do Next — o que importa quando o unico
 * lugar onde voce ve isso e a tela do celular.
 */
export type ActionState = { ok: boolean; message: string } | null;

/**
 * Toda action passa por aqui: confere a sessao e carrega as chaves guardadas
 * no banco para dentro do `env`, para que o restante do codigo continue
 * lendo `env.pexelsApiKey` sem saber de onde o valor veio.
 */
async function guard(): Promise<void> {
  await requireAuth();
  await hydrateEnv();
}

function fail(err: unknown): ActionState {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, message };
}

// --- Sessao ----------------------------------------------------------------

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
    if (result.ok) {
      revalidatePath('/', 'layout');
    }
    return result;
  } catch (err) {
    return fail(err);
  }
}

// --- Tendencias e ideias ----------------------------------------------------

export async function scanAction(): Promise<ActionState> {
  try {
    await guard();
    const result = await runScan();
    revalidatePath('/tendencias');
    revalidatePath('/');

    // Acesso fechado pelo TikTok nao e erro da aplicacao: a mensagem diz o
    // que aconteceu e para onde ir, sem despejar diagnostico tecnico.
    if (result.blocked) {
      return { ok: false, message: result.warnings[0] };
    }

    const base = `${result.fetched} tendencias lidas — ${result.inserted} novas, ${result.updated} atualizadas.`;
    return {
      ok: result.fetched > 0,
      message:
        result.warnings.length > 0
          ? `${base} Avisos: ${result.warnings.join('; ')}`
          : base,
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Cadastra uma tendencia na mao.
 *
 * O Creative Center e fonte nao oficial e sai do ar. Este caminho garante que
 * voce nunca fique bloqueado: abre o TikTok, ve o que esta bombando, digita
 * aqui, e a geracao de roteiros segue normal.
 */
export async function addTrendAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();

    const name = String(form.get('name') ?? '')
      .trim()
      .replace(/^#/, '');
    if (!name) return { ok: false, message: 'Escreva a hashtag ou o assunto.' };

    const kind = String(form.get('kind') ?? 'hashtag');
    const settings = await getSettings();
    const now = new Date();

    await db
      .insert(trends)
      .values({
        source: 'manual',
        kind,
        name,
        country: settings.country,
        // Nota alta de proposito: se voce digitou, e porque viu que esta
        // bombando — essa observacao vale mais que qualquer estimativa nossa.
        score: 85,
        history: [{ at: now.toISOString(), score: 85 }],
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [trends.source, trends.kind, trends.name, trends.country],
        set: { lastSeenAt: now, score: 85 },
      });

    revalidatePath('/tendencias');
    revalidatePath('/');
    return { ok: true, message: `"${name}" adicionada. Agora gere as ideias.` };
  } catch (err) {
    return fail(err);
  }
}

export async function generateIdeasAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();
    const topic = String(form.get('topic') ?? '').trim();

    // Gerar roteiro leva dezenas de segundos e estoura o limite de tempo de
    // funcao serverless. Quando o GitHub Actions esta configurado, mandamos
    // para la; senao rodamos aqui mesmo e torcemos pelo timeout do host.
    if (!topic && canDispatch()) {
      await dispatch('generate-ideas');
      return { ok: true, message: 'Geracao iniciada no GitHub Actions. Atualize em ~1 minuto.' };
    }

    const result = topic
      ? await generateIdeasForTopic(topic)
      : await generateIdeasFromTrends();

    revalidatePath('/ideias');
    return {
      ok: true,
      message: `${result.created} ideia(s) criada(s)${
        result.discarded > 0 ? `, ${result.discarded} descartada(s) por nota baixa` : ''
      }.`,
    };
  } catch (err) {
    return fail(err);
  }
}

/** Atalho do painel inicial: gera ideias direto das tendencias, sem assunto. */
export async function generateFromTrendsAction(): Promise<ActionState> {
  return generateIdeasAction(null, new FormData());
}

export async function approveIdeaAction(ideaId: string): Promise<ActionState> {
  try {
    await guard();
    const videoId = await enqueueRender(ideaId);

    if (canDispatch()) {
      await dispatch('render-video', { video_id: videoId });
    } else {
      // Sem GitHub Actions o render roda aqui. Vai demorar; o `void` evita
      // segurar a resposta, e o status no banco conta o resto da historia.
      void renderQueuedVideo(videoId).catch((err) => console.error(err));
    }

    revalidatePath('/ideias');
    revalidatePath('/fila');
    return { ok: true, message: 'Video entrou na fila de renderizacao.' };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectIdeaAction(ideaId: string): Promise<ActionState> {
  try {
    await guard();
    await db.update(ideas).set({ status: 'rejected' }).where(eq(ideas.id, ideaId));
    revalidatePath('/ideias');
    return { ok: true, message: 'Ideia descartada.' };
  } catch (err) {
    return fail(err);
  }
}

// --- Fila de videos ---------------------------------------------------------

export async function publishVideoAction(videoId: string): Promise<ActionState> {
  try {
    await guard();

    if (canDispatch()) {
      await db.update(videos).set({ status: 'publishing' }).where(eq(videos.id, videoId));
      await dispatch('publish-video', { video_id: videoId });
      revalidatePath('/fila');
      return { ok: true, message: 'Publicacao iniciada. Voce recebe uma notificacao ao terminar.' };
    }

    const result = await publishVideo(videoId);
    revalidatePath('/fila');
    return {
      ok: true,
      message: result.privateOnly
        ? 'Enviado como PRIVADO (app ainda nao auditado pelo TikTok). Abra o TikTok e mude a privacidade.'
        : 'Publicado no TikTok.',
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Ajusta a legenda antes de publicar.
 *
 * O texto guardado aqui e exatamente o que vai como titulo do post no TikTok,
 * hashtags inclusas — entao voce edita o que voce ve, sem surpresa depois.
 */
export async function updateCaptionAction(
  videoId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();
    const caption = String(form.get('caption') ?? '').trim();
    if (!caption) return { ok: false, message: 'A legenda nao pode ficar vazia.' };

    // O limite do TikTok e 2200 caracteres; cortar aqui evita que o post
    // inteiro seja recusado por causa de texto longo.
    const trimmed = caption.slice(0, 2200);
    const hashtags = Array.from(trimmed.matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) =>
      m[1].toLowerCase(),
    );

    await db
      .update(videos)
      .set({ caption: trimmed, hashtags })
      .where(eq(videos.id, videoId));

    revalidatePath('/fila');
    return { ok: true, message: 'Legenda atualizada.' };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectVideoAction(videoId: string): Promise<ActionState> {
  try {
    await guard();
    await db.update(videos).set({ status: 'rejected' }).where(eq(videos.id, videoId));
    revalidatePath('/fila');
    return { ok: true, message: 'Video descartado.' };
  } catch (err) {
    return fail(err);
  }
}

export async function retryVideoAction(videoId: string): Promise<ActionState> {
  try {
    await guard();
    await db
      .update(videos)
      .set({ status: 'queued', error: null })
      .where(eq(videos.id, videoId));

    if (canDispatch()) {
      await dispatch('render-video', { video_id: videoId });
    } else {
      void renderQueuedVideo(videoId).catch((err) => console.error(err));
    }

    revalidatePath('/fila');
    return { ok: true, message: 'Renderizacao reiniciada.' };
  } catch (err) {
    return fail(err);
  }
}

// --- Configuracoes ----------------------------------------------------------

export async function saveSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await guard();
    const num = (key: string, fallback: number) => {
      const value = Number(form.get(key));
      return Number.isFinite(value) ? value : fallback;
    };

    const patch: Partial<AppSettings> = {
      niche: String(form.get('niche') ?? '').trim(),
      template: (form.get('template') === 'produto' ? 'produto' : 'viral'),
      country: String(form.get('country') ?? 'BR').toUpperCase().slice(0, 2),
      ideasPerScan: Math.max(1, Math.min(20, num('ideasPerScan', 5))),
      videosPerDay: Math.max(1, Math.min(20, num('videosPerDay', 3))),
      minScore: Math.max(0, Math.min(100, num('minScore', 60))),
      targetDuration: Math.max(10, Math.min(180, num('targetDuration', 30))),
      captionSignature: String(form.get('captionSignature') ?? '').trim(),
      blockedWords: String(form.get('blockedWords') ?? '')
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    };

    await saveSettings(patch);
    revalidatePath('/config');
    return { ok: true, message: 'Configuracoes salvas.' };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Salva as chaves de integracao.
 *
 * Campo em branco significa "nao mexer" nos campos sensiveis — eles nunca sao
 * devolvidos preenchidos para a tela, entao um envio de formulario nao pode
 * apagar uma chave por omissao. Para remover de fato, existe o botao de
 * limpar de cada campo, que manda o valor literal "-".
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

    revalidatePath('/config');
    revalidatePath('/');
    return { ok: true, message: 'Chaves salvas e ja em uso.' };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectTikTokAction(): Promise<ActionState> {
  try {
    await guard();
    await disconnectAccount();
    revalidatePath('/config');
    return { ok: true, message: 'Conta desconectada.' };
  } catch (err) {
    return fail(err);
  }
}
