import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Chaves de integracao guardadas no banco.
 *
 * O motivo e pratico: configurar oito secrets no GitHub e mais um punhado de
 * variaveis na Vercel pelo Safari do iPhone e a etapa mais penosa da
 * instalacao. Guardando as chaves no banco, elas passam a ser preenchidas numa
 * tela do proprio painel, e o GitHub Actions precisa de apenas dois secrets:
 * DATABASE_URL (onde estao) e AUTH_SECRET (com o que sao decifradas).
 *
 * As chaves NAO ficam em texto puro: sao cifradas com AES-256-GCM usando uma
 * chave derivada do AUTH_SECRET. Quem conseguir ler o banco sem ter o
 * AUTH_SECRET nao consegue usar suas credenciais.
 */

/** Campos configuraveis pelo painel. Os de bootstrap ficam de fora de proposito. */
export const SECRET_FIELDS = [
  'aiProvider',
  'geminiApiKey',
  'geminiModel',
  'groqApiKey',
  'groqModel',
  'openRouterApiKey',
  'openRouterModel',
  'anthropicApiKey',
  'pexelsApiKey',
  'ttsProvider',
  'ttsVoice',
  'geminiTtsModel',
  'geminiTtsVoice',
  'elevenLabsApiKey',
  'elevenLabsVoiceId',
  'storageDriver',
  's3Endpoint',
  's3Region',
  's3Bucket',
  's3AccessKeyId',
  's3SecretAccessKey',
  's3PublicUrl',
  'tiktokClientKey',
  'tiktokClientSecret',
  'githubToken',
  'githubRepo',
  'ntfyTopic',
  'trendCountry',
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];
export type SecretValues = Partial<Record<SecretField, string>>;

/**
 * De qual variavel de ambiente cada campo vem.
 *
 * Precisamos disso para saber quem tem prioridade. Varios campos tem valor
 * padrao no codigo (modelo, provedor, regiao), entao "esta preenchido" nao
 * distingue "voce definiu" de "e o padrao" — e, sem essa distincao, o que
 * voce salva no painel jamais sobrescreveria o padrao. Escolher Groq na tela
 * simplesmente nao surtia efeito.
 */
export const FIELD_ENV_VAR: Record<SecretField, string> = {
  aiProvider: 'AI_PROVIDER',
  geminiApiKey: 'GEMINI_API_KEY',
  geminiModel: 'GEMINI_MODEL',
  groqApiKey: 'GROQ_API_KEY',
  groqModel: 'GROQ_MODEL',
  openRouterApiKey: 'OPENROUTER_API_KEY',
  openRouterModel: 'OPENROUTER_MODEL',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  pexelsApiKey: 'PEXELS_API_KEY',
  ttsProvider: 'TTS_PROVIDER',
  geminiTtsModel: 'GEMINI_TTS_MODEL',
  geminiTtsVoice: 'GEMINI_TTS_VOICE',
  ttsVoice: 'TTS_VOICE',
  elevenLabsApiKey: 'ELEVENLABS_API_KEY',
  elevenLabsVoiceId: 'ELEVENLABS_VOICE_ID',
  storageDriver: 'STORAGE_DRIVER',
  s3Endpoint: 'S3_ENDPOINT',
  s3Region: 'S3_REGION',
  s3Bucket: 'S3_BUCKET',
  s3AccessKeyId: 'S3_ACCESS_KEY_ID',
  s3SecretAccessKey: 'S3_SECRET_ACCESS_KEY',
  s3PublicUrl: 'S3_PUBLIC_URL',
  tiktokClientKey: 'TIKTOK_CLIENT_KEY',
  tiktokClientSecret: 'TIKTOK_CLIENT_SECRET',
  githubToken: 'GITHUB_TOKEN',
  githubRepo: 'GITHUB_REPO',
  ntfyTopic: 'NTFY_TOPIC',
  trendCountry: 'TREND_COUNTRY',
};

/** true quando o valor foi definido no ambiente, e nao herdado de um padrao. */
export function definedInEnvironment(
  field: SecretField,
  source: Record<string, string | undefined> = process.env,
): boolean {
  const value = source[FIELD_ENV_VAR[field]];
  return typeof value === 'string' && value.trim() !== '';
}

/** Campos que nunca sao devolvidos para a tela — so dizemos se estao preenchidos. */
export const SENSITIVE_FIELDS: SecretField[] = [
  'geminiApiKey',
  'groqApiKey',
  'openRouterApiKey',
  'anthropicApiKey',
  'pexelsApiKey',
  'elevenLabsApiKey',
  's3SecretAccessKey',
  'tiktokClientSecret',
  'githubToken',
];

const STORE_KEY = 'secrets';

function cryptoKey(): Buffer {
  if (!env.authSecret) {
    throw new Error(
      'AUTH_SECRET nao configurado — sem ele nao da para guardar chaves com seguranca.',
    );
  }
  // scrypt transforma o segredo (que pode ser uma frase curta) numa chave de
  // 32 bytes propria para AES, e o custo torna forca bruta cara.
  return scryptSync(env.authSecret, 'autotok-secrets-v1', 32);
}

/** Exportada para teste: cifra um valor com a chave derivada do AUTH_SECRET. */
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  // O tag de autenticacao e o que detecta adulteracao do valor cifrado.
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

/** Exportada para teste. Devolve null em vez de lancar quando nao consegue. */
export function decrypt(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    if (!iv || !tag || !data) return null;

    const decipher = createDecipheriv('aes-256-gcm', cryptoKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    // Acontece quando o AUTH_SECRET mudou depois das chaves terem sido salvas.
    // Devolver null deixa a tela mostrar o campo como vazio, para ser
    // preenchido de novo, em vez de derrubar a aplicacao inteira.
    return null;
  }
}

/**
 * Quantas chaves existem no banco e quantas nao puderam ser decifradas.
 *
 * A distincao importa porque as duas situacoes se parecem: em ambas a chave
 * "some". Sem esta contagem, um AUTH_SECRET trocado se disfarca de "voce
 * esqueceu de preencher" — e a pessoa preenche tudo de novo sem entender por
 * que sumiu.
 */
export type SecretsHealth = { stored: number; unreadable: number };

let cache: { values: SecretValues; health: SecretsHealth; at: number } | null = null;
const CACHE_MS = 30_000;

/** Le as chaves guardadas no banco. */
export async function loadSecrets(force = false): Promise<SecretValues> {
  return (await loadSecretsWithHealth(force)).values;
}

async function loadSecretsWithHealth(
  force = false,
): Promise<{ values: SecretValues; health: SecretsHealth }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;

  const values: SecretValues = {};
  const health: SecretsHealth = { stored: 0, unreadable: 0 };

  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, STORE_KEY)).limit(1);
    const stored = (row?.value ?? {}) as Record<string, string>;

    for (const field of SECRET_FIELDS) {
      const raw = stored[field];
      if (typeof raw !== 'string' || raw.length === 0) continue;

      health.stored++;
      const plain = decrypt(raw);
      if (plain) values[field] = plain;
      else health.unreadable++;
    }
  } catch {
    // Banco indisponivel ou tabelas ainda nao criadas: seguimos so com o
    // ambiente, que e exatamente o estado de quem acabou de instalar.
  }

  cache = { values, health, at: Date.now() };
  return cache;
}

/** Diagnostico para a tela de configuracoes. */
export async function secretsHealth(): Promise<SecretsHealth> {
  return (await loadSecretsWithHealth()).health;
}

/** Grava (ou apaga, quando o valor vem vazio) as chaves informadas. */
export async function saveSecrets(patch: SecretValues): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.key, STORE_KEY)).limit(1);
  const stored = { ...((row?.value ?? {}) as Record<string, string>) };

  for (const [field, value] of Object.entries(patch)) {
    if (!SECRET_FIELDS.includes(field as SecretField)) continue;

    if (value === undefined) continue;
    if (value === '') {
      delete stored[field];
      continue;
    }
    stored[field] = encrypt(value);
  }

  await db
    .insert(settings)
    .values({ key: STORE_KEY, value: stored })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt: new Date() } });

  cache = null;
  hydrated = false;
}

let hydrated = false;

/**
 * Copia as chaves do banco para dentro do objeto `env`.
 *
 * Manter o resto do codigo lendo `env.pexelsApiKey` (em vez de espalhar
 * chamadas assincronas por toda parte) foi deliberado: a origem do valor vira
 * um detalhe de configuracao, nao um assunto de cada modulo.
 *
 * A variavel de ambiente sempre vence, para que um `.env` local continue
 * sobrepondo o que estiver salvo no banco.
 */
export async function hydrateEnv(force = false): Promise<void> {
  if (hydrated && !force) return;

  const { values, health } = await loadSecretsWithHealth(force);

  if (health.unreadable > 0) {
    // Vai para o log do GitHub Actions, onde nao ha tela para mostrar aviso.
    console.warn(
      `[autotok] ${health.unreadable} de ${health.stored} chaves nao puderam ser decifradas. ` +
        'O AUTH_SECRET usado aqui e diferente do que salvou as chaves — confira se o secret ' +
        'AUTH_SECRET do repositorio e identico ao do painel.',
    );
  }

  const target = env as unknown as Record<string, unknown>;

  for (const field of SECRET_FIELDS) {
    const fromDb = values[field];
    if (!fromDb) continue;
    // Um valor definido no ambiente vence (permite um .env local sobrepor o
    // banco); um padrao do codigo, nao — senao o que voce salva no painel
    // nunca teria efeito nos campos que tem padrao.
    if (definedInEnvironment(field)) continue;
    target[field] = fromDb;
  }

  hydrated = true;
}

/** Quais campos estao preenchidos, sem revelar os valores sensiveis. */
export async function secretsStatus(): Promise<Record<SecretField, boolean>> {
  await hydrateEnv();
  const source = env as unknown as Record<string, unknown>;
  const status = {} as Record<SecretField, boolean>;
  for (const field of SECRET_FIELDS) {
    status[field] = Boolean(source[field]);
  }
  return status;
}

/** Valores para preencher o formulario — os sensiveis voltam mascarados. */
export async function secretsForForm(): Promise<SecretValues> {
  await hydrateEnv();
  const source = env as unknown as Record<string, unknown>;
  const values: SecretValues = {};

  for (const field of SECRET_FIELDS) {
    const value = source[field];
    if (typeof value !== 'string' || value === '') continue;
    values[field] = SENSITIVE_FIELDS.includes(field) ? '' : value;
  }
  return values;
}
