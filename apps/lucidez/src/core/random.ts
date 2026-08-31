/**
 * Sorteio.
 *
 * Fica no nucleo, e nao junto dos jogos, por um motivo pratico: embaralhar mal
 * e um bug silencioso. Um baralho de pares que sai em ordem, ou uma sequencia
 * de estimulos previsivel, nao quebra nada na tela — so faz o teste medir
 * outra coisa. Aqui da para testar.
 */

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  // Fisher-Yates: cada posicao i troca com uma posicao sorteada em [0, i].
  // A variante ingenua (sortear em [0, n) a cada passo) nao gera todas as
  // permutacoes com a mesma probabilidade.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
