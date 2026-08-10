'use client';

import { useActionState } from 'react';
import { saveAffiliateSettingsAction } from '@/app/actions-comissoes';
import type { ActionState } from '@/app/actions';
import type { AppSettings } from '@/lib/db/settings';

/** Preferencias que mudam o que cada importacao traz. */
export function AfiliadosSettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAffiliateSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="card flex flex-col gap-3.5">
      <div>
        <label className="label" htmlFor="hotmartRole">
          Seu papel na Hotmart
        </label>
        <select
          id="hotmartRole"
          name="hotmartRole"
          className="field"
          defaultValue={settings.hotmartRole}
        >
          <option value="AFFILIATE">Afiliado</option>
          <option value="PRODUCER">Produtor</option>
          <option value="COPRODUCER">Coprodutor</option>
        </select>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Cada venda lista quanto cada parte ganhou. Sem escolher, o painel somaria o
          faturamento do produto como se fosse seu.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="affiliateKeywords">
          Termos de busca na Amazon
        </label>
        <textarea
          id="affiliateKeywords"
          name="affiliateKeywords"
          rows={3}
          className="field"
          defaultValue={settings.affiliateKeywords.join('\n')}
          placeholder={'fone bluetooth\nairfryer\nteclado mecanico'}
        />
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Um por linha. Sao estes termos que a busca do catalogo usa — a PA-API nao tem
          um "mais vendidos geral" para listar sozinha.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="importWindowDays">
          Janela de importacao (dias)
        </label>
        <input
          id="importWindowDays"
          name="importWindowDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          className="field"
          defaultValue={settings.importWindowDays}
        />
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar preferencias'}
      </button>

      {state && (
        <p className={`text-[13px] ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
