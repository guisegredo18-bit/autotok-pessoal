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

  /** Qual provedor escreve os roteiros. Os quatro primeiros sao gratuitos. */
  aiProvider: (process.env.AI_PROVIDER as
    | 'gemini'
    | 'groq'
    | 'openrouter'
    | 'ollama'
    | 'anthropic') || 'gemini',

  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  /** Trocavel para apontar a um gateway/proxy — e para os testes. */
  geminiBaseUrl: (
    process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/$/, ''),

  groqApiKey: process.env.GROQ_API_KEY ?? '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',

  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1:8b',

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

/**
 * Se o provedor de IA escolhido tem o que precisa para rodar.
 *
 * Vive aqui (e nao em lib/ai/providers) para a tela de configuracoes poder
 * checar sem importar o modulo de IA inteiro — e para nao criar um ciclo,
 * ja que providers.ts le daqui.
 */
export function aiIsReady(): boolean {
  switch (env.aiProvider) {
    case 'gemini':
      return Boolean(env.geminiApiKey);
    case 'groq':
      return Boolean(env.groqApiKey);
    case 'openrouter':
      return Boolean(env.openRouterApiKey);
    case 'ollama':
      // Nao ha chave para conferir; a falha so aparece na primeira chamada.
      return Boolean(env.ollamaUrl && env.ollamaModel);
    case 'anthropic':
      return Boolean(env.anthropicApiKey);
    default:
      return false;
  }
}

/** Quais integracoes estao prontas — usado pela tela de configuracoes. */
export function integrationStatus() {
  return {
    database: Boolean(env.databaseUrl),
    ia: aiIsReady(),
    tiktok: Boolean(env.tiktokClientKey && env.tiktokClientSecret && env.tiktokRedirectUri),
    storage: env.storageDriver === 'local' || Boolean(env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey),
    stock: Boolean(env.pexelsApiKey),
    tts: env.ttsProvider === 'edge' || Boolean(env.elevenLabsApiKey),
    actions: Boolean(env.githubToken && env.githubRepo),
    push: Boolean(env.ntfyTopic),
  };
}
