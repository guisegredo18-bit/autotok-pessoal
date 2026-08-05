/**
 * Leitura centralizada das variaveis de ambiente.
 *
 * A regra e simples: nada explode na importacao do modulo. Cada recurso
 * (IA, TTS, S3, TikTok) pode faltar de forma independente, e quem precisa
 * dele chama `requireEnv` na hora do uso. Assim o painel continua abrindo
 * mesmo com a configuracao pela metade, e a UI consegue mostrar o que falta.
 */

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',

  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  appPassword: process.env.APP_PASSWORD ?? '',
  authSecret: process.env.AUTH_SECRET ?? '',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',

  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? '',
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
  tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI ?? '',

  storageDriver: (process.env.STORAGE_DRIVER as 's3' | 'local') || 'local',
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  s3PublicUrl: (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, ''),

  pexelsApiKey: process.env.PEXELS_API_KEY ?? '',

  ttsProvider: (process.env.TTS_PROVIDER as 'edge' | 'elevenlabs') || 'edge',
  ttsVoice: process.env.TTS_VOICE || 'pt-BR-ThalitaMultilingualNeural',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '',

  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubRepo: process.env.GITHUB_REPO ?? '',

  ntfyTopic: process.env.NTFY_TOPIC ?? '',
  ntfyServer: (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, ''),

  trendCountry: process.env.TREND_COUNTRY || 'BR',
  trendLanguage: process.env.TREND_LANGUAGE || 'pt-BR',
};

export function requireEnv<K extends keyof typeof env>(...keys: K[]): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Configuracao faltando: ${missing.join(', ')}. Preencha no .env (veja .env.example).`,
    );
  }
}

/** Quais integracoes estao prontas — usado pela tela de configuracoes. */
export function integrationStatus() {
  return {
    database: Boolean(env.databaseUrl),
    ia: Boolean(env.anthropicApiKey),
    tiktok: Boolean(env.tiktokClientKey && env.tiktokClientSecret && env.tiktokRedirectUri),
    storage: env.storageDriver === 'local' || Boolean(env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey),
    stock: Boolean(env.pexelsApiKey),
    tts: env.ttsProvider === 'edge' || Boolean(env.elevenLabsApiKey),
    actions: Boolean(env.githubToken && env.githubRepo),
    push: Boolean(env.ntfyTopic),
  };
}
