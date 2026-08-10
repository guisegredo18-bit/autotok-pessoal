/**
 * Leitura centralizada das variaveis de ambiente.
 *
 * A regra: nada explode na importacao do modulo. Cada integracao pode faltar
 * de forma independente, e quem precisa dela chama `requireEnv` na hora do
 * uso. Assim o painel continua abrindo com a configuracao pela metade — que e
 * exatamente o estado de quem acabou de instalar e ainda vai preencher as
 * chaves pela tela.
 *
 * Sao apenas tres variaveis obrigatorias (banco, senha e segredo). Tudo que e
 * chave de integracao mora no banco, cifrado, preenchido pela tela de
 * Configuracoes — veja lib/secrets.ts.
 */

type EnvSource = Record<string, string | undefined>;

/**
 * Endereco publico da aplicacao.
 *
 * Derivar da Vercel quando APP_URL nao esta definida existe por um motivo
 * pratico: quem instala pelo celular so descobre o dominio DEPOIS do primeiro
 * deploy.
 */
export function resolveAppUrl(source: EnvSource = process.env): string {
  if (source.APP_URL) return source.APP_URL.replace(/\/$/, '');

  const vercel = source.VERCEL_PROJECT_PRODUCTION_URL || source.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',

  appUrl: resolveAppUrl(),
  appPassword: process.env.APP_PASSWORD ?? '',
  authSecret: process.env.AUTH_SECRET ?? '',

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
  hotmartAuthUrl: (process.env.HOTMART_AUTH_URL || 'https://api-sec-vlc.hotmart.com').replace(
    /\/$/,
    '',
  ),
  hotmartApiUrl: (process.env.HOTMART_API_URL || 'https://developers.hotmart.com').replace(
    /\/$/,
    '',
  ),

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
      `Configuracao faltando: ${missing.join(', ')}. Preencha em Configuracoes > Chaves. ` +
        'Se voce ja preencheu, confira se o AUTH_SECRET nao mudou — sem ele as chaves ' +
        'guardadas nao sao decifradas.',
    );
  }
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

/** Quais integracoes estao prontas — usado pela tela de configuracoes. */
export function integrationStatus() {
  return {
    database: Boolean(env.databaseUrl),
    hotmart: hotmartIsReady(),
    amazon: amazonIsReady(),
  };
}
