'use client';

import { useActionState, useState } from 'react';
import { updateCaptionAction, type ActionState } from '@/app/actions';

/**
 * Edicao da legenda antes de publicar.
 *
 * Fica fechado por padrao: na maioria das vezes a legenda da IA serve, e um
 * textarea aberto em cada card empurraria o proximo video para fora da tela.
 */
export function CaptionEditor({
  videoId,
  caption,
}: {
  videoId: string;
  caption: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateCaptionAction.bind(null, videoId),
    null,
  );

  if (!open) {
    return (
      <>
        <p className="whitespace-pre-line text-[13px] leading-snug text-muted">{caption}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-[13px] font-medium text-cyan"
        >
          Editar legenda
        </button>
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        name="caption"
        rows={5}
        defaultValue={caption}
        maxLength={2200}
        className="field text-[13px]"
      />
      <p className="text-[11px] text-muted">
        E o texto exato que vai para o TikTok. As hashtags sao lidas do proprio
        texto.
      </p>
      <div className="flex gap-2">
        <button type="submit" className="btn-ghost flex-1" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-4">
          Fechar
        </button>
      </div>
      {state && (
        <p className={`text-[13px] ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
