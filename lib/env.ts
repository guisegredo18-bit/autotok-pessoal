/**
 * Leitura centralizada das variaveis de ambiente.
 *
 * A regra e simples: nada explode na importacao do modulo. Cada recurso
 * (IA, TTS, S3, TikTok) pode faltar de forma independente, e quem precisa
 * dele chama `requireEnv` na hora do uso. Assim o painel continua abrindo
 * mesmo com a configuracao pela metade, e a UI consegue mostrar o que falta.
 */

/**
 * Endereco publico da aplicacao.
 *
 * Derivar da Vercel quando APP_URL nao esta definida existe por um motivo
 * pratico: quem instala pelo celular so descobre o dominio DEPOIS do primeiro
 * deploy, e sem isso os links das notificacoes e o retorno do login do TikTok
 * apontariam para localhost.
 */
type EnvSource = Record<string, string | undefined>;

export function resolveAppUrl(source: EnvSource = process.env): string {
  if (source.APP_URL) return source.APP_URL.replace(/\/$/, '');

  const vercel = source.VERCEL_PROJECT_PRODUCTION_URL || source.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

/**
 * Rota de retorno do login do TikTok. Sempre a mesma rota, entao deriva do
 * endereco — mas continua sobrescrivel, porque o valor precisa bater
 * exatamente com o que esta cadastrado no portal do TikTok.
 */
export function resolveTikTokRedirect(
  appUrl: string,
  source: EnvSource = process.env,
): string {
  return source.TIKTOK_REDIRECT_URI || `${appUrl}/api/tiktok/callback`;
}

const APP_URL = resolveAppUrl();

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',

  appUrl: APP_URL,
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
  // Apelido que o Google mantem apontando para o Flash estavel atual. Se um
  // dia sumir, a aplicacao descobre o substituto sozinha (lib/ai/gemini-models).
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
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
  tiktokRedirectUri: resolveTikTokRedirect(APP_URL),

  storageDriver: (process.env.STORAGE_DRIVER as 's3' | 'local') || 'local',
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  s3PublicUrl: (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, ''),

  pexelsApiKey: process.env.PEXELS_API_KEY ?? '',

  ttsProvider: (process.env.TTS_PROVIDER as 'edge' | 'google' | 'elevenlabs') || 'edge',
  ttsVoice: process.env.TTS_VOICE || 'pt-BR-ThalitaMultilingualNeural',
  /** Trocavel para apontar a um proxy — e para os testes. */
  googleTtsUrl: (
    process.env.GOOGLE_TTS_URL || 'https://translate.google.com/translate_tts'
  ).replace(/\/$/, ''),
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '',

  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubRepo: process.env.GITHUB_REPO ?? '',

  ntfyTopic: process.env.NTFY_TOPIC ?? '',
  ntfyServer: (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, ''),

  trendCountry: process.env.TREND_COUNTRY || 'BR',
  trendLanguage: process.env.TREND_LANGUAGE || 'pt-BR',

  /**
   * Hotmart Developers API — OAuth2 client credentials.
   *
   * O `hotmartBasic` e o campo "Basic" que aparece pronto no painel de
   * credenciais da Hotmart. Ele e o base64 de `client_id:client_secret`; a
   * aplicacao calcula esse base64 sozinha quando o campo fica vazio, mas
   * aceitar o valor colado evita um erro chato de digitacao no celular.
   */
  hotmartClientId: process.env.HOTMART_CLIENT_ID ?? '',
  hotmartClientSecret: process.env.HOTMART_CLIENT_SECRET ?? '',
  hotmartBasic: process.env.HOTMART_BASIC ?? '',
  /** Trocavel para apontar a sandbox — e para os testes. */
  hotmartAuthUrl: (
    process.env.HOTMART_AUTH_URL || 'https://api-sec-vlc.hotmart.com'
  ).replace(/\/$/, ''),
  hotmartApiUrl: (
    process.env.HOTMART_API_URL || 'https://developers.hotmart.com'
  ).replace(/\/$/, ''),

  /** Amazon Product Advertising API 5.0. */
  amazonAccessKey: process.env.AMAZON_ACCESS_KEY ?? '',
  amazonSecretKey: process.env.AMAZON_SECRET_KEY ?? '',
  /** Tag de afiliado (ex: seunome-20). E ela que credita a comissao. */
  amazonPartnerTag: process.env.AMAZON_PARTNER_TAG ?? '',
  /** Marketplace, no formato do host: www.amazon.com.br, www.amazon.com... */
  amazonMarketplace: process.env.AMAZON_MARKETPLACE || 'www.amazon.com.br',
};

export function requireEnv<K extends keyof typeof env>(...keys: K[]): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Configuracao faltando: ${missing.join(', ')}. Preencha em Configuracoes > Chaves ` +
        'no painel (ou no .env, se estiver rodando local). Se voce ja preencheu, confira ' +
        'se o AUTH_SECRET e o mesmo nos dois lugares — sem ele as chaves nao sao decifradas.',
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
    tts: env.ttsProvider !== 'elevenlabs' || Boolean(env.elevenLabsApiKey),
    actions: Boolean(env.githubToken && env.githubRepo),
    push: Boolean(env.ntfyTopic),
    hotmart: hotmartIsReady(),
    amazon: amazonIsReady(),
  };
}

/**
 * A Hotmart precisa das duas credenciais mais um Basic.
 *
 * O Basic pode ser derivado (base64 de `id:secret`), entao ele nao entra na
 * conta: exigi-lo aqui marcaria como "faltando" uma configuracao que funciona.
 */
export function hotmartIsReady(): boolean {
  return Boolean(env.hotmartClientId && env.hotmartClientSecret);
}

/**
 * A PA-API so responde com as tres coisas juntas — e a tag de afiliado nao e
 * opcional: sem ela a Amazon recusa a chamada, e mesmo que aceitasse os links
 * gerados nao creditariam comissao nenhuma.
 */
export function amazonIsReady(): boolean {
  return Boolean(env.amazonAccessKey && env.amazonSecretKey && env.amazonPartnerTag);
}
