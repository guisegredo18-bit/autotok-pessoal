import { Readable } from 'node:stream';
import { env, requireEnv } from '@/lib/env';

/**
 * Narracao (text-to-speech).
 *
 * Dois provedores:
 *  - `edge`       : Microsoft Edge TTS via `msedge-tts`. Gratuito, sem chave, e
 *                   as vozes Multilingual em pt-BR sao surpreendentemente boas.
 *                   E o padrao — da para rodar a aplicacao inteira sem pagar TTS.
 *  - `elevenlabs` : melhor entonacao e mais controle, mas cobra por caractere.
 *
 * Ambos devolvem MP3, que e o que o pipeline de video espera.
 */

export type TtsResult = { audio: Buffer; mimeType: 'audio/mpeg' };

export async function synthesize(text: string): Promise<TtsResult> {
  const clean = sanitize(text);
  if (!clean) throw new Error('Texto vazio para narracao.');

  if (env.ttsProvider === 'elevenlabs') return elevenLabs(clean);
  return edgeTts(clean);
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
