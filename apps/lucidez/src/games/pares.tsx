import { useCallback, useEffect, useRef, useState } from 'react';
import { challengeParams } from '@/core/adaptive';
import { GameHeader, Instructions, Stage, beep, shuffle, useTimers, type GameProps } from './shell';

/**
 * Jogo da memoria classico.
 *
 * A medida principal e o numero de jogadas, nao o tempo: quem esta lento mas
 * lembra onde as cartas estao continua eficiente, e e a lembranca que este
 * jogo quer medir. O tempo entra so como um quarto do peso.
 */
const PAIRS = 6;
const MISMATCH_MS = 900;

const SYMBOLS = ['🍎', '🌻', '🐟', '🔑', '⭐', '🚗', '🏠', '☂️', '🎈', '🍋', '🐘', '⚽'];

type Phase = 'intro' | 'jogando' | 'fim';

interface Card {
  key: number;
  symbol: string;
  matched: boolean;
}

export function Pares({ block, level, sound, onDone, onQuit }: GameProps) {
  const pairs = block === 'desafio' ? challengeParams(level).pairs : PAIRS;

  const [phase, setPhase] = useState<Phase>('intro');
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const timers = useTimers();
  const locked = useRef(false);
  const startedAt = useRef(0);
  const movesRef = useRef(0);
  const matchedRef = useRef(0);

  const finish = useCallback(() => {
    onDone({
      metrics: {
        pairs,
        moves: movesRef.current,
        durationMs: Math.round(performance.now() - startedAt.current),
        completed: matchedRef.current,
      },
      durationMs: Math.round(performance.now() - startedAt.current),
      accuracy: movesRef.current > 0 ? Math.min(1, (1.6 * pairs) / movesRef.current) : 0,
    });
  }, [onDone, pairs]);

  const start = useCallback(() => {
    const chosen = shuffle(SYMBOLS).slice(0, pairs);
    setCards(shuffle([...chosen, ...chosen]).map((symbol, key) => ({ key, symbol, matched: false })));
    setOpen([]);
    setMoves(0);
    movesRef.current = 0;
    matchedRef.current = 0;
    locked.current = false;
    startedAt.current = performance.now();
    setPhase('jogando');
  }, [pairs]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  function handleCard(index: number) {
    if (phase !== 'jogando' || locked.current) return;
    if (open.includes(index) || cards[index]?.matched) return;

    const next = [...open, index];
    setOpen(next);
    if (next.length < 2) return;

    movesRef.current++;
    setMoves(movesRef.current);
    const [a, b] = next as [number, number];

    if (cards[a]!.symbol === cards[b]!.symbol) {
      matchedRef.current++;
      beep(true, sound);
      setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)));
      setOpen([]);
      if (matchedRef.current === pairs) timers.after(450, () => setPhase('fim'));
      return;
    }

    // Trava a tela durante a exibicao do par errado. Sem isso, tocar rapido em
    // outra carta faria o par sumir antes de ser visto — e o jogo mediria
    // reflexo, nao memoria.
    locked.current = true;
    beep(false, sound);
    timers.after(MISMATCH_MS, () => {
      setOpen([]);
      locked.current = false;
    });
  }

  if (phase === 'intro') {
    return <Instructions game="pares" block={block} onStart={start} onQuit={onQuit} />;
  }

  const columns = pairs <= 6 ? 3 : 4;
  return (
    <Stage>
      <GameHeader
        label="Pares"
        progress={`${matchedRef.current}/${pairs} · ${moves} jogadas`}
        onQuit={onQuit}
      />
      <div className="flex flex-1 items-center justify-center px-4">
        <div
          className="grid w-full max-w-sm gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cards.map((card, index) => {
            const shown = card.matched || open.includes(index);
            return (
              <button
                key={card.key}
                onPointerDown={() => handleCard(index)}
                aria-label={shown ? `Carta ${card.symbol}` : 'Carta virada para baixo'}
                className={`flex aspect-square items-center justify-center rounded-2xl border-2 text-[2em] transition-colors ${
                  card.matched
                    ? 'border-ok bg-ok-soft'
                    : shown
                      ? 'border-brand bg-surface'
                      : 'border-line bg-surface-2'
                }`}
              >
                <span aria-hidden>{shown ? card.symbol : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Stage>
  );
}
