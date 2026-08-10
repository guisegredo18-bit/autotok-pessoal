import { ActionButton } from '@/components/action-button';
import { PageHeader } from '@/components/ui';
import { prepareDatabaseAction } from '@/app/actions';

/**
 * Primeira tela de quem acabou de instalar.
 *
 * Existe para que ninguem precise de terminal: o `npm run db:push` vira um
 * botao. Aparece no lugar do conteudo enquanto as tabelas nao existirem — e
 * como e o layout que decide, nao ha rota para acessar por engano nem risco
 * de laco de redirecionamento.
 */
export function DatabaseSetup() {
  return (
    <>
      {/* O texto cobre as duas situacoes de proposito. Esta tela aparece na
          primeira instalacao E depois de uma atualizacao que traga tabelas
          novas — e "e uma vez so" fazia quem ja tinha instalado achar que
          estava vendo um erro, ou que ia perder o que ja existia. */}
      <PageHeader
        title="Quase la"
        subtitle="Falta preparar o banco de dados."
      />

      <div className="card mb-4">
        <p className="text-[14px] leading-snug text-muted">
          Vou criar as tabelas que a aplicacao usa no banco configurado em{' '}
          <code className="text-cyan">DATABASE_URL</code>. Nada e apagado: as
          tabelas que ja existirem sao mantidas com o conteudo delas, e so as
          que faltam sao criadas.
        </p>
        <p className="mt-2 text-[14px] leading-snug text-muted">
          Se voce ja usava o painel, esta tela aparece porque uma atualizacao
          trouxe tabelas novas. Seus videos, ideias e configuracoes continuam
          onde estao.
        </p>
      </div>

      <ActionButton action={prepareDatabaseAction} className="btn-primary">
        Preparar banco de dados
      </ActionButton>

      <div className="card mt-5">
        <p className="text-[13px] font-semibold">Se falhar</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-snug text-muted">
          <li>
            Confira se a <code>DATABASE_URL</code> foi colada inteira, incluindo
            o <code>?sslmode=require</code> no final.
          </li>
          <li>
            No Neon, a string certa e a que aparece em <em>Connection string</em>,
            na tela do projeto.
          </li>
          <li>Depois de corrigir a variavel, refaca o deploy para ela valer.</li>
        </ul>
      </div>
    </>
  );
}
