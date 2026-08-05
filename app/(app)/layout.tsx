import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import { Nav } from '@/components/nav';

/**
 * Layout das telas internas. A checagem de sessao fica aqui, num unico ponto:
 * qualquer pagina nova dentro de (app) ja nasce protegida sem precisar lembrar
 * de adicionar a verificacao.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isLoggedIn())) redirect('/login');

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
        {children}
      </main>
      <Nav />
    </div>
  );
}
