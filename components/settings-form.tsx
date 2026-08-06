'use client';

import { useActionState } from 'react';
import { saveSettingsAction, type ActionState } from '@/app/actions';
import type { AppSettings } from '@/lib/db/settings';

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="card flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="niche">
          Nicho do canal
        </label>
        <textarea
          id="niche"
          name="niche"
          rows={2}
          className="field"
          defaultValue={settings.niche}
          placeholder="ex: dicas de cozinha para quem mora sozinho"
        />
        <p className="mt-1 text-[12px] text-muted">
          Quanto mais especifico, melhores os roteiros. Isso vai direto no prompt da IA.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="template">
          Formato padrao
        </label>
        <select
          id="template"
          name="template"
          className="field"
          defaultValue={settings.template}
        >
          <option value="viral">Viral / entretenimento</option>
          <option value="produto">Produto / afiliado</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="country">
            Pais
          </label>
          <input
            id="country"
            name="country"
            className="field"
            maxLength={2}
            defaultValue={settings.country}
          />
        </div>
        <div>
          <label className="label" htmlFor="targetDuration">
            Duracao (s)
          </label>
          <input
            id="targetDuration"
            name="targetDuration"
            type="number"
            inputMode="numeric"
            className="field"
            defaultValue={settings.targetDuration}
          />
        </div>
        <div>
          <label className="label" htmlFor="ideasPerScan">
            Ideias por rodada
          </label>
          <input
            id="ideasPerScan"
            name="ideasPerScan"
            type="number"
            inputMode="numeric"
            className="field"
            defaultValue={settings.ideasPerScan}
          />
        </div>
        <div>
          <label className="label" htmlFor="videosPerDay">
            Videos por dia
          </label>
          <input
            id="videosPerDay"
            name="videosPerDay"
            type="number"
            inputMode="numeric"
            className="field"
            defaultValue={settings.videosPerDay}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="minScore">
          Nota minima para uma ideia aparecer ({settings.minScore})
        </label>
        <input
          id="minScore"
          name="minScore"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          className="field"
          defaultValue={settings.minScore}
        />
        <p className="mt-1 text-[12px] text-muted">
          Ideias com nota abaixo disso sao descartadas antes de chegar em voce.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="captionSignature">
          Assinatura da legenda
        </label>
        <input
          id="captionSignature"
          name="captionSignature"
          className="field"
          defaultValue={settings.captionSignature}
          placeholder="ex: Segue pra mais dicas!"
        />
      </div>

      <div>
        <label className="label" htmlFor="renderEngine">
          Onde renderizar
        </label>
        <select
          id="renderEngine"
          name="renderEngine"
          className="field"
          defaultValue={settings.renderEngine}
        >
          <option value="github">GitHub Actions</option>
          <option value="aqui">Aqui mesmo (este servidor)</option>
        </select>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          &quot;Aqui mesmo&quot; so funciona se o painel estiver num container
          com ffmpeg — na Vercel nao ha ffmpeg nem tempo de request suficiente.
          Escolha esta opcao se o Actions parar de receber maquina.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="blockedWords">
          Palavras proibidas (separadas por virgula)
        </label>
        <input
          id="blockedWords"
          name="blockedWords"
          className="field"
          defaultValue={settings.blockedWords.join(', ')}
        />
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar configuracoes'}
      </button>

      {state && (
        <p
          className={`text-[13px] ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
