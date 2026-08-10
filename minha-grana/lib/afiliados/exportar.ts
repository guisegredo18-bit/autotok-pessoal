import type { Commission } from '@/lib/db/schema';

/**
 * Exportacao das comissoes em CSV.
 *
 * O destino declarado e o contador (apoio ao carne-leao), entao duas escolhas
 * seguem dessa finalidade e nao da conveniencia da tela:
 *
 * 1. O valor sai na moeda original E em dolar, com a cotacao usada e a data do
 *    fato gerador. Uma planilha so com o total convertido nao permite conferir
 *    nada nem refazer a conta com outra cotacao.
 * 2. O separador e ponto-e-virgula e o decimal e virgula — e o que o Excel em
 *    portugues abre sem a etapa de "importar dados" que ninguem acerta de
 *    primeira.
 */

const HEADER = [
  'Data',
  'Fonte',
  'Produto',
  'Codigo do produto',
  'Categoria',
  'Quantidade',
  'Status',
  'Valor',
  'Moeda',
  'Cotacao (1 USD)',
  'Valor em USD',
  'Identificador',
];

const STATUS_LABEL: Record<string, string> = {
  approved: 'aprovada',
  pending: 'aguardando',
  refunded: 'estornada',
  cancelled: 'cancelada',
};

/** Numero com virgula decimal, sem separador de milhar (o Excel agrupa sozinho). */
function decimal(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function cell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  // Aspas sempre: o nome do produto vem cheio de ponto-e-virgula e quebra de
  // linha, e uma unica linha malformada desloca todas as colunas seguintes.
  return `"${text.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}

export function toCsv(rows: Commission[]): string {
  const lines = [HEADER.map(cell).join(';')];

  for (const row of rows) {
    lines.push(
      [
        cell(row.occurredAt.toISOString().slice(0, 10)),
        cell(row.source),
        cell(row.productName),
        cell(row.productExternalId),
        cell(row.category),
        cell(row.quantity),
        cell(STATUS_LABEL[row.status] ?? row.status),
        cell(decimal(row.amountCents)),
        cell(row.currency),
        cell(row.usdRate != null ? row.usdRate.toFixed(4).replace('.', ',') : ''),
        cell(decimal(row.amountUsdCents)),
        cell(row.externalId),
      ].join(';'),
    );
  }

  // BOM na frente: sem ele o Excel no Windows abre "Ração" como "RaÃ§Ã£o".
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Nome do arquivo com o periodo, para nao virar uma pasta de "export (3).csv". */
export function fileName(rows: Commission[]): string {
  if (rows.length === 0) return 'comissoes.csv';
  const dates = rows.map((row) => row.occurredAt.getTime());
  const from = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const to = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  return `comissoes_${from}_a_${to}.csv`;
}
