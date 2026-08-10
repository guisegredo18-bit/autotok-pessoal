'use client';

import { useActionState } from 'react';
import { importAmazonCsvAction } from '@/app/actions-comissoes';
import type { ActionState } from '@/app/actions';

/**
 * Upload do relatorio de ganhos da Amazon.
 *
 * `accept` inclui `text/plain` e `.txt` de proposito: o Safari do iPhone
 * classifica o CSV baixado do painel do Associates de varios jeitos, e um
 * accept estrito faz o arquivo aparecer cinza e nao selecionavel — o usuario
 * conclui que o arquivo esta corrompido.
 */
export function CsvUploadForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    importAmazonCsvAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        type="file"
        name="arquivo"
        accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
        className="field file:mr-3 file:rounded-lg file:border-0 file:bg-panel2 file:px-3 file:py-1.5 file:text-[13px] file:text-white"
      />

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Lendo o arquivo…' : 'Importar CSV de ganhos'}
      </button>

      {state && (
        <p
          className={`text-[13px] leading-snug ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
