import { env } from '@/lib/env';

/**
 * Notificacao push no iPhone via ntfy.sh.
 *
 * Escolhido por ser o caminho mais curto entre "video pronto" e o seu celular:
 * app gratuito na App Store, sem cadastro, sem servidor proprio. Basta assinar
 * o topico definido em NTFY_TOPIC. Como qualquer pessoa que souber o nome do
 * topico recebe as mensagens, use um nome longo e aleatorio.
 */

export type PushOptions = {
  title: string;
  message: string;
  /** 1 = silencioso, 3 = padrao, 5 = urgente. */
  priority?: number;
  /** Abre esta URL ao tocar na notificacao. */
  url?: string;
  tags?: string[];
};

export async function push(options: PushOptions): Promise<void> {
  if (!env.ntfyTopic) return;

  const headers: Record<string, string> = {
    Title: asciiHeader(options.title),
    Priority: String(options.priority ?? 3),
  };
  if (options.tags?.length) headers.Tags = options.tags.join(',');
  if (options.url) headers.Click = options.url;

  try {
    await fetch(`${env.ntfyServer}/${env.ntfyTopic}`, {
      method: 'POST',
      headers,
      body: options.message,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Notificacao e conveniencia: se o ntfy estiver fora do ar, o job que
    // chamou aqui nao pode falhar por causa disso.
  }
}

/** Cabecalhos HTTP nao aceitam acento; o corpo da mensagem aceita. */
function asciiHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove os acentos separados pelo NFD
    .replace(/[^\x20-\x7e]/g, '');
}
