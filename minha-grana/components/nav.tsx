'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Painel', icon: '$' },
  { href: '/importar', label: 'Importar', icon: '↓' },
  { href: '/config', label: 'Config', icon: '⚙' },
];

/**
 * Barra inferior fixa, no lugar onde o polegar alcanca. `paddingBottom` com
 * `env(safe-area-inset-bottom)` respeita a area do indicador de home do
 * iPhone — sem isso o ultimo item fica embaixo da barra do sistema e vira
 * quase intocavel.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
