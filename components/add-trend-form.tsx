'use client';

import { useActionState } from 'react';
import { addTrendAction, type ActionState } from '@/app/actions';

/**
 * Cadastro manual de tendencia.
 *
 * Serve para quando a coleta automatica falha — o Creative Center e uma fonte
 * nao oficial — e tambem para quando voce simplesmente viu algo bombando no
 * feed e quer aproveitar antes de qualquer varredura.
 */
export function AddTrendForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addTrendAction,
    null,
  );

  return (
    <form action={formAction} className="card mb-3 flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="name">
          Adicionar do que voce viu no TikTok
        </label>
        <input
          id="name"
          name="name"
          className="field"
          placeholder="ex: receitas de air fryer"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      <div>
        <label className="label" htmlFor="kind">
          Tipo
        </label>
        <select id="kind" name="kind" className="field" defaultValue="hashtag">
          <option value="hashtag">Hashtag</option>
          <option value="sound">Som / audio</option>
          <option value="product">Produto</option>
          <option value="keyword">Assunto</option>
        </select>
      </div>

      <button type="submit" className="btn-ghost" disabled={pending}>
        {pending ? 'Adicionando…' : 'Adicionar tendencia'}
      </button>

      {state && (
        <p className={`text-[13px] ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
