import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env, requireEnv } from '@/lib/env';
import { ffmpeg } from '@/lib/video/ffmpeg';
import { isModelNotFound, pickTtsModel } from '@/lib/ai/gemini-models';

/**
 * Narracao (text-to-speech).
 *
 * Quatro provedores:
 *  - `edge`       : Microsoft Edge TTS. Gratuito, sem chave, e as vozes
 *                   Multilingual em pt-BR sao surpreendentemente boas. Padrao.
 *  - `google`     : a voz do Google Tradutor. Tambem gratuita e sem chave, mais
 *                   robotica, e limitada a trechos curtos — por isso o texto e
 *                   fatiado e as partes sao emendadas.
 *  - `gemini`     : a mesma chave que escreve os roteiros. Tem cota diaria, mas
 *                   e o unico gratuito que e API publica de verdade.
 *  - `elevenlabs` : melhor entonacao e mais controle, mas cobra por caractere.
 *
 * Com `edge`, os outros gratuitos entram sozinhos se a Microsoft recusar. Isso
 * existe porque ja aconteceu duas vezes: a Microsoft passou a exigir um token
 * novo no handshake, e depois os dois endpoints nao oficiais passaram a recusar
 * conexao vinda de datacenter — que e de onde a Vercel chama. Sem alternativa
 * configurada, o video saia mudo ou nao saia.
 *
 * A ordem nao e por qualidade, e por custo: os dois sem chave primeiro, o que
 * gasta cota depois. Nao faz sentido consumir cota enquanto o ilimitado
 * responde.
 *
 * Todos devolvem MP3, que e o que o pipeline de video espera.
 */

export type TtsResult = { audio: Buffer; mimeType: 'audio/mpeg' };

export async function synthesize(text: string): Promise<TtsResult> {
  const clean = sanitize(text);
  if (!clean) throw new Error('Texto vazio para narracao.');

  if (env.ttsProvider === 'elevenlabs') return elevenLabs(clean);
  if (env.ttsProvider === 'gemini') return geminiTts(clean);
  if (env.ttsProvider === 'google') return googleTts(clean);

  /**
   * Cascata do provedor padrao.
   *
   * Edge e a voz do Google sao os dois gratuitos sem chave — e sao endpoints
   * nao oficiais, que recusam IP de servidor com alguma frequencia. Quando os
   * dois caem ao mesmo tempo (o caso de quem renderiza na Vercel), a narracao
   * sumia inteira.
   *
   * O Gemini entra por ultimo e so quando ha chave: e a mesma que ja escreve
   * os roteiros, entao para quase todo mundo ele existe sem configurar nada.
   * Por ultimo porque tem cota diaria e os outros dois nao — nao faz sentido
   * gastar cota enquanto o gratuito ilimitado responde.
   */
  const tentativas: { nome: string; narra: () => Promise<TtsResult> }[] = [
    { nome: 'Edge TTS', narra: () => edgeTts(clean) },
    { nome: 'Voz do Google', narra: () => googleTts(clean) },
  ];
  if (env.geminiApiKey) {
    tentativas.push({ nome: 'Gemini', narra: () => geminiTts(clean) });
  }

  const motivos: string[] = [];
  for (const tentativa of tentativas) {
    try {
      const result = await tentativa.narra();
      if (motivos.length > 0) {
        console.warn(`${motivos.join('; ')} — narrei pelo ${tentativa.nome}.`);
      }
      return result;
    } catch (err) {
      motivos.push(`${tentativa.nome}: ${describeTtsError(err)}`);
    }
  }

  throw new Error(`Nao consegui narrar. ${motivos.join('. ')}.`);
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

// --- Google Gemini (gratis, com a chave que ja escreve os roteiros) ---------

/**
 * Narracao pelo Gemini.
 *
 * O que o torna interessante aqui nao e a qualidade — e o endereco. Edge e a
 * voz do Google Tradutor sao endpoints nao oficiais e recusam conexao vinda de
 * datacenter; este e uma API publica de verdade, que responde igual de onde
 * quer que a chamada saia. Para quem renderiza na Vercel, e a diferenca entre
 * ter voz e nao ter.
 *
 * A chave e a mesma que ja escreve os roteiros, entao para quase todo mundo o
 * provedor ja esta configurado sem precisar configurar nada.
 */

/** Voz multilingue: fala o idioma do texto que recebe, sem parametro de locale. */
const GEMINI_VOICE = 'Kore';
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * Taxa de amostragem declarada pela API, em `audio/L16;codec=pcm;rate=24000`.
 *
 * Errar este numero nao gera erro: gera uma narracao acelerada ou arrastada, e
 * dessincronizada da legenda, que e pior do que falhar. O padrao de 24 kHz e o
 * que o modelo devolve hoje; ler do cabecalho e o que mantem isso certo se
 * mudarem.
 */
export function pcmRate(mimeType: string | undefined): number {
  const achado = /rate=(\d+)/i.exec(mimeType ?? '');
  const rate = achado ? Number(achado[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
}

/**
 * Acha o audio na resposta — ou explica, em portugues, por que nao ha audio.
 *
 * Uma API que responde 200 sem audio e o caso comum aqui: cota estourada,
 * texto recusado por seguranca, modelo que so devolve texto. Cada um desses
 * chegava como "undefined" se ninguem olhasse, e "undefined" nao conserta
 * nada.
 */
export function readInlineAudio(payload: unknown): { data: string; mimeType: string } {
  const raiz = (payload ?? {}) as Record<string, any>;

  if (raiz.error?.message) throw new Error(String(raiz.error.message).slice(0, 200));

  const bloqueio = raiz.promptFeedback?.blockReason;
  if (bloqueio) throw new Error(`o Gemini recusou o texto (${bloqueio}).`);

  const candidato = raiz.candidates?.[0];
  const partes: any[] = candidato?.content?.parts ?? [];

  for (const parte of partes) {
    // A API REST responde em camelCase; aceitar snake_case tambem custa uma
    // linha e evita uma quebra boba se a forma mudar.
    const inline = parte?.inlineData ?? parte?.inline_data;
    if (inline?.data) {
      return { data: String(inline.data), mimeType: String(inline.mimeType ?? inline.mime_type ?? '') };
    }
  }

  const texto = partes.find((p) => typeof p?.text === 'string')?.text;
  if (texto) throw new Error(`o Gemini respondeu texto em vez de audio: ${String(texto).slice(0, 120)}`);

  const motivo = candidato?.finishReason;
  throw new Error(
    motivo
      ? `o Gemini terminou sem audio (${motivo}).`
      : 'o Gemini respondeu sem audio e sem motivo.',
  );
}

/**
 * PCM cru vira MP3, que e o unico formato que o pipeline de video aceita.
 *
 * Exportada para teste: errar os parametros do formato nao gera erro, gera uma
 * narracao em outra velocidade e fora de sincronia com a legenda — e isso so
 * aparece ouvindo, ou num teste que confira a duracao.
 */
export async function pcmToMp3(pcm: Buffer, rate: number): Promise<Buffer> {
  if (pcm.length === 0) throw new Error('o Gemini devolveu audio vazio.');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autotok-gemini-'));
  try {
    await fs.writeFile(path.join(dir, 'voz.pcm'), pcm);
    // O PCM nao tem cabecalho: formato, taxa e canais precisam ser informados,
    // senao o ffmpeg adivinha errado e o audio sai em outra velocidade.
    await ffmpeg(
      [
        '-y', '-f', 's16le', '-ar', String(rate), '-ac', '1',
        '-i', 'voz.pcm', '-c:a', 'libmp3lame', 'voz.mp3',
      ],
      dir,
    );
    return await fs.readFile(path.join(dir, 'voz.mp3'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Modelo resolvido nesta execucao, para nao listar de novo a cada cena. */
let ttsModelResolved: string | null = null;

async function geminiTts(text: string): Promise<TtsResult> {
  requireEnv('geminiApiKey');

  try {
    return await geminiTtsCom(text, ttsModelResolved ?? (env.geminiTtsModel || GEMINI_TTS_MODEL));
  } catch (err) {
    /**
     * Todo modelo de voz do Gemini e "preview" hoje, e preview e aposentado sem
     * aviso. Quando isso acontecer, perguntar ao Google quais existem custa uma
     * chamada e evita que a narracao pare ate alguem editar uma string.
     */
    if (!isModelNotFound(err instanceof Error ? err.message : String(err))) throw err;

    const descoberto = await descobrirModeloTts();
    console.warn(`[autotok] Modelo de narracao trocado para "${descoberto}".`);
    ttsModelResolved = descoberto;
    return geminiTtsCom(text, descoberto);
  }
}

/** Pergunta ao Google quais modelos de voz a conta tem. */
async function descobrirModeloTts(): Promise<string> {
  const res = await fetch(`${env.geminiBaseUrl}/models?key=${env.geminiApiKey}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`nao consegui listar os modelos de voz (HTTP ${res.status}).`);

  const json: any = await res.json();
  const nomes: string[] = (json?.models ?? []).map((m: any) => String(m?.name ?? ''));
  const escolhido = pickTtsModel(nomes.filter(Boolean));
  if (!escolhido) throw new Error('a sua conta do Gemini nao tem nenhum modelo de voz.');
  return escolhido;
}

async function geminiTtsCom(text: string, model: string): Promise<TtsResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // No cabecalho, e nao na query: chave em URL vaza para log de proxy.
        'x-goog-api-key': env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: env.geminiTtsVoice || GEMINI_VOICE },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    throw new Error(`o Gemini respondeu ${res.status}. ${detalhe.slice(0, 200)}`);
  }

  const inline = readInlineAudio(await res.json());
  const audio = await pcmToMp3(Buffer.from(inline.data, 'base64'), pcmRate(inline.mimeType));
  return { audio, mimeType: 'audio/mpeg' };
}
