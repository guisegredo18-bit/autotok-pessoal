'use client';

import { useActionState } from 'react';
import { saveSecretsAction, type ActionState } from '@/app/actions';
import type { SecretField, SecretValues } from '@/lib/secrets';

/**
 * Formulario das chaves de integracao.
 *
 * Substitui a parte mais penosa da instalacao — colar oito secrets no GitHub
 * pelo Safari. Aqui os campos sao grandes, tem teclado adequado e ficam num
 * lugar so.
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
    title: 'IA que escreve os roteiros',
    description: 'Escolha um provedor e cole a chave dele. Todos os listados sao gratuitos.',
    fields: [
      {
        name: 'aiProvider',
        label: 'Provedor',
        options: [
          { value: 'gemini', label: 'Google Gemini (gratis)' },
          { value: 'groq', label: 'Groq / Llama (gratis)' },
          { value: 'openrouter', label: 'OpenRouter (modelos :free)' },
          { value: 'ollama', label: 'Ollama local' },
          { value: 'anthropic', label: 'Anthropic Claude (pago)' },
        ],
      },
      {
        name: 'geminiApiKey',
        label: 'Chave do Gemini',
        hint: 'aistudio.google.com/apikey',
        secret: true,
      },
      { name: 'groqApiKey', label: 'Chave do Groq', hint: 'console.groq.com/keys', secret: true },
      { name: 'openRouterApiKey', label: 'Chave do OpenRouter', secret: true },
      { name: 'anthropicApiKey', label: 'Chave da Anthropic', secret: true },
    ],
  },
  {
    title: 'Imagens de fundo',
    description: 'Sem isto os videos saem com fundo liso.',
    fields: [
      { name: 'pexelsApiKey', label: 'Chave do Pexels', hint: 'pexels.com/api', secret: true },
    ],
  },
  {
    title: 'Armazenamento dos videos',
    description:
      'Obrigatorio para renderizar no GitHub Actions. Use o Cloudflare R2 (10 GB gratis).',
    fields: [
      {
        name: 'storageDriver',
        label: 'Onde guardar',
        options: [
          { value: 's3', label: 'R2 / S3 (necessario com GitHub Actions)' },
          { value: 'local', label: 'Disco local (so rodando em VPS proprio)' },
        ],
      },
      {
        name: 's3Endpoint',
        label: 'Endpoint',
        placeholder: 'https://xxx.r2.cloudflarestorage.com',
      },
      { name: 's3Bucket', label: 'Nome do bucket', placeholder: 'autotok' },
      { name: 's3AccessKeyId', label: 'Access Key ID', secret: true },
      { name: 's3SecretAccessKey', label: 'Secret Access Key', secret: true },
      {
        name: 's3PublicUrl',
        label: 'URL publica do bucket',
        placeholder: 'https://pub-xxx.r2.dev',
      },
    ],
  },
  {
    title: 'Renderizacao no GitHub Actions',
    description:
      'Token classico com escopo "repo", criado em github.com/settings/tokens. E o que deixa o painel disparar os jobs.',
    fields: [
      { name: 'githubToken', label: 'Token do GitHub', secret: true },
      {
        name: 'githubRepo',
        label: 'Repositorio',
        placeholder: 'seu-usuario/autotok-pessoal',
      },
    ],
  },
  {
    title: 'TikTok',
    description: 'Do app criado em developers.tiktok.com.',
    fields: [
      { name: 'tiktokClientKey', label: 'Client key' },
      { name: 'tiktokClientSecret', label: 'Client secret', secret: true },
    ],
  },
  {
    title: 'Hotmart',
    description:
      'Credenciais de developers.hotmart.com > Credenciais. Sao elas que trazem suas ' +
      'vendas e comissoes para o painel de Grana.',
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
      'Chaves da Product Advertising API, em afiliados.amazon.com.br > Ferramentas > ' +
      'API de Publicidade de Produtos. Contas novas so recebem cota depois das primeiras vendas.',
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
  {
    title: 'Notificacao no celular',
    description: 'Instale o app ntfy e assine um topico com nome longo e aleatorio.',
    fields: [{ name: 'ntfyTopic', label: 'Topico do ntfy', placeholder: 'autotok-k3n8vqz1x' }],
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
                  {filled[field.name] && (
                    <span className="ml-2 text-emerald-400">preenchido</span>
                  )}
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
        As chaves sao guardadas cifradas no seu banco de dados. Campos em branco
        nao apagam o que ja esta salvo — para remover uma chave, digite um hifen
        (-) no lugar dela.
      </p>
    </form>
  );
}
