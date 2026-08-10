import { createHash, createHmac } from 'node:crypto';

/**
 * Assinatura AWS Signature Version 4 para a Product Advertising API 5.0.
 *
 * A PA-API nao aceita chave na query nem token de portador: cada requisicao
 * precisa vir assinada com a sua secret key. O calculo e chato mas fechado —
 * por isso ele vive sozinho neste arquivo, como funcao pura de (chaves,
 * momento, corpo) para headers, testavel sem tocar a rede.
 *
 * Referencia: https://webservices.amazon.com/paapi5/documentation/
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 'ProductAdvertisingAPI';

/** Os unicos headers que a Amazon exige na assinatura, em ordem alfabetica. */
const SIGNED_HEADERS = ['content-encoding', 'host', 'x-amz-date', 'x-amz-target'];

export type SignInput = {
  accessKey: string;
  secretKey: string;
  region: string;
  host: string;
  /** Ex: `/paapi5/searchitems`. */
  path: string;
  /** Ex: `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems`. */
  target: string;
  /** Corpo ja serializado — a assinatura cobre exatamente estes bytes. */
  payload: string;
  now?: Date;
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/** `20240115T103045Z` — o formato que a AWS exige, sem separadores. */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * A chave de assinatura, derivada em quatro passos (data, regiao, servico,
 * sufixo).
 *
 * A derivacao existe para limitar o estrago: uma chave derivada vazada serve
 * no maximo por um dia, numa regiao e num servico. Exportada porque e o
 * pedaco que da para conferir contra o vetor de teste publicado pela AWS —
 * assinatura errada so se manifesta como "signature does not match", que nao
 * diz qual dos quatro passos saiu torto.
 */
export function deriveSigningKey(
  secretKey: string,
  day: string,
  region: string,
  service = SERVICE,
): Buffer {
  const dateKey = hmac(`AWS4${secretKey}`, day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

/**
 * Monta os headers assinados.
 *
 * Devolve tudo pronto para o `fetch`: quem chama nao precisa saber que existe
 * canonical request, string to sign ou chave derivada por data.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const now = input.now ?? new Date();
  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);

  const headers: Record<string, string> = {
    'content-encoding': 'amz-1.0',
    host: input.host,
    'x-amz-date': stamp,
    'x-amz-target': input.target,
  };

  const canonicalHeaders = SIGNED_HEADERS.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = SIGNED_HEADERS.join(';');

  // Query vazia: a PA-API manda tudo no corpo. O `\n` extra e o separador da
  // query, e omiti-lo e o erro classico que gera "signature does not match".
  const canonicalRequest = [
    'POST',
    input.path,
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(input.payload),
  ].join('\n');

  const scope = `${day}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256(canonicalRequest)].join('\n');

  const signingKey = deriveSigningKey(input.secretKey, day, input.region);
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return {
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    Authorization:
      `${ALGORITHM} Credential=${input.accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
