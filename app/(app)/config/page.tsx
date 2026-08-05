import { getSettings } from '@/lib/db/settings';
import { integrationStatus, env } from '@/lib/env';
import { PROVIDER_LABELS, activeModel } from '@/lib/ai/providers';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { SettingsForm } from '@/components/settings-form';
import { PageHeader } from '@/components/ui';
import { disconnectTikTokAction, logoutAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

const CHECKS: { key: keyof ReturnType<typeof integrationStatus>; label: string; hint: string }[] = [
  { key: 'database', label: 'Banco de dados', hint: 'DATABASE_URL' },
  { key: 'ia', label: 'IA (roteiros)', hint: 'AI_PROVIDER + a chave do provedor' },
  { key: 'tiktok', label: 'App do TikTok', hint: 'TIKTOK_CLIENT_KEY / SECRET / REDIRECT_URI' },
  { key: 'storage', label: 'Armazenamento', hint: 'S3_* (obrigatorio com GitHub Actions)' },
  { key: 'stock', label: 'Banco de imagens', hint: 'PEXELS_API_KEY' },
  { key: 'tts', label: 'Narracao', hint: 'TTS_PROVIDER (edge e gratis)' },
  { key: 'actions', label: 'GitHub Actions', hint: 'GITHUB_TOKEN / GITHUB_REPO' },
  { key: 'push', label: 'Notificacao no iPhone', hint: 'NTFY_TOPIC' },
];

export default async function ConfigPage() {
  const [settings, account] = await Promise.all([
    getSettings(),
    getAccount().catch(() => null),
  ]);
  const status = integrationStatus();

  return (
    <>
      <PageHeader title="Configuracoes" />

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Conta do TikTok
        </h2>
        <div className="card">
          {account ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {account.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">
                    {account.displayName ?? 'Conta conectada'}
                  </p>
                  <p className="text-[12px] text-muted">
                    {account.canPostPublic
                      ? 'App auditado — publica direto no perfil'
                      : 'App nao auditado — videos vao como privados'}
                  </p>
                </div>
              </div>
              <ActionButton
                action={disconnectTikTokAction}
                className="btn-danger"
                confirm="Desconectar a conta do TikTok?"
              >
                Desconectar
              </ActionButton>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[14px] leading-snug text-muted">
                Autorize o app a publicar na sua conta. Voce sera levado ao
                TikTok e voltara para ca.
              </p>
              <a href="/api/tiktok/connect" className="btn-primary">
                Conectar TikTok
              </a>
              {!status.tiktok && (
                <p className="text-[12px] text-amber-400">
                  Preencha TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e
                  TIKTOK_REDIRECT_URI no .env antes de conectar.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Conteudo
        </h2>
        <SettingsForm settings={settings} />
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Integracoes
        </h2>
        <ul className="card flex flex-col divide-y divide-line">
          {CHECKS.map(({ key, label, hint }) => (
            <li key={key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[14px]">{label}</p>
                <p className="truncate text-[11px] text-muted">{hint}</p>
              </div>
              <span className={status[key] ? 'text-emerald-400' : 'text-amber-400'}>
                {status[key] ? 'ok' : 'faltando'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
          IA: {PROVIDER_LABELS[env.aiProvider] ?? env.aiProvider} ({activeModel()}) ·
          Armazenamento: {env.storageDriver} · Narracao: {env.ttsProvider}
        </p>
        {env.aiProvider === 'anthropic' && (
          <p className="mt-1 px-1 text-[12px] leading-snug text-amber-400">
            Este provedor cobra por uso. Para custo zero, mude AI_PROVIDER para
            gemini, groq, openrouter ou ollama.
          </p>
        )}
      </section>

      <form action={logoutAction}>
        <button type="submit" className="btn-ghost w-full">
          Sair
        </button>
      </form>
    </>
  );
}
