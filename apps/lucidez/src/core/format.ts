/** Formatacao para leitura em portugues. */

/** Escolhe singular ou plural. Evita o "1 sessão(ões)" que aparece quando se
 *  tenta resolver plural com parenteses. */
export function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

/** Numero com virgula decimal, como se escreve em portugues. */
export function num(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** AAAA-MM-DD para DD/MM. */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}
