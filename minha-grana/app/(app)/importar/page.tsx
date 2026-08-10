import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { commissions } from '@/lib/db/schema';
import { getSettings } from '@/lib/db/settings';
import { hydrateEnv } from '@/lib/secrets';
import { amazonIsReady, env, hotmartIsReady } from '@/lib/env';
import { ActionButton } from '@/components/action-button';
import { CsvUploadForm } from '@/components/csv-upload-form';
import { AfiliadosSettingsForm } from '@/components/afiliados-settings-form';
import { PageHeader, timeAgo } from '@/components/ui';
import {
  importAmazonCatalogAction,
  importHotmartAction,
  importHotmartProductsAction,
  refreshOperatingAction,
  testAmazonAction,
  testHotmartAction,
} from '@/app/actions';

export const dynamic = 'force-dynamic';
// A importacao roda na propria requisicao e pode varrer varias paginas da API.
export const maxDuration = 120;

/** Quando cada fonte foi importada pela ultima vez. */
async function ultimasImportacoes() {
  const rows = await db
    .select({
      source: commissions.source,
      at: sql<string>`max(${commissions.importedAt})`,
      total: sql<number>`count(*)::int`,
    })
    .from(commissions)
    .groupBy(commissions.source);

  return new Map(rows.map((row) => [row.source, row]));
}

export default async function ImportarPage() {
  await hydrateEnv(true);

  const [settings, ultimas] = await Promise.all([getSettings(), ultimasImportacoes()]);
  const hotmartOk = hotmartIsReady();
  const amazonOk = amazonIsReady();

  const hotmart = ultimas.get('hotmart');
  const amazon = ultimas.get('amazon');

  return (
    <>
      <PageHeader
        title="Importar"
        subtitle="Hotmart pela API, Amazon pelo catalogo e pelo CSV de ganhos."
        action={
          <Link href="/" className="btn-ghost px-3 text-[13px]">
            Voltar
          </Link>
        }
      />

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Hotmart
        </h2>
        <div className="card flex flex-col gap-3">
          {hotmartOk ? (
            <p className="text-[13px] text-muted">
              {hotmart
                ? `${hotmart.total} comissao(oes) guardada(s). Ultima importacao ha ${timeAgo(hotmart.at)}.`
                : 'Credenciais registradas. Nada importado ainda.'}
            </p>
          ) : (
            <p className="text-[13px] leading-snug text-amber-400">
              Falta registrar o Client ID e o Client Secret. Pegue em
              developers.hotmart.com &gt; Credenciais e cole em Configuracoes.
            </p>
          )}

          <ActionButton action={testHotmartAction}>Testar conexao</ActionButton>

          <ActionButton action={importHotmartAction} className="btn-primary">
            Importar comissoes ({settings.importWindowDays} dias)
          </ActionButton>

          <ActionButton action={importHotmartProductsAction}>Trazer meus produtos</ActionButton>

          <p className="text-[11px] leading-snug text-muted">
            A Hotmart nao publica em API o marketplace de produtos afiliaveis com
            temperatura e ranking — so da para trazer os produtos ja ligados a sua conta.
            Os produtos que voce quiser acompanhar antes de afiliar precisam vir da Amazon.
          </p>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Amazon — catalogo
        </h2>
        <div className="card flex flex-col gap-3">
          {amazonOk ? (
            <p className="text-[13px] text-muted">
              Marketplace: {env.amazonMarketplace} · tag {env.amazonPartnerTag}
            </p>
          ) : (
            <p className="text-[13px] leading-snug text-amber-400">
              Faltam Access Key, Secret Key e a tag de afiliado. Registre em
              Configuracoes.
            </p>
          )}

          <ActionButton action={testAmazonAction}>Testar conexao</ActionButton>

          <ActionButton action={importAmazonCatalogAction} className="btn-primary">
            Buscar produtos pelos meus termos
          </ActionButton>

          <ActionButton action={refreshOperatingAction}>
            Atualizar metricas dos que estou operando
          </ActionButton>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Amazon — comissoes (CSV)
        </h2>
        <div className="card flex flex-col gap-3">
          <p className="text-[13px] leading-snug text-muted">
            A API da Amazon e de catalogo: ela nao informa quanto voce ganhou. O valor real
            so existe no relatorio do painel — Relatorios &gt; Ganhos &gt; Download. Suba o
            arquivo aqui.
          </p>

          {amazon && (
            <p className="text-[12px] text-muted">
              {amazon.total} comissao(oes) ja importada(s). Ultimo envio ha {timeAgo(amazon.at)}.
            </p>
          )}

          <CsvUploadForm />

          <p className="text-[11px] leading-snug text-muted">
            Reenviar o mesmo periodo nao duplica nada: as linhas sao reconhecidas e
            atualizadas.
          </p>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Preferencias
        </h2>
        <AfiliadosSettingsForm settings={settings} />
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Exportar
        </h2>
        <div className="card flex flex-col gap-3">
          <p className="text-[13px] leading-snug text-muted">
            Planilha com data, produto, valor na moeda original, cotacao usada e valor em
            dolar — o que o contador precisa para o carne-leao.
          </p>
          <a href="/api/exportar?dias=365" className="btn-ghost" download>
            Baixar CSV (12 meses)
          </a>
          <a href="/api/exportar?dias=3650" className="btn-ghost" download>
            Baixar CSV (tudo)
          </a>
        </div>
      </section>
    </>
  );
}
