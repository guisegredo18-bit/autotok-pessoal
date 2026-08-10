import { createHash } from 'node:crypto';
import { parseAmountCents } from '@/lib/money';
import type { NormalizedCommission } from '@/lib/afiliados/types';

/**
 * Importacao do relatorio de ganhos do Amazon Associates (CSV).
 *
 * Este arquivo existe por uma limitacao que nao tem contorno: a PA-API e de
 * catalogo e nao expoe quanto voce ganhou. O numero real so sai pelo relatorio
 * do painel do Associates — "Relatorios > Ganhos > Baixar". Entao a comissao
 * da Amazon entra por aqui, e o painel prefere pedir um upload uma vez por mes
 * a estimar um valor que nunca vai bater com o extrato.
 *
 * O parser e deliberadamente tolerante: o mesmo relatorio sai com colunas em
 * portugues ou ingles, separado por virgula ou ponto-e-virgula, com numero no
 * formato brasileiro ou americano — e quem baixa pelo celular nao tem como
 * conferir nada disso antes de enviar.
 */

/** Uma tabela crua: linhas de celulas, ja sem aspas. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sep = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (quoted) {
      if (char === '"') {
        // Aspas dobradas dentro de campo entre aspas representam uma aspa.
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === sep) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((line) => line.some((value) => value.trim() !== ''));
}

/**
 * Qual separador o arquivo usa.
 *
 * Conta ocorrencias fora de aspas na primeira linha util: no relatorio em
 * portugues o separador costuma ser ponto-e-virgula justamente porque a
 * virgula ja e o separador decimal.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const counts = [',', ';', '\t'].map((sep) => {
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (char === sep && !quoted) count++;
    }
    return { sep, count };
  });

  return counts.sort((a, b) => b.count - a.count)[0].count > 0
    ? counts.sort((a, b) => b.count - a.count)[0].sep
    : ',';
}

/** Nomes que cada coluna assume nos relatorios em portugues e em ingles. */
const COLUMNS = {
  earnings: [
    'ad fees',
    'taxas de publicidade',
    'taxa de publicidade',
    'earnings',
    'ganhos',
    'comissao',
    'comissão',
    'commission',
    'receita de publicidade',
  ],
  date: [
    'date shipped',
    'data de envio',
    'date',
    'data',
    'day',
    'dia',
    'período',
    'periodo',
  ],
  asin: ['asin', 'asin/isbn', 'produto (asin)'],
  name: ['name', 'nome', 'title', 'titulo', 'título', 'product name', 'nome do produto'],
  category: ['category', 'categoria'],
  quantity: ['items shipped', 'produtos enviados', 'quantity', 'quantidade', 'qty'],
  price: ['price', 'preço', 'preco', 'revenue', 'receita'],
  currency: ['currency', 'moeda'],
  tracking: ['tracking id', 'id de rastreamento', 'id de acompanhamento'],
} as const;

type ColumnKey = keyof typeof COLUMNS;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()"]/g, '')
    .trim();
}

/** Mapeia nome de coluna -> indice, aceitando os dois idiomas. */
export function mapHeaders(header: string[]): Partial<Record<ColumnKey, number>> {
  const found: Partial<Record<ColumnKey, number>> = {};

  header.forEach((raw, index) => {
    const name = normalizeHeader(raw);
    for (const [key, aliases] of Object.entries(COLUMNS) as [ColumnKey, readonly string[]][]) {
      if (found[key] !== undefined) continue;
      if (aliases.includes(name)) found[key] = index;
    }
  });

  return found;
}

/**
 * Onde comeca a tabela de verdade.
 *
 * O relatorio da Amazon costuma vir com uma ou duas linhas de titulo e periodo
 * antes do cabecalho. Procurar a primeira linha que contem a coluna de ganhos
 * resolve sem depender de quantas linhas de enfeite vieram desta vez.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const mapped = mapHeaders(rows[i]);
    if (mapped.earnings !== undefined) return i;
  }
  return -1;
}

/**
 * Data no formato do relatorio.
 *
 * `dayFirst` vem do idioma do cabecalho: "03/04/2024" e 3 de abril no
 * relatorio em portugues e 4 de marco no em ingles. Adivinhar pelo valor
 * funciona so ate o dia 12 de cada mes — depois disso a importacao inteira sai
 * com as datas trocadas, e ninguem percebe ate a hora de declarar.
 */
export function parseDate(raw: string, dayFirst: boolean): Date | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(text);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;

    // Um valor acima de 12 so pode ser dia, qualquer que seja o idioma.
    const day = first > 12 ? first : second > 12 ? second : dayFirst ? first : second;
    const month = first > 12 ? second : second > 12 ? first : dayFirst ? second : first;
    return utc(year, month, day);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utc(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** O cabecalho esta em portugues? Decide a leitura das datas com barra. */
function headerIsPortuguese(header: string[]): boolean {
  const joined = header.map(normalizeHeader).join(' ');
  return /taxas de publicidade|data de envio|produtos enviados|categoria|ganhos/.test(joined);
}

export type ReportResult = {
  rows: NormalizedCommission[];
  warnings: string[];
};

/**
 * Le o CSV inteiro e devolve as comissoes.
 *
 * `defaultCurrency` e usada quando o relatorio nao traz coluna de moeda, que e
 * o caso comum: o relatorio e sempre da moeda daquele marketplace, e quem sabe
 * qual marketplace e o painel, nao o arquivo.
 */
export function parseEarningsReport(text: string, defaultCurrency = 'BRL'): ReportResult {
  const warnings: string[] = [];
  const table = parseCsv(text);

  if (table.length === 0) return { rows: [], warnings: ['O arquivo esta vazio.'] };

  const headerRow = findHeaderRow(table);
  if (headerRow < 0) {
    return {
      rows: [],
      warnings: [
        'Nao encontrei a coluna de ganhos no arquivo. Baixe o relatorio em ' +
          'Relatorios > Ganhos > Download, sem editar as colunas.',
      ],
    };
  }

  const header = table[headerRow];
  const columns = mapHeaders(header);
  const dayFirst = headerIsPortuguese(header);

  if (columns.date === undefined) {
    warnings.push('O relatorio nao tem coluna de data — usei a data de hoje nas linhas.');
  }

  const rows: NormalizedCommission[] = [];
  // Chaves repetidas acontecem: duas vendas do mesmo produto, no mesmo dia,
  // pelo mesmo valor. O contador desempata pela ordem de aparicao, que e
  // estavel entre downloads do mesmo periodo — entao reimportar o arquivo
  // atualiza as linhas em vez de duplicar.
  const seen = new Map<string, number>();

  for (let i = headerRow + 1; i < table.length; i++) {
    const line = table[i];
    const cell = (key: ColumnKey): string => {
      const index = columns[key];
      return index === undefined ? '' : (line[index] ?? '').trim();
    };

    const amountCents = parseAmountCents(cell('earnings'));
    if (amountCents == null) continue;
    // Linhas de total ("Total geral") entram como ganho sem produto e dobrariam
    // a soma. Sem ASIN e sem nome nao ha o que promover, entao nao ha o que
    // guardar.
    if (amountCents === 0 && !cell('asin')) continue;

    const occurredAt = columns.date === undefined ? new Date() : parseDate(cell('date'), dayFirst);
    if (!occurredAt) {
      warnings.push(`Linha ${i + 1}: data "${cell('date')}" nao reconhecida — linha ignorada.`);
      continue;
    }

    const asin = cell('asin') || null;
    const name = cell('name') || asin || 'Produto sem nome';
    const quantity = Math.max(1, Math.round(Number(cell('quantity').replace(',', '.')) || 1));
    const currency = (cell('currency') || defaultCurrency).toUpperCase();

    const base = [
      occurredAt.toISOString().slice(0, 10),
      asin ?? name,
      cell('tracking'),
      String(amountCents),
    ].join('|');
    const repeat = (seen.get(base) ?? 0) + 1;
    seen.set(base, repeat);

    rows.push({
      source: 'amazon',
      externalId: `csv:${createHash('sha1').update(`${base}|${repeat}`).digest('hex').slice(0, 24)}`,
      productExternalId: asin,
      productName: name,
      category: cell('category') || null,
      quantity,
      // O relatorio de ganhos so lista o que ja foi enviado e faturado; uma
      // devolucao aparece como valor negativo, e negativo e estorno.
      status: amountCents < 0 ? 'refunded' : 'approved',
      amountCents,
      currency,
      occurredAt,
      raw: Object.fromEntries(header.map((key, index) => [key, line[index] ?? ''])),
    });
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push('Nenhuma linha com ganho foi encontrada no arquivo.');
  }

  return { rows, warnings };
}
