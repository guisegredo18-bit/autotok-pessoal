/**
 * Para quem o video fala.
 *
 * Ate aqui o projeto inteiro assumia Brasil: o prompt dizia "especialista no
 * mercado brasileiro", a regra de escrita dizia "Portugues do Brasil" e a voz
 * padrao era pt-BR. Nenhum desses tres estava ligado a configuracao de idioma
 * — ela existia e nao fazia nada, o que e pior do que nao existir: dava a
 * impressao de que bastava trocar um campo.
 *
 * Vender para os Estados Unidos nao e uma questao de moeda do produto. E o
 * roteiro em ingles, narrado com voz americana, escrito por alguem que conhece
 * aquele publico. Este arquivo e o que torna isso uma escolha de tela.
 */

export type MarketCode = 'pt-BR' | 'en-US';

export type Market = {
  code: MarketCode;
  label: string;
  /** Substitui a linha de especialidade do prompt de sistema. */
  expertise: string;
  /** Substitui a primeira regra de escrita. */
  writingRule: string;
  /** Voz padrao do Edge TTS para este mercado. */
  voice: string;
  /** Moeda que o publico daquele mercado enxerga como "normal". */
  currency: string;
  /** Como pedir a legenda e as hashtags. */
  captionRule: string;
};

export const MARKETS: Record<MarketCode, Market> = {
  'pt-BR': {
    code: 'pt-BR',
    label: 'Brasil (portugues)',
    expertise: 'especialista no mercado brasileiro',
    writingRule:
      '- Portugues do Brasil, informal, como uma pessoa falando com um amigo.',
    voice: 'pt-BR-ThalitaMultilingualNeural',
    currency: 'BRL',
    captionRule: '- Escreva a legenda e as hashtags em portugues do Brasil.',
  },
  'en-US': {
    code: 'en-US',
    label: 'Estados Unidos (ingles)',
    expertise: 'specialized in the United States market',
    writingRule:
      '- American English, casual and conversational, like talking to a friend. ' +
      'Never write in Portuguese — the audience does not speak it.',
    // Voz multilingue da Microsoft, equivalente americana da Thalita: mesma
    // qualidade e mesmo caminho de codigo, so muda o idioma.
    voice: 'en-US-AvaMultilingualNeural',
    currency: 'USD',
    captionRule: '- Write the caption and the hashtags in American English.',
  },
};

export const DEFAULT_MARKET: MarketCode = 'pt-BR';

/** Le a configuracao aceitando so o que existe de fato. */
export function parseMarket(value: unknown): MarketCode {
  const key = String(value ?? '');
  return key in MARKETS ? (key as MarketCode) : DEFAULT_MARKET;
}

export function market(code: unknown): Market {
  return MARKETS[parseMarket(code)];
}

/**
 * Qual voz usar, dado o mercado e o que estiver configurado.
 *
 * A regra e uma so: **a voz precisa falar o idioma do roteiro**. Uma voz
 * brasileira lendo texto em ingles sai com sotaque de leitura fonetica, e um
 * video assim nao vende para americano nenhum.
 *
 * Uma voz configurada a mao so e respeitada se for do idioma certo. Ignorar a
 * preferencia parece rude, mas a alternativa e entregar o video errado em
 * silencio — e a preferencia provavelmente ficou para tras quando o mercado
 * mudou, nao foi escolhida para este caso.
 */
export function voiceForMarket(code: unknown, configured?: string): string {
  const alvo = market(code);
  if (!configured) return alvo.voice;

  const idiomaDaVoz = /^([a-z]{2}-[A-Z]{2})/.exec(configured)?.[1];
  return idiomaDaVoz === alvo.code ? configured : alvo.voice;
}
