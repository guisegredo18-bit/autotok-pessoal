import { integrationStatus } from '@/lib/env';
import { hydrateEnv, secretsForForm, secretsHealth, secretsStatus } from '@/lib/secrets';
import { SecretsForm } from '@/components/secrets-form';
import { PageHeader } from '@/components/ui';
import { logoutAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

const CHECKS: { key: keyof ReturnType<typeof integrationStatus>; label: string; hint: string }[] = [
  { key: 'database', label: 'Banco de dados', hint: 'unica chave que fica no ambiente' },
  { key: 'hotmart', label: 'Hotmart', hint: 'client id e secret' },
  { key: 'amazon', label: 'Amazon Associates', hint: 'chaves da PA-API e tag de afiliado' },
];

export default async function ConfigPage() {
  // Carrega as chaves guardadas antes de montar a tela, senao o resumo
  // mostraria como faltando algo que ja esta registrado.
  await hydrateEnv(true);

  const [secretValues, filled, health] = await Promise.all([
    secretsForForm(),
    secretsStatus(),
    secretsHealth(),
  ]);
  const status = integrationStatus();

  return (
    <>
      <PageHeader title="Configuracoes" />

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Situacao
        </h2>
        <ul className="card flex flex-col divide-y divide-line">
          {CHECKS.map(({ key, label, hint }) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-[14px]">{label}</p>
                <p className="truncate text-[11px] text-muted">{hint}</p>
              </div>
              <span className={status[key] ? 'text-emerald-400' : 'text-amber-400'}>
                {status[key] ? '✓' : '—'}
              </span>
            </li>
          ))}
        </ul>

        {health.unreadable > 0 && (
          // As duas situacoes se parecem — em ambas a chave "some" da tela. Sem
          // este aviso, um AUTH_SECRET trocado se disfarca de "voce esqueceu de
          // preencher", e a pessoa preenche tudo de novo sem entender por que.
          <div className="card mt-3 border-amber-900/60 bg-amber-950/30">
            <p className="text-[13px] leading-snug text-amber-200/90">
              {health.unreadable} de {health.stored} chaves nao puderam ser decifradas. O{' '}
              <code>AUTH_SECRET</code> mudou depois que elas foram salvas — restaure o valor
              antigo, ou preencha as chaves de novo abaixo.
            </p>
          </div>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Minhas chaves
        </h2>
        <SecretsForm values={secretValues} filled={filled} />
      </section>

      {/* Um `form` em vez do ActionButton porque `logoutAction` redireciona e
          nao devolve estado nenhum para mostrar. */}
      <form action={logoutAction} className="mb-5">
        <button type="submit" className="btn-ghost w-full">
          Sair
        </button>
      </form>
    </>
  );
}
