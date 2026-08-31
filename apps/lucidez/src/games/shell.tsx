import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { GAMES } from '@/core/domains';
import type { Block, GameId } from '@/core/types';
import { Button, Card } from '@/components/ui';

export interface GameOutcome {
  metrics: Record<string, number>;
  durationMs: number;
  /** 0-1. Alimenta a escada de dificuldade do bloco desafio. */
  accuracy: number;
}

export interface GameProps {
  block: Block;
  /** Nivel 1-10; so o bloco desafio consulta. O calibrado e sempre igual. */
  level: number;
  sound: boolean;
  onDone(outcome: GameOutcome): void;
  onQuit(): void;
}

/** setTimeout com limpeza automatica. Sem isso, sair no meio de um jogo deixa
 *  temporizadores vivos que tentam pintar uma tela que ja nao existe. */
export function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const id of ids.current) window.clearTimeout(id);
      ids.current = [];
    },
    [],
  );
  return useMemo(
    () => ({
      after(ms: number, fn: () => void) {
        const id = window.setTimeout(fn, ms);
        ids.current.push(id);
        return id;
      },
      clearAll() {
        for (const id of ids.current) window.clearTimeout(id);
        ids.current = [];
      },
    }),
    [],
  );
}

// Reexportados para os jogos: a implementacao vive no nucleo, onde os testes
// alcancam.
export { randomBetween, shuffle } from '@/core/random';

/**
 * Bip curto de acerto/erro via WebAudio.
 *
 * Um <audio> exigiria arquivo e um primeiro toque para desbloquear; o
 * AudioContext e criado sob demanda, ja dentro de um gesto do usuario. Falhar
 * aqui nunca pode derrubar o jogo, entao todo o corpo e best-effort.
 */
export function beep(ok: boolean, enabled: boolean): void {
  if (!enabled) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch {
    /* som e enfeite: nunca deve interromper um teste. */
  }
}

/** Area de jogo: ocupa a tela toda e bloqueia gestos de rolagem/zoom que
 *  atrapalhariam um teste de toque rapido. */
export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-h-[100dvh] w-full select-none flex-col ${className}`}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
}

export function GameHeader({ label, progress, onQuit }: { label: string; progress?: string; onQuit(): void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4">
      <button onClick={onQuit} className="text-[0.9em] font-semibold text-muted" style={{ minHeight: 44 }}>
        ← Sair
      </button>
      <div className="text-[0.9em] font-semibold text-muted tabular-nums">{progress}</div>
      <div className="text-[0.9em] font-semibold">{label}</div>
    </div>
  );
}

/**
 * Tela de instrucao antes de cada jogo.
 *
 * Ela reaparece toda vez, e nao so na primeira. Quem tem perda de memoria nao
 * lembra da regra de ontem, e um teste feito com a regra errada nao mede
 * cognicao — mede confusao, e ainda estraga a linha do tempo.
 */
export function Instructions({
  game,
  block,
  onStart,
  onQuit,
}: {
  game: GameId;
  block: Block;
  onStart(): void;
  onQuit(): void;
}) {
  const meta = GAMES[game];
  return (
    <Stage>
      <GameHeader label={meta.name} onQuit={onQuit} />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-6">
        <div className="text-center text-[3em] leading-none" aria-hidden>
          {meta.icon}
        </div>
        <Card>
          <h2 className="text-[1.3em] font-bold">{meta.name}</h2>
          <p className="mt-2 text-[1.05em] leading-relaxed">{meta.howTo}</p>
          {block === 'desafio' && (
            <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-[0.9em] text-brand">
              Rodada extra, mais difícil. Ela não entra na sua linha do tempo — é só para treinar.
            </p>
          )}
        </Card>
        <Button full onClick={onStart}>
          Começar
        </Button>
      </div>
    </Stage>
  );
}
