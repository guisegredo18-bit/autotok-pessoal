'use client';

import { useActionState } from 'react';
import { saveSecretsAction, type ActionState } from '@/app/actions';
import type { SecretField, SecretValues } from '@/lib/secrets';

/**
 * Formulario das chaves de integracao.
 *
 * E aqui que voce registra as credenciais da Hotmart e da Amazon — dentro do
 * proprio aplicativo, e nao no painel da hospedagem. As chaves sao guardadas
 * cifradas no banco e nunca voltam para a tela: os campos sensiveis aparecem
 * sempre vazios, com o aviso de que ja estao preenchidos.
 */

type Field = {
  name: SecretField;
  label: string;
  hint?: string;
  secret?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

type Group = { title: string; description: string; fields: Field[] };

const GROUPS: Group[] = [
  {
    title: 'Hotmart',
    description:
      'Em developers.hotmart.com > Credenciais. Sao elas que trazem suas vendas e ' +
      'comissoes para o painel.',
    fields: [
      { name: 'hotmartClientId', label: 'Client ID' },
      { name: 'hotmartClientSecret', label: 'Client Secret', secret: true },
      {
        name: 'hotmartBasic',
        label: 'Basic (opcional)',
        hint: 'Se deixar vazio, a aplicacao calcula a partir dos dois campos acima.',
        secret: true,
      },
    ],
  },
  {
    title: 'Amazon Associates',
    description:
      'Em afiliados.amazon.com.br > Ferramentas > API de Publicidade de Produtos. ' +
      'Contas novas so recebem cota depois das primeiras vendas — ate la, use a ' +
      'importacao do CSV, que funciona desde o primeiro dia.',
    fields: [
      { name: 'amazonAccessKey', label: 'Access Key' },
      { name: 'amazonSecretKey', label: 'Secret Key', secret: true },
      {
        name: 'amazonPartnerTag',
        label: 'Tag de afiliado',
        placeholder: 'seunome-20',
        hint: 'E ela que credita a comissao nos links gerados.',
      },
      {
        name: 'amazonMarketplace',
        label: 'Marketplace',
        hint: 'Define o host da API, a regiao da assinatura e a moeda assumida no CSV.',
        options: [
          { value: 'www.amazon.com.br', label: 'Brasil (amazon.com.br)' },
          { value: 'www.amazon.com', label: 'Estados Unidos (amazon.com)' },
          { value: 'www.amazon.es', label: 'Espanha (amazon.es)' },
          { value: 'www.amazon.com.mx', label: 'Mexico (amazon.com.mx)' },
          { value: 'www.amazon.co.uk', label: 'Reino Unido (amazon.co.uk)' },
          { value: 'www.amazon.de', label: 'Alemanha (amazon.de)' },
          { value: 'www.amazon.fr', label: 'Franca (amazon.fr)' },
          { value: 'www.amazon.it', label: 'Italia (amazon.it)' },
          { value: 'www.amazon.ca', label: 'Canada (amazon.ca)' },
          { value: 'www.amazon.co.jp', label: 'Japao (amazon.co.jp)' },
          { value: 'www.amazon.com.au', label: 'Australia (amazon.com.au)' },
          { value: 'www.amazon.in', label: 'India (amazon.in)' },
        ],
      },
    ],
  },
];

export function SecretsForm({
  values,
  filled,
}: {
  values: SecretValues;
  filled: Record<string, boolean>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSecretsAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {GROUPS.map((group) => (
        <section key={group.title} className="card">
          <h3 className="text-[15px] font-semibold">{group.title}</h3>
          <p className="mt-1 text-[12px] leading-snug text-muted">{group.description}</p>

          <div className="mt-4 flex flex-col gap-3.5">
            {group.fields.map((field) => (
              <div key={field.name}>
                <label className="label" htmlFor={field.name}>
                  {field.label}
                  {filled[field.name] && <span className="ml-2 text-emerald-400">preenchido</span>}
                </label>

                {field.options ? (
                  <select
                    id={field.name}
                    name={field.name}
                    className="field"
                    defaultValue={values[field.name] ?? field.options[0].value}
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="field"
                    defaultValue={field.secret ? '' : (values[field.name] ?? '')}
                    placeholder={
                      field.secret && filled[field.name]
                        ? '•••••• (deixe vazio para manter)'
                        : field.placeholder
                    }
                  />
                )}

                {field.hint && <p className="mt-1 text-[11px] text-muted">{field.hint}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar chaves'}
      </button>

      {state && (
        <p className={`text-[13px] ${state.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {state.message}
        </p>
      )}

      <p className="text-[11px] leading-snug text-muted">
        As chaves sao guardadas cifradas no seu banco de dados e nunca sao
        enviadas ao navegador. Campos em branco nao apagam o que ja esta salvo —
        para remover uma chave, digite um hifen (-) no lugar dela.
      </p>
    </form>
  );
}
