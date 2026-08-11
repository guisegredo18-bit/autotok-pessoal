import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  boolean,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Tendencia capturada de uma fonte externa (hoje: TikTok Creative Center).
 * Uma mesma hashtag reaparece a cada varredura; guardamos uma linha por
 * (fonte, tipo, nome, pais) e atualizamos as metricas, mantendo o historico
 * de score em `history` para calcular aceleracao.
 */
export const trends = pgTable(
  'trends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull().default('creative_center'),
    kind: text('kind').notNull(), // hashtag | sound | product | keyword
    name: text('name').notNull(),
    country: text('country').notNull().default('BR'),
    category: text('category'),
    /** Score 0-100 combinando volume, crescimento e frescor. */
    score: real('score').notNull().default(0),
    rank: integer('rank'),
    postCount: integer('post_count'),
    viewCount: integer('view_count'),
    growthRate: real('growth_rate'),
    /** Payload cru da fonte, util para depurar mudancas na API. */
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    history: jsonb('history').$type<{ at: string; score: number }[]>().default([]),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTrend: unique('trends_unique').on(t.source, t.kind, t.name, t.country),
    scoreIdx: index('trends_score_idx').on(t.score),
  }),
);

/**
 * Ideia de video derivada de uma tendencia, ja com roteiro pronto.
 * Fica em `pending` ate voce aprovar (ou ate a regra automatica aprovar).
 */
export const ideas = pgTable(
  'ideas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trendId: uuid('trend_id').references(() => trends.id, { onDelete: 'set null' }),
    /** Nome do template de video: 'produto' | 'viral' */
    template: text('template').notNull().default('viral'),
    title: text('title').notNull(),
    hook: text('hook').notNull(),
    /** Roteiro em cenas: texto narrado + termo de busca da imagem de fundo. */
    scenes: jsonb('scenes')
      .$type<{ text: string; visual: string; seconds: number }[]>()
      .notNull()
      .default([]),
    caption: text('caption').notNull().default(''),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    /** Nota 0-100 dada pela IA sobre o potencial do roteiro. */
    score: real('score').notNull().default(0),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | rendered
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('ideas_status_idx').on(t.status),
  }),
);

/**
 * O video em si, do enfileiramento ate a publicacao.
 *
 * Fluxo de status:
 *   queued -> rendering -> ready -> (voce aprova) -> publishing -> published
 *                                \-> (voce rejeita) -> rejected
 *   qualquer etapa pode cair em `failed`, com o motivo em `error`.
 */
export const videos = pgTable(
  'videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ideaId: uuid('idea_id').references(() => ideas.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'),
    /**
     * URL publica (para o player do painel) e chave no armazenamento (para
     * ler o arquivo de volta na hora de publicar). Guardamos as duas: derivar
     * a chave a partir da URL quebra assim que o dominio do bucket muda ou
     * contem os mesmos segmentos de caminho.
     */
    videoUrl: text('video_url'),
    videoKey: text('video_key'),
    thumbUrl: text('thumb_url'),
    thumbKey: text('thumb_key'),
    durationSeconds: real('duration_seconds'),
    sizeBytes: integer('size_bytes'),
    caption: text('caption').notNull().default(''),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    privacyLevel: text('privacy_level').notNull().default('SELF_ONLY'),
    /**
     * Video que saiu bom o bastante para existir, mas nao para ir ao ar sozinho.
     *
     * Hoje quem liga isto e a renderizacao sem narracao: um video mudo da para
     * assistir e julgar, e por isso vale entrega-lo — mas publicar um video sem
     * voz no seu perfil, sem ninguem ter visto, e outra coisa. O piloto pula
     * estes; voce continua podendo publicar com um toque.
     */
    needsReview: boolean('needs_review').notNull().default(false),
    /** Identificadores devolvidos pela Content Posting API. */
    tiktokPublishId: text('tiktok_publish_id'),
    tiktokPostUrl: text('tiktok_post_url'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    renderedAt: timestamp('rendered_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('videos_status_idx').on(t.status),
  }),
);

/** Conta do TikTok conectada via OAuth. Normalmente so existe uma. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  openId: text('open_id').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  /** Momento em que o access token expira (renovamos antes disso). */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Fica true depois que o app passa na auditoria do TikTok. */
  canPostPublic: boolean('can_post_public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Registro de execucoes (scan, render, publish) para acompanhar pelo celular. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(), // scan | ideas | render | publish
    status: text('status').notNull().default('running'), // running | done | failed
    refId: uuid('ref_id'),
    message: text('message'),
    logs: jsonb('logs').$type<string[]>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    startedIdx: index('jobs_started_idx').on(t.startedAt),
  }),
);

/** Configuracoes editaveis pelo painel (nicho, quantidade por dia, etc). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});


export type Trend = typeof trends.$inferSelect;
export type NewTrend = typeof trends.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Scene = { text: string; visual: string; seconds: number };
