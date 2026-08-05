'use client';

import { useActionState } from 'react';
import { loginAction, type ActionState } from '@/app/actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null,
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-[32px] font-bold tracking-tight">
          Auto<span className="text-brand">Tok</span>
        </h1>
        <p className="mt-2 text-center text-[14px] text-muted">
          Tendencias, videos e publicacao — do seu bolso.
        </p>

        <form action={formAction} className="card mt-8 flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="password">
              Senha do painel
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="field"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>

          {state && !state.ok && (
            <p className="text-center text-[13px] text-red-400">{state.message}</p>
          )}
        </form>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">
          Dica: no Safari, toque em Compartilhar → Adicionar a Tela de Inicio
          para usar como aplicativo.
        </p>
      </div>
    </main>
  );
}
