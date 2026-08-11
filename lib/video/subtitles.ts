/**
 * Geracao das legendas queimadas no video (formato ASS).
 *
 * No TikTok a legenda nao e acessibilidade, e retencao: a maioria assiste sem
 * som. Por isso mostramos poucas palavras por vez, grandes e centralizadas —
 * o estilo que todo video que performa bem usa.
 */

const CHUNK_WORDS = 3;

/**
 * Teto de caracteres por bloco de legenda.
 *
 * Tres palavras eram o unico criterio, e tres palavras curtas ou tres longas
 * nao ocupam a mesma largura: "AUTOMATICO ESCOLHENDO POR" tem 25 caracteres e
 * saiu do quadro cortado nos dois lados, num video renderizado de verdade.
 *
 * A conta: 1080 de largura menos 70 de margem de cada lado deixa 940px, e a
 * DejaVu Sans em caixa alta a 84px gasta perto de 55px por caractere. Dezoito
 * cabe com folga inclusive nas letras mais largas.
 */
const CHUNK_CHARS = 18;

export type SubtitleChunk = { text: string; start: number; end: number };

/**
 * Divide o texto da cena em blocos curtos e distribui o tempo entre eles.
 *
 * A distribuicao e proporcional ao numero de caracteres, nao igual: "e" e
 * "extraordinario" nao levam o mesmo tempo para serem falados, e dividir por
 * igual faria a legenda dessincronizar no meio da frase.
 */
export function chunkScene(text: string, start: number, duration: number): SubtitleChunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  /**
   * Fecha o bloco por palavra E por largura, o que vier primeiro.
   *
   * Uma palavra sozinha maior que o teto entra assim mesmo: nao ha onde
   * quebrar sem partir a palavra no meio, e para esse caso o proprio ASS
   * quebra a linha (ver `WrapStyle` em `buildAss`).
   */
  const groups: string[] = [];
  let atual: string[] = [];
  let largura = 0;

  for (const word of words) {
    const custo = atual.length === 0 ? word.length : word.length + 1;
    if (atual.length > 0 && (atual.length >= CHUNK_WORDS || largura + custo > CHUNK_CHARS)) {
      groups.push(atual.join(' '));
      atual = [];
      largura = 0;
    }
    atual.push(word);
    largura += atual.length === 1 ? word.length : word.length + 1;
  }
  if (atual.length > 0) groups.push(atual.join(' '));

  const totalChars = groups.reduce((sum, g) => sum + g.length, 0) || 1;
  const chunks: SubtitleChunk[] = [];
  let cursor = start;

  for (const group of groups) {
    const slice = (group.length / totalChars) * duration;
    chunks.push({ text: group, start: cursor, end: cursor + slice });
    cursor += slice;
  }

  // Absorve o arredondamento no ultimo bloco para nao sobrar buraco no fim.
  if (chunks.length > 0) chunks[chunks.length - 1].end = start + duration;
  return chunks;
}

function toAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function escapeAss(text: string): string {
  // Chaves delimitam tags de override no ASS; um `{` solto quebra a linha toda.
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, ' ').trim();
}

/** Monta um arquivo .ass completo a partir dos blocos de legenda. */
export function buildAss(chunks: SubtitleChunk[]): string {
  /**
   * `WrapStyle: 0` quebra a linha sozinho quando o texto nao cabe.
   *
   * Era 2, que significa "nunca quebrar": o texto que passava da largura saia
   * pelas bordas, cortado nos dois lados. Legenda cortada nao e feia, e
   * ilegivel — e num video mudo, que e o caso quando a narracao cai, ela e a
   * unica coisa que resta.
   */
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,84,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,4,2,70,70,420,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = chunks
    .filter((c) => c.end > c.start)
    .map(
      (c) =>
        `Dialogue: 0,${toAssTime(c.start)},${toAssTime(c.end)},Default,,0,0,0,,` +
        // Fade curto evita o "pisca" seco entre blocos.
        `{\\fad(80,80)}${escapeAss(c.text).toUpperCase()}`,
    );

  return header + lines.join('\n') + '\n';
}
