import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { videos } from '@/lib/db/schema';
import { getSettings, type AppSettings } from '@/lib/db/settings';
import { publishVideo } from '@/lib/pipeline/publish';
import { getAccount } from '@/lib/tiktok/account';
import { hydrateEnv } from '@/lib/secrets';

/**
 * Piloto automatico.
 *
 * O painel foi desenhado em torno de voce aprovar cada passo pelo celular, e
 * isso continua sendo o padrao. Este modulo e o que permite tirar a mao: a
 * ideia com nota alta vira video sozinha e o video pronto vai ao ar sozinho.
 *
 * Tres travas existem porque automatizar publicacao sem elas nao e automacao,
 * e um acidente esperando data marcada:
 *
 *   - **nota minima propria** — a nota que faz uma ideia merecer a sua atencao
 *     nao e a mesma que a faz merecer ir ao ar sem nenhuma atencao;
 *   - **teto diario** — o mesmo `videosPerDay` que ja limita a renderizacao,
 *     agora tambem contando o que foi publicado;
 *   - **intervalo entre posts** — tres videos prontos as 6h nao podem virar
 *     tres posts as 6h01.
 *
 * As decisoes ficam em funcoes puras no topo do arquivo: sao elas que os
 * testes cobrem, sem precisar de banco, de rede nem de conta do TikTok.
 */

// --- Decisoes (puras) -------------------------------------------------------

/** Quanto ainda cabe hoje. Nunca negativo: teto reduzido nao vira divida. */
export function budgetLeft(limit: number, usedLast24h: number): number {
  return Math.max(0, limit - usedLast24h);
}

/**
 * Quantos minutos ainda faltam para a proxima publicacao automatica.
 *
 * Zero significa "pode publicar agora". Sem publicacao anterior tambem e zero:
 * o intervalo e entre um post e o seguinte, e nao uma espera na largada.
 */
export function waitMinutes(
  lastPublishedAt: Date | null | undefined,
  gapMinutes: number,
  now: Date = new Date(),
): number {
  if (!lastPublishedAt || gapMinutes <= 0) return 0;
  const passados = (now.getTime() - lastPublishedAt.getTime()) / 60_000;
  return Math.max(0, Math.ceil(gapMinutes - passados));
}

/**
 * Quais ideias o piloto leva, e em que ordem.
 *
 * Nota mais alta primeiro: quando o teto diario corta o lote, o que fica de
 * fora precisa ser o pior roteiro, nao o que chegou depois.
 */
export function pickIdeas<T extends { id: string; score: number }>(
  pending: T[],
  { minScore, budget }: { minScore: number; budget: number },
): T[] {
  if (budget <= 0) return [];
  return pending
    .filter((idea) => idea.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, budget);
}

/** Resumo legivel do piloto, para a tela e para o log dos jobs. */
export function describeAutopilot(settings: AppSettings): string {
  if (!settings.autoApprove && !settings.autoPublish) return 'desligado';

  const partes: string[] = [];
  if (settings.autoApprove) partes.push(`grava ideias com nota ${settings.autoMinScore}+`);
  if (settings.autoPublish) {
    partes.push(
      settings.autoGapMinutes > 0
        ? `publica sozinho (1 a cada ${settings.autoGapMinutes} min)`
        : 'publica sozinho',
    );
  }
  return `${partes.join(' e ')} — ate ${settings.videosPerDay}/dia`;
}

// --- O que impede o piloto de entregar --------------------------------------

export type Blocker = {
  /** O que esta atrapalhando, em uma linha. */
  label: string;
  /** O que fazer a respeito. */
  hint: string;
  /** `alta`: nada do que o piloto produzir sera visto por ninguem. */
  severity: 'alta' | 'media';
};

export type AutopilotState = {
  settings: AppSettings;
  /** Se existe conta do TikTok conectada. */
  connected: boolean;
  /** Se o TikTok ja ofereceu privacidade publica na ultima publicacao. */
  canPostPublic: boolean;
  /** Ideias esperando, e quantas delas alcancam a nota do piloto. */
  pendingIdeas: number;
  pendingAboveScore: number;
  lastPublishedAt: Date | null;
  now?: Date;
};

/** Depois disso, um piloto ligado que nao publica esta parado, nao devagar. */
const SILENT_HOURS = 48;

/**
 * O que esta entre o piloto e um video que alguem ve.
 *
 * Existe porque o piloto tem um modo de falhar silencioso e caro: ele roda,
 * nao da erro nenhum, e mesmo assim nada chega a lugar nenhum — o app sem
 * auditoria manda tudo como privado, a nota alta demais descarta todo roteiro,
 * a conta nunca foi conectada. Nos tres casos os jobs ficam verdes e o canal
 * fica parado, e voce so descobre semanas depois, olhando o perfil.
 *
 * Piloto desligado nao gera aviso nenhum: quem aprova na mao ja esta olhando.
 */
export function autopilotBlockers(state: AutopilotState): Blocker[] {
  const { settings } = state;
  if (!settings.autoApprove && !settings.autoPublish) return [];

  const blockers: Blocker[] = [];

  if (settings.autoPublish && !state.connected) {
    blockers.push({
      severity: 'alta',
      label: 'Nenhuma conta do TikTok conectada',
      hint: 'O piloto grava os videos mas nao tem para onde publica-los. Conecte em Configuracoes.',
    });
  }

  if (settings.autoPublish && state.connected && !state.canPostPublic) {
    blockers.push({
      severity: 'alta',
      label: 'Os videos vao ao ar como privados',
      hint:
        'Enquanto o app nao passa na auditoria do TikTok, o video chega na sua conta mas so ' +
        'voce o ve — sem alcance e sem visualizacao. A auditoria e gratuita, no portal de ' +
        'desenvolvedores. Se voce ja enviou, este aviso some depois da proxima publicacao.',
    });
  }

  if (settings.autoApprove && state.pendingIdeas > 0 && state.pendingAboveScore === 0) {
    blockers.push({
      severity: 'media',
      label: `${state.pendingIdeas} ideia(s) esperando, nenhuma alcanca a nota ${settings.autoMinScore}`,
      hint: 'Baixe a nota do piloto ou gere ideias sobre outro assunto.',
    });
  }

  // So acusamos silencio de quem ja publicou alguma vez: sem essa data nao da
  // para distinguir "parou" de "ligou agora", e um alarme no primeiro dia
  // ensina a ignorar o alarme.
  if (settings.autoPublish && state.lastPublishedAt) {
    const horas = (now(state).getTime() - state.lastPublishedAt.getTime()) / 3_600_000;
    if (horas >= SILENT_HOURS) {
      blockers.push({
        severity: 'media',
        label: `O piloto nao publica ha ${Math.floor(horas / 24)} dia(s)`,
        hint: 'Veja as ultimas execucoes: o passo que falhou esta la com o motivo.',
      });
    }
  }

  return blockers;
}

function now(state: AutopilotState): Date {
  return state.now ?? new Date();
}

// --- Publicacao automatica --------------------------------------------------

export type AutoPublishResult = {
  /** Ids dos videos que foram ao ar nesta rodada. */
  published: string[];
  /** Ids que tentaram e falharam — o erro ja esta gravado na linha do video. */
  failed: string[];
  /** Por que a rodada parou. Sempre preenchido quando nada foi publicado. */
  reason?: string;
};

/**
 * Publica o que ja esta renderizado, respeitando teto e intervalo.
 *
 * Roda em dois momentos: logo depois de um render terminar (para o video ir ao
 * ar enquanto o assunto ainda esta quente) e no cron, que e a rede de seguranca
 * para o que ficou esperando o intervalo passar.
 */
export async function autoPublishReady(
  log: (message: string) => void = () => {},
): Promise<AutoPublishResult> {
  const settings = await getSettings();
  if (!settings.autoPublish) {
    return { published: [], failed: [], reason: 'publicacao automatica desligada' };
  }

  await hydrateEnv();

  // Sem conta conectada nao ha para onde publicar. Isso e configuracao
  // faltando, nao falha: quem ainda nao conectou o TikTok ve o video esperando
  // na Fila, que e o comportamento correto.
  const account = await getAccount().catch(() => null);
  if (!account) {
    return { published: [], failed: [], reason: 'nenhuma conta do TikTok conectada' };
  }

  const [usados] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videos)
    .where(sql`${videos.status} = 'published' and ${videos.publishedAt} > now() - interval '24 hours'`);

  const budget = budgetLeft(settings.videosPerDay, usados?.n ?? 0);
  if (budget === 0) {
    return {
      published: [],
      failed: [],
      reason: `teto de ${settings.videosPerDay} publicacao(oes) por dia ja atingido`,
    };
  }

  const [ultimo] = await db
    .select({ at: videos.publishedAt })
    .from(videos)
    .where(eq(videos.status, 'published'))
    .orderBy(desc(videos.publishedAt))
    .limit(1);

  const espera = waitMinutes(ultimo?.at ?? null, settings.autoGapMinutes);
  if (espera > 0) {
    return {
      published: [],
      failed: [],
      reason: `proxima publicacao automatica em ~${espera} min (intervalo de ${settings.autoGapMinutes} min)`,
    };
  }

  const prontos = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.status, 'ready'))
    .orderBy(sql`${videos.renderedAt} asc nulls last`)
    .limit(budget);

  if (prontos.length === 0) {
    return { published: [], failed: [], reason: 'nenhum video pronto esperando' };
  }

  const published: string[] = [];
  const failed: string[] = [];
  let reason: string | undefined;

  for (const video of prontos) {
    /**
     * Marcamos como "publicando" antes de publicar, e so seguimos se a linha
     * ainda estava em "ready".
     *
     * Duas rodadas podem acontecer ao mesmo tempo — um render terminando no
     * runner enquanto o cron varre a fila. Sem essa reserva, as duas leriam o
     * mesmo video como pronto e ele iria ao ar duas vezes.
     */
    const reservado = await db
      .update(videos)
      .set({ status: 'publishing', error: null })
      .where(sql`${videos.id} = ${video.id} and ${videos.status} = 'ready'`)
      .returning({ id: videos.id });

    if (reservado.length === 0) {
      log(`${video.id}: ja estava sendo publicado por outra rodada`);
      continue;
    }

    try {
      const result = await publishVideo(video.id);
      published.push(video.id);
      log(
        result.privateOnly
          ? `${video.id}: enviado como privado (app sem auditoria do TikTok)`
          : `${video.id}: publicado`,
      );
    } catch (err) {
      // O erro ja foi gravado na linha do video e notificado por `publishVideo`.
      // Um video que o TikTok recusou nao pode impedir o proximo de tentar.
      failed.push(video.id);
      log(`${video.id}: falhou — ${err instanceof Error ? err.message : String(err)}`);
    }

    if (settings.autoGapMinutes > 0 && prontos.length > published.length + failed.length) {
      reason = `o resto espera o intervalo de ${settings.autoGapMinutes} min`;
      break;
    }
  }

  return { published, failed, reason };
}
