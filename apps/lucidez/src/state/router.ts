import { useCallback, useEffect, useState } from 'react';

/**
 * Roteador por hash, escrito a mao.
 *
 * O app tem cinco telas e e servido como arquivo estatico, as vezes de um
 * subdiretorio. Uma biblioteca de rotas resolveria problemas que este app nao
 * tem e o hash funciona em qualquer hospedagem sem configuracao de servidor.
 */
function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/';
}

export function useRoute(): { path: string; navigate: (to: string) => void } {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    if (currentPath() === to) return;
    window.location.hash = to;
    // O evento hashchange e assincrono; atualizar aqui evita um quadro com a
    // tela antiga ainda pintada.
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  return { path, navigate };
}

export function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}
