'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Recarrega os dados da tela enquanto houver trabalho em andamento.
 *
 * Renderizar leva minutos e acontece em outra maquina, entao sem isso voce
 * ficaria puxando a tela para baixo sem saber se ja acabou. Como o componente
 * so e montado quando ha algo rodando, a tela fica parada (e sem gastar
 * bateria) no resto do tempo.
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
