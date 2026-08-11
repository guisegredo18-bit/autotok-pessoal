'use client';

import { useActionState } from 'react';
import { saveSettingsAction, type ActionState } from '@/app/actions';
import type { AppSettings } from '@/lib/db/settings';
import { RENDER_ENGINES } from '@/lib/render-engine';

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

      <div>
        <label className="label" htmlFor="language">
          Publico do canal
        </label>
        <select
          id="language"
          name="language"
          className="field"
          defaultValue={settings.language}
        >
          <option value="pt-BR">Brasil — roteiro e narracao em portugues</option>
          <option value="en-US">Estados Unidos — roteiro e narracao em ingles</option>
        </select>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Muda o idioma do roteiro E a voz da narracao. Vender em dolar sem trocar isto
          nao funciona: o publico americano nao entende o video.
        </p>
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
          {/* Montado a partir da mesma lista que valida o envio: uma opcao
              nova nao tem como aparecer aqui sem o servidor reconhece-la. */}
          {Object.entries(RENDER_ENGINES).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          <strong>Aqui mesmo</strong> nao depende de mais nada: o ffmpeg vem
          junto no proprio painel. Aprovar uma ideia leva de um a dois minutos e
          o video ja sai pronto. As outras duas opcoes existem para quem tem
          maquina sobrando — e o Colab, para quem quiser 1080p.
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
