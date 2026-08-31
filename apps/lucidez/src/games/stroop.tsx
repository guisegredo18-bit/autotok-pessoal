import { useCallback, useEffect, useRef, useState } from 'react';
import { challengeParams } from '@/core/adaptive';
import { mean } from '@/core/stats';
import { GameHeader, Instructions, Stage, beep, shuffle, useTimers, type GameProps } from './shell';

/**
 * Stroop de cor e palavra.
 *
 * As quatro cores foram escolhidas para se distinguirem por luminancia, e nao
 * so por matiz, e os botoes trazem o NOME escrito em tinta neutra: assim quem
 * tem dificuldade com cores ainda consegue escolher a resposta certa. Ainda
 * assim o jogo depende de enxergar cor — quem nao distingue vermelho de verde
 * deve deixar este teste de fora, e o relatorio funciona sem ele.
 */
const COLORS = [
  { id: 'vermelho', label: 'Vermelho', hex: '#c62828' },
  { id: 'azul', label: 'Azul', hex: '#1f57c3' },
  { id: 'verde', label: 'Verde', hex: '#1b7f3b' },
  { id: 'roxo', label: 'Roxo', hex: '#6a2ea8' },
] as const;

type ColorId = (typeof COLORS)[number]['id'];

const TRIALS = 40;
const DEADLINE_MS = 3000;
const GAP_MS = 320;

type Phase = 'intro' | 'rodando' | 'fim';

interface Trial {
  /** Palavra escrita. */
  word: ColorId;
  /** Cor da tinta: a resposta certa. */
  ink: ColorId;
  congruent: boolean;
}

function buildTrials(total: number): Trial[] {
  const half = Math.floor(total / 2);
  const list: Trial[] = [];
  for (let i = 0; i < half; i++) {
    const color = COLORS[i % COLORS.length]!.id;
    list.push({ word: color, ink: color, congruent: true });
  }
  for (let i = 0; i < total - half; i++) {
    const ink = COLORS[i % COLORS.length]!.id;
    const others = COLORS.filter((c) => c.id !== ink);
    const word = others[i % others.length]!.id;
    list.push({ word, ink, congruent: false });
  }
  return shuffle(list);
}

export function Stroop({ block, level, sound, onDone, onQuit }: GameProps) {
  const total = block === 'desafio' ? Math.max(20, challengeParams(level).trials * 2) : TRIALS;
  const deadline = block === 'desafio' ? challengeParams(level).deadlineMs : DEADLINE_MS;

  const [phase, setPhase] = useState<Phase>('intro');
  const [trial, setTrial] = useState<Trial | null>(null);
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'erro' | null>(null);

  const timers = useTimers();
  const trials = useRef<Trial[]>([]);
  const indexRef = useRef(0);
  const answered = useRef(false);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const congRts = useRef<number[]>([]);
  const incongRts = useRef<number[]>([]);
  const congCorrect = useRef(0);
  const incongCorrect = useRef(0);

  const finish = useCallback(() => {
    const congruentTrials = trials.current.filter((t) => t.congruent).length;
    onDone({
      metrics: {
        congruentRt: Math.round(mean(congRts.current)),
        incongruentRt: Math.round(mean(incongRts.current)),
        congruentTrials,
        incongruentTrials: trials.current.length - congruentTrials,
        congruentCorrect: congCorrect.current,
        incongruentCorrect: incongCorrect.current,
        interferenceMs: Math.round(mean(incongRts.current) - mean(congRts.current)),
      },
      durationMs: Math.round(performance.now() - startedAt.current),
      accuracy: total > 0 ? (congCorrect.current + incongCorrect.current) / total : 0,
    });
  }, [onDone, total]);

  const runTrial = useCallback(() => {
    const i = indexRef.current;
    if (i >= trials.current.length) {
      setTrial(null);
      setPhase('fim');
      return;
    }
    answered.current = false;
    shownAt.current = performance.now();
    setIndex(i);
    setTrial(trials.current[i]!);
    timers.after(deadline, () => {
      if (answered.current) return;
      // Estourar o tempo conta como erro: no Stroop, demorar demais e a mesma
      // falha de controle que responder errado.
      answered.current = true;
      setFlash('erro');
      timers.after(200, () => setFlash(null));
      indexRef.current = i + 1;
      setTrial(null);
      timers.after(GAP_MS, runTrial);
    });
  }, [deadline, timers]);

  const start = useCallback(() => {
    trials.current = buildTrials(total);
    indexRef.current = 0;
    congRts.current = [];
    incongRts.current = [];
    congCorrect.current = 0;
    incongCorrect.current = 0;
    startedAt.current = performance.now();
    setPhase('rodando');
    runTrial();
  }, [runTrial, total]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  function answer(choice: ColorId) {
    if (phase !== 'rodando' || !trial || answered.current) return;
    answered.current = true;
    timers.clearAll();

    const rt = performance.now() - shownAt.current;
    const hit = choice === trial.ink;
    if (hit) {
      // Só os acertos entram na media de tempo: o tempo de um erro mede outra
      // coisa (a pessoa respondeu rapido justamente por nao ter conferido).
      if (trial.congruent) {
        congRts.current.push(rt);
        congCorrect.current++;
      } else {
        incongRts.current.push(rt);
        incongCorrect.current++;
      }
    }
    beep(hit, sound);
    setFlash(hit ? 'ok' : 'erro');
    timers.after(200, () => setFlash(null));

    indexRef.current++;
    setTrial(null);
    timers.after(GAP_MS, runTrial);
  }

  if (phase === 'intro') {
    return <Instructions game="stroop" block={block} onStart={start} onQuit={onQuit} />;
  }

  const word = trial ? COLORS.find((c) => c.id === trial.word)! : null;
  const ink = trial ? COLORS.find((c) => c.id === trial.ink)! : null;

  return (
    <Stage>
      <GameHeader label="Cor certa" progress={`${index + 1}/${total}`} onQuit={onQuit} />
      <div
        className={`m-4 flex flex-1 items-center justify-center rounded-3xl border-2 ${
          flash === 'erro' ? 'border-bad bg-bad-soft' : flash === 'ok' ? 'border-ok bg-ok-soft' : 'border-line bg-surface'
        }`}
      >
        <span
          className="text-[2.6em] font-extrabold uppercase tracking-wide"
          style={{ color: ink?.hex }}
          aria-label={trial ? `Palavra ${word?.label} escrita em ${ink?.label}` : 'Aguarde'}
        >
          {word?.label ?? '•'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-6">
        {COLORS.map((color) => (
          <button
            key={color.id}
            onPointerDown={() => answer(color.id)}
            className="flex h-16 items-center justify-center rounded-2xl border-2 border-line bg-surface font-bold"
          >
            <span className="mr-2 inline-block h-5 w-5 rounded-full" style={{ background: color.hex }} aria-hidden />
            {color.label}
          </button>
        ))}
      </div>
      <p className="px-6 pb-6 text-center text-[0.9em] text-muted">
        Responda a <strong>cor da tinta</strong>, não a palavra.
      </p>
    </Stage>
  );
}
