import { useCallback, useEffect, useRef, useState } from 'react';
import { challengeParams } from '@/core/adaptive';
import { GameHeader, Instructions, Stage, beep, useTimers, type GameProps } from './shell';

/**
 * Span espacial (na linha do teste de blocos de Corsi).
 *
 * Aqui a dificuldade e adaptativa nos dois blocos, e isso nao quebra a
 * comparacao no tempo: a medida e o proprio tamanho da maior sequencia
 * reproduzida, entao a escada faz parte do instrumento, nao e um ajuste de
 * conforto. O que fica fixo no bloco calibrado e o ponto de partida e a regra
 * de parada.
 */
const TILES = 9;
const START_SPAN = 3;
const MAX_SPAN = 9;
/** Duas chances por tamanho: erra as duas, o teste para. */
const ATTEMPTS_PER_SPAN = 2;
const ON_MS = 620;
const OFF_MS = 260;

type Phase = 'intro' | 'mostrando' | 'respondendo' | 'feedback' | 'fim';

function makeSequence(length: number): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const tile = Math.floor(Math.random() * TILES);
    // Repetir o mesmo quadro em seguida vira um piscar duplo ambiguo: a
    // pessoa nao sabe se viu um toque longo ou dois.
    if (out[out.length - 1] === tile) continue;
    out.push(tile);
  }
  return out;
}

export function Sequencia({ block, level, sound, onDone, onQuit }: GameProps) {
  const startSpan = block === 'desafio' ? challengeParams(level).startSpan : START_SPAN;

  const [phase, setPhase] = useState<Phase>('intro');
  const [lit, setLit] = useState<number | null>(null);
  const [entered, setEntered] = useState<number[]>([]);
  const [span, setSpan] = useState(startSpan);
  const [feedback, setFeedback] = useState('');

  const timers = useTimers();
  const sequence = useRef<number[]>([]);
  const spanRef = useRef(startSpan);
  const failures = useRef(0);
  const maxSpan = useRef(0);
  const correct = useRef(0);
  const trials = useRef(0);
  const startedAt = useRef(0);

  const finish = useCallback(() => {
    onDone({
      metrics: {
        maxSpan: maxSpan.current,
        correctTrials: correct.current,
        trials: trials.current,
        startSpan,
      },
      durationMs: Math.round(performance.now() - startedAt.current),
      accuracy: trials.current > 0 ? correct.current / trials.current : 0,
    });
  }, [onDone, startSpan]);

  const showSequence = useCallback(() => {
    sequence.current = makeSequence(spanRef.current);
    setSpan(spanRef.current);
    setEntered([]);
    setPhase('mostrando');

    sequence.current.forEach((tile, i) => {
      timers.after(i * (ON_MS + OFF_MS), () => setLit(tile));
      timers.after(i * (ON_MS + OFF_MS) + ON_MS, () => setLit(null));
    });
    timers.after(sequence.current.length * (ON_MS + OFF_MS) + 150, () => setPhase('respondendo'));
  }, [timers]);

  const start = useCallback(() => {
    spanRef.current = startSpan;
    failures.current = 0;
    maxSpan.current = 0;
    correct.current = 0;
    trials.current = 0;
    startedAt.current = performance.now();
    showSequence();
  }, [showSequence, startSpan]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  const judge = useCallback(
    (attempt: number[]) => {
      trials.current++;
      const hit = attempt.every((tile, i) => tile === sequence.current[i]);

      if (hit) {
        correct.current++;
        maxSpan.current = Math.max(maxSpan.current, spanRef.current);
        failures.current = 0;
        beep(true, sound);
        setFeedback(`Certo! Agora com ${spanRef.current + 1}`);
        setPhase('feedback');
        if (spanRef.current >= MAX_SPAN) {
          timers.after(1100, () => setPhase('fim'));
          return;
        }
        spanRef.current++;
        timers.after(1100, showSequence);
        return;
      }

      failures.current++;
      beep(false, sound);
      if (failures.current >= ATTEMPTS_PER_SPAN) {
        setFeedback('Terminamos aqui. Bom trabalho!');
        setPhase('feedback');
        timers.after(1200, () => setPhase('fim'));
        return;
      }
      setFeedback('Não foi dessa vez — mais uma tentativa');
      setPhase('feedback');
      timers.after(1200, showSequence);
    },
    [showSequence, sound, timers],
  );

  function handleTile(tile: number) {
    if (phase !== 'respondendo') return;
    const attempt = [...entered, tile];
    setEntered(attempt);
    setLit(tile);
    timers.after(180, () => setLit(null));

    // Julga assim que o erro aparece: obrigar a completar uma sequencia ja
    // perdida so acumula frustracao.
    const wrongSoFar = attempt.some((t, i) => t !== sequence.current[i]);
    if (wrongSoFar || attempt.length === sequence.current.length) {
      setPhase('feedback');
      timers.after(220, () => judge(attempt));
    }
  }

  if (phase === 'intro') {
    return <Instructions game="sequencia" block={block} onStart={start} onQuit={onQuit} />;
  }

  return (
    <Stage>
      <GameHeader label="Sequência" progress={`${span} quadros`} onQuit={onQuit} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <p className="min-h-[1.6em] text-center text-[1.05em] font-semibold">
          {phase === 'mostrando' && 'Observe...'}
          {phase === 'respondendo' && `Sua vez — ${entered.length}/${span}`}
          {phase === 'feedback' && feedback}
        </p>
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          {Array.from({ length: TILES }, (_, tile) => (
            <button
              key={tile}
              onPointerDown={() => handleTile(tile)}
              disabled={phase !== 'respondendo'}
              aria-label={`Quadro ${tile + 1}`}
              className={`aspect-square rounded-2xl border-2 transition-colors disabled:opacity-100 ${
                lit === tile ? 'border-brand bg-brand' : 'border-line bg-surface'
              }`}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}
