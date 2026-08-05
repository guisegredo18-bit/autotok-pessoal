/**
 * Geracao das legendas queimadas no video (formato ASS).
 *
 * No TikTok a legenda nao e acessibilidade, e retencao: a maioria assiste sem
 * som. Por isso mostramos poucas palavras por vez, grandes e centralizadas —
 * o estilo que todo video que performa bem usa.
 */

const CHUNK_WORDS = 3;

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

  const groups: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    groups.push(words.slice(i, i + CHUNK_WORDS).join(' '));
  }

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
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
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
