import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import { databaseIsReady } from '@/lib/db/setup';
import { Nav } from '@/components/nav';
import { DatabaseSetup } from '@/components/database-setup';

/**
 * Layout das telas internas.
 *
 * Duas checagens ficam aqui, num unico ponto: sessao e banco preparado.
 * Qualquer pagina nova ja nasce protegida — e ninguem consegue abrir uma tela
 * que consultaria tabelas inexistentes.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isLoggedIn())) redirect('/login');

  const ready = await databaseIsReady();

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main
        className="px-4 pt-8"
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          // Espaco para a barra inferior nao cobrir o ultimo card.
          paddingBottom: 'calc(84px + env(safe-area-inset-bottom))',
        }}
      >
        {ready ? children : <DatabaseSetup />}
      </main>
      {ready && <Nav />}
    </div>
  );
}
