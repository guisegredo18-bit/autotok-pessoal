import { getSettings } from '@/lib/db/settings';
import { integrationStatus, env } from '@/lib/env';
import { PROVIDER_LABELS, activeModel } from '@/lib/ai/providers';
import { getAccount } from '@/lib/tiktok/account';
import { ActionButton } from '@/components/action-button';
import { SettingsForm } from '@/components/settings-form';
import { SecretsForm } from '@/components/secrets-form';
import { hydrateEnv, secretsForForm, secretsHealth, secretsStatus } from '@/lib/secrets';
import { checkVersion } from '@/lib/version';
import { PageHeader } from '@/components/ui';
import { disconnectTikTokAction, logoutAction, setupGithubSecretsAction } from '@/app/actions';
import { listRecentRuns, listSecretNames, queueHealth } from '@/lib/github/repo';

export const dynamic = 'force-dynamic';

const CHECKS: { key: keyof ReturnType<typeof integrationStatus>; label: string; hint: string }[] = [
  { key: 'database', label: 'Banco de dados', hint: 'unica chave que fica no ambiente' },
  { key: 'ia', label: 'IA (roteiros)', hint: 'provedor + chave, abaixo' },
  { key: 'stock', label: 'Banco de imagens', hint: 'chave do Pexels' },
  { key: 'storage', label: 'Armazenamento', hint: 'R2 / S3, para renderizar' },
  { key: 'actions', label: 'GitHub Actions', hint: 'token e repositorio' },
  { key: 'tiktok', label: 'App do TikTok', hint: 'client key e secret' },
  { key: 'tts', label: 'Narracao', hint: 'Edge TTS e gratis e ja vem ligado' },
  { key: 'push', label: 'Notificacao no iPhone', hint: 'topico do ntfy' },
];

/**
 * Diagnostico do GitHub Actions.
 *
 * Nunca lanca: sem token, com token errado ou com o GitHub fora do ar, a tela
 * de configuracoes precisa continuar abrindo — e justamente aqui que se
 * conserta o token.
 */
async function githubStatus() {
  const vazio = { waiting: 0, oldestMinutes: 0, stuck: false };
  if (!env.githubToken || !env.githubRepo) {
    return {
      secrets: [] as string[],
      runs: [] as Awaited<ReturnType<typeof listRecentRuns>>,
      queue: vazio,
      error: 'token do GitHub nao configurado',
    };
  }
  try {
    const [secrets, runs] = await Promise.all([listSecretNames(), listRecentRuns(10)]);
    return { secrets, runs, queue: queueHealth(runs), error: null as string | null };
  } catch (err) {
    return {
      secrets: [] as string[],
      runs: [] as Awaited<ReturnType<typeof listRecentRuns>>,
      queue: vazio,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function ConfigPage() {
  // Carrega as chaves guardadas no banco antes de montar a tela, senao o
  // resumo mostraria como faltando algo que ja esta configurado.
  await hydrateEnv(true);

  const [settings, account, secretValues, filled, health, version, github] = await Promise.all([
    getSettings(),
    getAccount().catch(() => null),
    secretsForForm(),
    secretsStatus(),
    secretsHealth(),
    checkVersion(),
    githubStatus(),
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
                  Preencha a client key e o client secret do TikTok em Chaves,
                  logo abaixo, antes de conectar.
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
            Este provedor cobra por uso. Para custo zero, escolha Gemini, Groq,
            OpenRouter ou Ollama abaixo.
          </p>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Chaves
        </h2>
        <p className="mb-3 px-1 text-[12px] leading-snug text-muted">
          Preencha aqui, pelo celular, em vez de configurar secrets no GitHub.
          Fica tudo cifrado no seu banco de dados, e o GitHub Actions le daqui.
        </p>

        {/* Sem este aviso, um AUTH_SECRET trocado se disfarca de "voce esqueceu
            de preencher" — e a pessoa refaz tudo sem entender o que houve. */}
        {health.unreadable > 0 && (
          <div className="card mb-3 border-red-900/60 bg-red-950/30">
            <p className="text-[14px] font-semibold text-red-300">
              {health.unreadable} de {health.stored} chaves nao puderam ser lidas
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-red-200/85">
              Elas estao salvas, mas o <code>AUTH_SECRET</code> atual e diferente
              do que foi usado para guarda-las — e so com ele que da para
              decifrar.
            </p>
            <p className="mt-2 text-[13px] leading-snug text-red-200/85">
              Duas saidas: volte o <code>AUTH_SECRET</code> anterior nas
              variaveis do seu deploy, ou preencha as chaves de novo aqui
              embaixo (elas serao regravadas com o segredo atual).
            </p>
          </div>
        )}
        <SecretsForm values={secretValues} filled={filled} />
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Renderizacao (GitHub Actions)
        </h2>

        <div className="card flex flex-col gap-3">
          <p className="text-[13px] leading-snug text-muted">
            O painel ja renderiza sozinho — o ffmpeg viaja junto com ele. Esta
            secao so importa se voce escolheu <strong>GitHub Actions</strong> em
            Conteudo &gt; Onde renderizar; ai o robo precisa saber chegar no seu
            banco e decifrar as chaves.
          </p>

          {github.error ? (
            <p className="text-[13px] leading-snug text-amber-400">
              Nao consegui verificar: {github.error}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(['DATABASE_URL', 'AUTH_SECRET'] as const).map((name) => (
                <li key={name} className="flex items-center justify-between gap-3">
                  <code className="text-[13px]">{name}</code>
                  <span
                    className={
                      github.secrets.includes(name) ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {github.secrets.includes(name) ? 'cadastrado' : 'faltando'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Franquia esgotada nao produz erro: o job fica esperando uma
              maquina que nunca vem. Sem este aviso, a unica pista seria a
              pagina de faturamento do GitHub — longe de quem usa pelo celular. */}
          {github.queue.stuck && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3">
              <p className="text-[13px] font-semibold text-red-300">
                {github.queue.waiting} execucao(oes) parada(s) na fila
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-red-200/85">
                A mais antiga espera ha {github.queue.oldestMinutes} minutos sem
                receber maquina. O job foi criado, mas nenhum runner assumiu —
                nao ha erro para mostrar porque nada chegou a rodar.
              </p>
              <p className="mt-2 text-[13px] leading-snug text-red-200/85">
                Duas causas comuns: franquia mensal esgotada (repositorio
                privado — tornar publico em{' '}
                <code>github.com/{env.githubRepo}/settings</code> resolve, e o
                Actions passa a ser ilimitado) ou Actions bloqueado na conta
                inteira, o que acontece mesmo em repositorio publico.
              </p>
              <p className="mt-2 text-[13px] leading-snug text-red-200/85">
                Se o repositorio ja e publico, o GitHub nao vai destravar
                sozinho: mude <strong>Onde renderizar</strong> para
                &quot;aqui mesmo&quot; em Conteudo, acima, e rode o painel num
                container com ffmpeg.
              </p>
            </div>
          )}

          <ActionButton action={setupGithubSecretsAction} className="btn-primary">
            Configurar o GitHub para mim
          </ActionButton>

          {github.runs.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-[12px] font-semibold text-muted">Ultimas execucoes</p>
              <ul className="flex flex-col gap-1.5">
                {github.runs.map((run, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate">{run.name}</span>
                    <span
                      className={
                        run.conclusion === 'success'
                          ? 'text-emerald-400'
                          : run.conclusion === null
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }
                    >
                      {run.conclusion ?? run.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Versao
        </h2>

        {version.outdated ? (
          <div className="card border-amber-900/60 bg-amber-950/30">
            <p className="text-[14px] font-semibold text-amber-300">
              Ha uma versao mais nova esperando deploy
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-amber-200/85">
              No ar: <code>{version.commit}</code> · disponivel:{' '}
              <code>{version.latest}</code>. Correcoes que ja estao no
              repositorio ainda nao chegaram aqui.
            </p>
            <p className="mt-2 text-[13px] leading-snug text-amber-200/85">
              Na Vercel, abra o projeto → <strong>Deployments</strong> → nos tres
              pontinhos do deploy mais recente → <strong>Redeploy</strong>.
            </p>
          </div>
        ) : (
          <p className="px-1 text-[12px] leading-snug text-muted">
            No ar: <code>{version.commit || 'desenvolvimento local'}</code>
            {version.branch && ` · ${version.branch}`}
            {version.note && ` · ${version.note}`}
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
