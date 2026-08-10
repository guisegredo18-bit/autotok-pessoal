/**
 * Formatacao de tempo para a tela.
 *
 * Vive fora de `components/ui` porque la o arquivo arrasta `next/link` junto —
 * e isto aqui e aritmetica pura, que merece ser testada sem carregar meio
 * framework.
 */

/**
 * Um intervalo em minutos, escrito como gente le.
 *
 * "Parou ha 531 min" e um numero que ninguem converte de cabeca — e a conversao
 * era justamente o que decidia se aquilo era um render de agora ou lixo da
 * noite passada.
 */
export function duration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return 'agora';
  if (minutes < 60) return `${Math.floor(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = Math.floor(minutes % 60);
    return rest > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? '1 dia' : `${days} dias`;
}
