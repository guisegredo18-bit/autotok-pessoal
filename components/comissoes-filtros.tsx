'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Filtros da lista de produtos.
 *
 * O estado mora na URL, e nao em `useState`: assim voltar da tela do produto
 * traz a lista do jeito que voce deixou, e o link "Amazon, ordenado por
 * comissao" pode virar um atalho na tela de inicio do iPhone.
 */

const SOURCES = [
  { value: '', label: 'Todas' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'hotmart', label: 'Hotmart' },
];

const ORDERS = [
  { value: 'score', label: 'Nota' },
  { value: 'commission', label: 'Comissao' },
  { value: 'price', label: 'Preco' },
];

export function ComissoesFiltros({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);

    startTransition(() => {
      router.replace(`${pathname}?${next}`, { scroll: false });
    });
  }

  const source = params.get('fonte') ?? '';
  const order = params.get('ordem') ?? 'score';
  const category = params.get('categoria') ?? '';
  const operating = params.get('operando') === '1';

  return (
    <div className={`card mb-4 flex flex-col gap-3 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex gap-1.5">
        {SOURCES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => set('fonte', item.value)}
            className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-medium transition ${
              source === item.value ? 'bg-brand text-white' : 'bg-panel2 text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {ORDERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => set('ordem', item.value)}
            className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-medium transition ${
              order === item.value ? 'bg-brand text-white' : 'bg-panel2 text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <select
          className="field"
          value={category}
          onChange={(event) => set('categoria', event.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}

      <div className="flex flex-col gap-2">
        {/* Isolar o que paga em dolar e o filtro que decide o que promover
            quando o publico do canal e americano. */}
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={params.get('moeda') === 'USD'}
            onChange={(event) => set('moeda', event.target.checked ? 'USD' : '')}
            className="h-5 w-5 rounded border-line bg-panel2 accent-emerald-500"
          />
          So os que pagam em dolar
        </label>

        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={operating}
            onChange={(event) => set('operando', event.target.checked ? '1' : '')}
            className="h-5 w-5 rounded border-line bg-panel2 accent-emerald-500"
          />
          So os que estou operando
        </label>
      </div>
    </div>
  );
}
