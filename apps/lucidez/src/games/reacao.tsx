import { useCallback, useEffect, useRef, useState } from 'react';
import { challengeParams } from '@/core/adaptive';
import { median, sd } from '@/core/stats';
import { GameHeader, Instructions, Stage, beep, randomBetween, useTimers, type GameProps } from './shell';

/**
 * Tempo de reacao simples (inspirado no PVT).
 *
 * O bloco calibrado tem sempre 20 tentativas e o mesmo intervalo aleatorio de
 * espera. O intervalo precisa ser imprevisivel: com espera fixa a pessoa
 * aprende o ritmo e passa a antecipar, e ai o teste mede metronomo, nao
 * atencao.
 */
const TRIALS = 20;
const WAIT_MIN_MS = 1200;
const WAIT_MAX_MS = 3800;
/** Abaixo disso o toque saiu antes do processamento do estimulo: foi chute. */
const ANTICIPATION_MS = 150;
/** Acima disso a atencao escapou: e um lapso, nao uma resposta lenta. */
const LAPSE_MS = 1000;
const TIMEOUT_MS = 3000;

type Phase = 'intro' | 'espera' | 'vai' | 'feedback' | 'fim';

export function Reacao({ block, level, sound, onDone, onQuit }: GameProps) {
  const totalTrials = block === 'desafio' ? challengeParams(level).trials : TRIALS;
  const deadline = block === 'desafio' ? challengeParams(level).deadlineMs : LAPSE_MS;

  const [phase, setPhase] = useState<Phase>('intro');
  const [trial, setTrial] = useState(0);
  const [feedback, setFeedback] = useState('');
  const timers = useTimers();

  // Os dados do teste vivem em refs: sao lidos dentro de temporizadores e de
  // handlers de toque, onde um valor de estado ficaria congelado no tempo.
  // O contador de tentativas tambem, para que nenhuma decisao dependa de um
  // atualizador de estado — em modo estrito o React o executa duas vezes, e
  // agendar dois temporizadores por tentativa bagunçaria a medida.
  const rts = useRef<number[]>([]);
  const anticipations = useRef(0);
  const trialRef = useRef(0);
  const goAt = useRef(0);
  const startedAt = useRef(0);

  const finish = useCallback(() => {
    const values = rts.current;
    const lapses = values.filter((v) => v > LAPSE_MS).length;
    const beat = values.filter((v) => v <= deadline).length;
    onDone({
      metrics: {
        medianRt: Math.round(median(values)),
        sdRt: Math.round(sd(values)),
        anticipations: anticipations.current,
        lapses,
        validTrials: values.length,
        trials: totalTrials,
      },
      durationMs: Math.round(performance.now() - startedAt.current),
      accuracy: totalTrials > 0 ? beat / totalTrials : 0,
    });
  }, [deadline, onDone, totalTrials]);

  const nextTrial = useCallback(() => {
    const next = trialRef.current + 1;
    if (next >= totalTrials) {
      setPhase('fim');
      return;
    }
    trialRef.current = next;
    setTrial(next);
    setPhase('espera');
    timers.after(randomBetween(WAIT_MIN_MS, WAIT_MAX_MS), () => {
      goAt.current = performance.now();
      setPhase('vai');
      timers.after(TIMEOUT_MS, () => {
        rts.current.push(TIMEOUT_MS);
        setFeedback('Passou do tempo');
        setPhase('feedback');
        timers.after(900, nextTrial);
      });
    });
  }, [timers, totalTrials]);

  const start = useCallback(() => {
    rts.current = [];
    anticipations.current = 0;
    trialRef.current = -1;
    startedAt.current = performance.now();
    nextTrial();
  }, [nextTrial]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  function handleTap() {
    if (phase === 'espera') {
      timers.clearAll();
      anticipations.current++;
      beep(false, sound);
      setFeedback('Cedo demais — espere o verde');
      setPhase('feedback');
      timers.after(1100, nextTrial);
      return;
    }
    if (phase === 'vai') {
      timers.clearAll();
      const rt = Math.round(performance.now() - goAt.current);
      if (rt < ANTICIPATION_MS) {
        anticipations.current++;
        setFeedback('Cedo demais');
      } else {
        rts.current.push(rt);
        beep(true, sound);
        setFeedback(`${rt} ms`);
      }
      setPhase('feedback');
      timers.after(700, nextTrial);
    }
  }

  if (phase === 'intro') {
    return <Instructions game="reacao" block={block} onStart={start} onQuit={onQuit} />;
  }

  const green = phase === 'vai';
  return (
    <Stage>
      <GameHeader
        label="Reflexo"
        progress={`${Math.min(trial + 1, totalTrials)}/${totalTrials}`}
        onQuit={onQuit}
      />
      <button
        onPointerDown={handleTap}
        aria-label={green ? 'Toque agora' : 'Aguarde o verde'}
        className={`m-4 flex flex-1 flex-col items-center justify-center rounded-3xl border-2 text-center transition-colors ${
          green ? 'border-ok bg-ok text-white' : 'border-line bg-surface-2 text-muted'
        }`}
      >
        <span className="text-[1.6em] font-bold">
          {phase === 'feedback' ? feedback : green ? 'TOQUE!' : 'Espere...'}
        </span>
        {!green && phase !== 'feedback' && (
          <span className="mt-2 text-[0.95em]">A tela vai ficar verde a qualquer momento</span>
        )}
      </button>
    </Stage>
  );
}
