'use client';

import { useState, useTransition } from 'react';
import type { ActionState } from '@/app/actions';

type Props = {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Texto do confirm() antes de executar. Use em acoes irreversiveis. */
  confirm?: string;
  /** Onde a mensagem de retorno aparece. */
  feedback?: 'below' | 'none';
  /** Classe do container — util para o botao dividir espaco numa linha. */
  wrapperClassName?: string;
};

/**
 * Botao que executa uma server action e mostra o resultado ali mesmo.
 *
 * O feedback fica colado no botao de proposito: no celular um toast no topo da
 * tela passa despercebido, e essas acoes (publicar, descartar) sao justamente
 * as que voce quer ter certeza de que aconteceram.
 */
export function ActionButton({
  action,
  children,
  className = 'btn-ghost',
  confirm,
  feedback = 'below',
  wrapperClassName = 'flex w-full flex-col gap-1.5',
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>(null);

  function run() {
    if (confirm && !window.confirm(confirm)) return;
    setResult(null);
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <div className={wrapperClassName}>
      <button type="button" onClick={run} disabled={pending} className={`w-full ${className}`}>
        {pending ? 'Aguarde…' : children}
      </button>
      {feedback === 'below' && result && (
        <p
          className={`text-[13px] leading-snug ${
            result.ok ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
