'use client';

import { useActionState, useState } from 'react';
import { addProductAction } from '@/app/actions-comissoes';
import type { ActionState } from '@/app/actions';

/**
 * Cadastro manual de produto.
 *
 * Existe pelo mesmo motivo do cadastro manual de tendencia: quando a fonte
 * automatica nao alcanca, voce digita e segue. Aqui o motivo e estrutural — a
 * Hotmart nao publica o marketplace de afiliados em API, entao o produto que
 * voce escolheu no site deles so chega ate aqui por este caminho.
 *
 * O formulario comeca fechado porque nao e o fluxo principal: quem tem a
 * Amazon configurada importa o catalogo com um toque. Ele existe para quando
 * isso nao basta — e e justamente o caso de quem opera na Hotmart.
 */
export function AddProdutoForm() {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addProductAction,
    null,
  );

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="btn-ghost mb-3 w-full">
        Cadastrar produto na mao
      </button>
    );
  }

  return (
    <form action={formAction} className="card mb-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">Cadastrar produto</p>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Para o que voce escolheu no marketplace da Hotmart, que a API deles nao
            entrega.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 text-[13px] text-muted"
        >
          Fechar
        </button>
      </div>

      <div>
        <label className="label" htmlFor="p-source">
          Plataforma
        </label>
        <select id="p-source" name="source" className="field" defaultValue="hotmart">
          <option value="hotmart">Hotmart</option>
          <option value="amazon">Amazon</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="p-name">
          Nome do produto
        </label>
        <input
          id="p-name"
          name="name"
          className="field"
          placeholder="ex: Curso de Ingles do Zero"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="p-url">
          Seu link de afiliado
        </label>
        <input
          id="p-url"
          name="url"
          type="url"
          inputMode="url"
          className="field"
          placeholder="https://..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <p className="mt-1 text-[11px] text-muted">
          E ele que credita a comissao. Copie da propria plataforma, sem encurtar.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="p-price">
            Preco
          </label>
          <input
            id="p-price"
            name="price"
            inputMode="decimal"
            className="field"
            placeholder="297,00"
          />
        </div>
        <div className="w-24">
          <label className="label" htmlFor="p-currency">
            Moeda
          </label>
          <select id="p-currency" name="currency" className="field" defaultValue="BRL">
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="p-rate">
            Comissao (%)
          </label>
          <input
            id="p-rate"
            name="commissionRate"
            inputMode="decimal"
            className="field"
            placeholder="50"
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="p-category">
            Categoria
          </label>
          <input id="p-category" name="category" className="field" placeholder="Idiomas" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="p-image">
          Link da imagem do produto
        </label>
        <input
          id="p-image"
          name="imageUrl"
          type="url"
          inputMode="url"
          className="field"
          placeholder="https://..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Opcional, mas e o que aparece no video. Sem ela, as cenas usam imagem de
          banco — bem menos convincente para vender um produto especifico.
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Salvando…' : 'Cadastrar produto'}
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
