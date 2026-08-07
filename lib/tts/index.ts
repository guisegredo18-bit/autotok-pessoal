import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env, requireEnv } from '@/lib/env';
import { ffmpeg } from '@/lib/video/ffmpeg';

/**
 * Narracao (text-to-speech).
 *
 * Tres provedores:
 *  - `edge`       : Microsoft Edge TTS. Gratuito, sem chave, e as vozes
 *                   Multilingual em pt-BR sao surpreendentemente boas. Padrao.
 *  - `google`     : a voz do Google Tradutor. Tambem gratuita e sem chave, mais
 *                   robotica, e limitada a trechos curtos — por isso o texto e
 *                   fatiado e as partes sao emendadas.
 *  - `elevenlabs` : melhor entonacao e mais controle, mas cobra por caractere.
 *
 * Com `edge`, o Google entra sozinho se a Microsoft recusar. Isso existe porque
 * ja aconteceu: a Microsoft passou a exigir um token novo no handshake e a
 * narracao parou de um dia para o outro — sem nada errado do lado de ca, e sem
 * nenhuma alternativa configurada, o app inteiro parou junto. Um segundo
 * caminho gratuito e o que impede que a proxima mudanca deles tenha o mesmo
 * efeito.
 *
 * Todos devolvem MP3, que e o que o pipeline de video espera.
 */

export type TtsResult = { audio: Buffer; mimeType: 'audio/mpeg' };

export async function synthesize(text: string): Promise<TtsResult> {
  const clean = sanitize(text);
  if (!clean) throw new Error('Texto vazio para narracao.');

  if (env.ttsProvider === 'elevenlabs') return elevenLabs(clean);
  if (env.ttsProvider === 'google') return googleTts(clean);

  try {
    return await edgeTts(clean);
  } catch (err) {
    const motivo = describeTtsError(err);
    try {
      const result = await googleTts(clean);
      console.warn(`Edge TTS falhou (${motivo}); narrei pela voz do Google.`);
      return result;
    } catch (fallbackErr) {
      throw new Error(
        `Nao consegui narrar. Edge TTS: ${motivo}. ` +
          `Voz do Google: ${describeTtsError(fallbackErr)}.`,
      );
    }
  }
}

/**
 * Descreve uma falha de narracao em portugues legivel.
 *
 * O `msedge-tts` rejeita com uma string montada como `"Connect Error: " + evento`,
 * e um evento de WebSocket vira `[object Object]`. Isso chegou na tela do
 * celular exatamente assim — uma mensagem que nao diz nada a ninguem.
 */
export function describeTtsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/Connect Error|ECONNREFUSED|ENOTFOUND|handshake|401|403/i.test(raw)) {
    return 'a Microsoft recusou a conexao (eles mudam o protocolo sem aviso)';
  }
  if (/timeout/i.test(raw)) return 'tempo esgotado esperando o audio';
  if (/\[object Object\]/.test(raw)) return 'falha de conexao sem detalhe';
  return raw.slice(0, 200);
}

/**
 * O TTS le literalmente o que recebe. Emoji e markdown viram ruido audivel
 * ("asterisco asterisco"), entao limpamos antes de sintetizar.
 */
function sanitize(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Microsoft Edge TTS (gratis) -------------------------------------------

async function edgeTts(text: string): Promise<TtsResult> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata(env.ttsVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const result: any = tts.toStream(text);
  // A biblioteca mudou a assinatura entre versoes: umas devolvem o Readable
  // direto, outras um objeto { audioStream, metadataStream }. Aceitamos os dois
  // para nao quebrar num `npm update`.
  const stream: Readable = result?.audioStream ?? result;
  if (!stream || typeof stream.on !== 'function') {
    throw new Error('msedge-tts devolveu um formato inesperado.');
  }

  const audio = await collect(stream);
  if (audio.length === 0) {
    throw new Error('O Edge TTS devolveu audio vazio. Verifique o nome da voz em TTS_VOICE.');
  }
  return { audio, mimeType: 'audio/mpeg' };
}

function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error('Timeout na narracao (60s).')), 60_000);
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// --- Voz do Google Tradutor (gratis) ---------------------------------------

/** O endpoint recusa textos longos, entao o limite e do servico, nao nosso. */
const GOOGLE_CHUNK_CHARS = 190;

/**
 * Divide o texto em pedacos que cabem numa chamada, sem cortar palavra.
 *
 * Cortar no meio de uma palavra nao daria erro — daria uma narracao que
 * pronuncia metades, que e pior, porque parece defeito de voz e nao de codigo.
 */
export function chunkForTts(text: string, limit = GOOGLE_CHUNK_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const parts: string[] = [];
  let atual = '';

  for (const palavra of clean.split(/\s+/)) {
    // Palavra sozinha maior que o limite: parte no seco, porque nao ha
    // fronteira melhor disponivel.
    if (palavra.length > limit) {
      if (atual) {
        parts.push(atual);
        atual = '';
      }
      for (let i = 0; i < palavra.length; i += limit) {
        parts.push(palavra.slice(i, i + limit));
      }
      continue;
    }

    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (candidato.length > limit) {
      parts.push(atual);
      atual = palavra;
    } else {
      atual = candidato;
    }
  }

  if (atual) parts.push(atual);
  return parts;
}

/** Locale da voz configurada — `pt-BR-ThalitaNeural` vira `pt-BR`. */
export function ttsLanguage(voice: string): string {
  return /^([a-z]{2}-[A-Z]{2})/.exec(voice)?.[1] ?? 'pt-BR';
}

/**
 * O endereco entra como parametro para que o caminho de rede possa ser
 * exercitado contra um servidor local — inclusive os casos de recusa, que sao
 * justamente os que importam aqui.
 */
export async function googleTts(
  text: string,
  baseUrl: string = env.googleTtsUrl,
): Promise<TtsResult> {
  const parts = chunkForTts(text);
  const lang = ttsLanguage(env.ttsVoice);
  const buffers: Buffer[] = [];

  for (let i = 0; i < parts.length; i++) {
    const params = new URLSearchParams({
      ie: 'UTF-8',
      client: 'tw-ob',
      tl: lang,
      total: String(parts.length),
      idx: String(i),
      textlen: String(parts[i].length),
      q: parts[i],
    });

    const res = await fetch(`${baseUrl}?${params}`, {
      headers: {
        // Sem User-Agent de navegador o endpoint devolve 404.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`o Google respondeu ${res.status} no trecho ${i + 1}/${parts.length}`);
    }

    const chunk = Buffer.from(await res.arrayBuffer());
    if (chunk.length === 0) {
      throw new Error(`trecho ${i + 1}/${parts.length} veio vazio`);
    }
    buffers.push(chunk);
  }

  return { audio: await joinMp3(buffers), mimeType: 'audio/mpeg' };
}

/**
 * Junta os trechos num MP3 unico, pelo ffmpeg.
 *
 * Colar os bytes parecia bastar — a duracao ate sai certa — mas o decodificador
 * reclama "Header missing" em cada emenda e descarta o quadro dali. Com um
 * trecho a cada 190 caracteres, isso seria um engasgo a cada duas frases. O
 * demuxer `concat` respeita a fronteira dos quadros e o audio sai limpo.
 */
async function joinMp3(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 1) return parts[0];

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autotok-tts-'));
  try {
    const nomes: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const nome = `parte_${i}.mp3`;
      await fs.writeFile(path.join(dir, nome), parts[i]);
      nomes.push(nome);
    }

    await fs.writeFile(
      path.join(dir, 'lista.txt'),
      nomes.map((n) => `file '${n}'`).join('\n') + '\n',
    );
    await ffmpeg(
      ['-y', '-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'junto.mp3'],
      dir,
    );

    return await fs.readFile(path.join(dir, 'junto.mp3'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- ElevenLabs (pago) ------------------------------------------------------

async function elevenLabs(text: string): Promise<TtsResult> {
  requireEnv('elevenLabsApiKey', 'elevenLabsVoiceId');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${env.elevenLabsVoiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.elevenLabsApiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35 },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!res.ok) {
    throw new Error(`ElevenLabs respondeu ${res.status}: ${await res.text()}`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
}
