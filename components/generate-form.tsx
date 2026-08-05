'use client';

import { useActionState } from 'react';
import { generateIdeasAction, type ActionState } from '@/app/actions';

/**
 * Formulario para gerar ideias. Deixar o assunto em branco significa "use as
 * tendencias do momento" — que e o fluxo principal; o campo livre existe para
 * quando voce ja sabe sobre o que quer falar.
 */
export function GenerateForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    generateIdeasAction,
    null,
  );

  return (
    <form action={formAction} className="card mb-5 flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="topic">
          Assunto (opcional)
        </label>
        <input
          id="topic"
          name="topic"
          className="field"
          placeholder="Deixe vazio para usar as tendencias"
        />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Escrevendo roteiros…' : 'Gerar ideias'}
      </button>
      {state && (
        <p
          className={`text-[13px] leading-snug ${
            state.ok ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
