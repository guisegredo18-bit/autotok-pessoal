import { GAME_IDS } from '@/core/domains';
import type { GameId } from '@/core/types';
import { Ajustes } from '@/screens/Ajustes';
import { Inicio } from '@/screens/Inicio';
import { Perfis } from '@/screens/Perfis';
import { Relatorio } from '@/screens/Relatorio';
import { Sessao } from '@/screens/Sessao';
import { Treinar } from '@/screens/Treinar';
import { segments, useRoute } from '@/state/router';
import { useStore } from '@/state/store';

/**
 * Icones da barra em SVG, e nao emoji.
 *
 * Emoji muda de desenho a cada sistema e alguns caem para um glifo preto e
 * branco que nao combina com os vizinhos. Cinco tracos proprios custam pouco
 * e ficam iguais em qualquer aparelho. O rotulo embaixo continua sendo quem
 * carrega o significado.
 */
const ICONS: Record<string, string> = {
  '/': 'M3 11 12 3l9 8M6 10v10h12V10',
  '/sessao': 'M8 5.5v13l11-6.5z',
  '/relatorio': 'M4 20V6M4 20h16M8 20v-6M13 20v-9M18 20v-4',
  '/perfis': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  '/ajustes': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2',
};

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/sessao', label: 'Sessão' },
  { href: '/relatorio', label: 'Relatório' },
  { href: '/perfis', label: 'Perfis' },
  { href: '/ajustes', label: 'Ajustes' },
];

export function App() {
  const { path, navigate } = useRoute();
  const store = useStore();

  if (!store.ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-muted">Carregando...</div>
    );
  }

  const parts = segments(path);
  const screen = parts[0] ?? '';

  // As telas de jogo ocupam a tela inteira: a barra de navegacao ali seria um
  // convite a sair no meio de uma medida cronometrada.
  const fullscreen = screen === 'sessao' || screen === 'treinar';

  let content: React.ReactNode;
  if (screen === 'sessao') {
    content = <Sessao navigate={navigate} />;
  } else if (screen === 'treinar') {
    const game = parts[1];
    content =
      game && (GAME_IDS as string[]).includes(game) ? (
        // A chave pelo jogo forca a remontagem ao trocar de treino. Sem ela o
        // React reaproveita a instancia e a tela de resultado do jogo anterior
        // continua na frente do jogo novo.
        <Treinar key={game} game={game as GameId} navigate={navigate} />
      ) : (
        <Inicio navigate={navigate} />
      );
  } else if (screen === 'relatorio') {
    content = <Relatorio navigate={navigate} />;
  } else if (screen === 'perfis') {
    content = <Perfis navigate={navigate} />;
  } else if (screen === 'ajustes') {
    content = <Ajustes navigate={navigate} />;
  } else {
    content = <Inicio navigate={navigate} />;
  }

  return (
    <>
      {content}
      {!fullscreen && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navegação principal"
        >
          <ul className="mx-auto flex max-w-xl">
            {NAV.map((item) => {
              const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
              return (
                <li key={item.href} className="flex-1">
                  <button
                    onClick={() => navigate(item.href)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[0.7em] font-semibold ${
                      active ? 'text-brand' : 'text-muted'
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={ICONS[item.href]} />
                    </svg>
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
