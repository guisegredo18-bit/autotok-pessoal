import { useCallback, useEffect, useRef, useState } from 'react';
import { challengeParams } from '@/core/adaptive';
import { mean } from '@/core/stats';
import { GameHeader, Instructions, Stage, beep, shuffle, useTimers, type GameProps } from './shell';

/**
 * Go/No-Go.
 *
 * A maioria das tentativas pede resposta justamente para que responder vire
 * automatico — e so contra esse automatismo que da para medir inibicao. Com
 * 50/50 a pessoa fica alerta o tempo todo e o teste perde o que ele mede.
 */
const TRIALS = 60;
const NOGO_RATE = 0.3;
const STIMULUS_MS = 900;
const GAP_MS = 450;

type Kind = 'vai' | 'nao';
type Phase = 'intro' | 'contagem' | 'rodando' | 'fim';

function buildTrials(total: number): Kind[] {
  const nogo = Math.round(total * NOGO_RATE);
  const list: Kind[] = [
    ...Array<Kind>(total - nogo).fill('vai'),
    ...Array<Kind>(nogo).fill('nao'),
  ];
  // Embaralha ate que nenhum "nao vai" abra a sequencia: o primeiro estimulo
  // precisa ser um "vai" para o automatismo se instalar antes do primeiro
  // teste de inibicao.
  for (let attempt = 0; attempt < 20; attempt++) {
    const order = shuffle(list);
    if (order[0] === 'vai' && order[1] === 'vai') return order;
  }
  return shuffle(list);
}

export function GoNoGo({ block, level, sound, onDone, onQuit }: GameProps) {
  const total = block === 'desafio' ? Math.max(24, challengeParams(level).trials * 2) : TRIALS;
  const showMs = block === 'desafio' ? Math.max(420, challengeParams(level).deadlineMs / 2) : STIMULUS_MS;

  const [phase, setPhase] = useState<Phase>('intro');
  const [current, setCurrent] = useState<Kind | null>(null);
  const [flash, setFlash] = useState<'ok' | 'erro' | null>(null);
  const [index, setIndex] = useState(0);

  const timers = useTimers();
  const order = useRef<Kind[]>([]);
  const indexRef = useRef(0);
  const answered = useRef(false);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const goRts = useRef<number[]>([]);
  const omissions = useRef(0);
  const commissions = useRef(0);

  const finish = useCallback(() => {
    const nogoTrials = order.current.filter((k) => k === 'nao').length;
    const goTrials = order.current.length - nogoTrials;
    const hits = goRts.current.length;
    onDone({
      metrics: {
        goRt: Math.round(mean(goRts.current)),
        goTrials,
        omissions: omissions.current,
        nogoTrials,
        commissions: commissions.current,
        hits,
      },
      durationMs: Math.round(performance.now() - startedAt.current),
      accuracy:
        total > 0 ? (goTrials - omissions.current + (nogoTrials - commissions.current)) / total : 0,
    });
  }, [onDone, total]);

  const runTrial = useCallback(() => {
    const i = indexRef.current;
    if (i >= order.current.length) {
      setCurrent(null);
      setPhase('fim');
      return;
    }
    const kind = order.current[i]!;
    answered.current = false;
    shownAt.current = performance.now();
    setIndex(i);
    setCurrent(kind);

    timers.after(showMs, () => {
      // Fim da janela de resposta. Nao ter respondido a um "vai" e omissao;
      // nao ter respondido a um "nao vai" e exatamente o acerto esperado.
      if (!answered.current && kind === 'vai') omissions.current++;
      setCurrent(null);
      indexRef.current = i + 1;
      timers.after(GAP_MS, runTrial);
    });
  }, [showMs, timers]);

  const start = useCallback(() => {
    order.current = buildTrials(total);
    indexRef.current = 0;
    goRts.current = [];
    omissions.current = 0;
    commissions.current = 0;
    startedAt.current = performance.now();
    setPhase('rodando');
    runTrial();
  }, [runTrial, total]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  function handleTap() {
    if (phase !== 'rodando' || current === null || answered.current) return;
    answered.current = true;
    if (current === 'vai') {
      goRts.current.push(performance.now() - shownAt.current);
      beep(true, sound);
      setFlash('ok');
    } else {
      commissions.current++;
      beep(false, sound);
      setFlash('erro');
    }
    timers.after(260, () => setFlash(null));
  }

  if (phase === 'intro') {
    return <Instructions game="gonogo" block={block} onStart={start} onQuit={onQuit} />;
  }

  return (
    <Stage>
      <GameHeader label="Vai / Não vai" progress={`${index + 1}/${total}`} onQuit={onQuit} />
      <button
        onPointerDown={handleTap}
        aria-label="Área de toque"
        className={`m-4 flex flex-1 items-center justify-center rounded-3xl border-2 transition-colors ${
          flash === 'erro'
            ? 'border-bad bg-bad-soft'
            : flash === 'ok'
              ? 'border-ok bg-ok-soft'
              : 'border-line bg-surface'
        }`}
      >
        {current === 'vai' && (
          // Forma e cor juntas: quem nao distingue azul de laranja ainda
          // separa circulo de quadrado.
          <span
            className="block h-40 w-40 rounded-full bg-brand"
            role="img"
            aria-label="Círculo azul: toque"
          />
        )}
        {current === 'nao' && (
          <span
            className="block h-40 w-40 rounded-xl"
            style={{ background: '#d4700f' }}
            role="img"
            aria-label="Quadrado laranja: não toque"
          />
        )}
        {current === null && <span className="text-[1.2em] text-muted">•</span>}
      </button>
      <p className="px-6 pb-6 text-center text-[0.95em] text-muted">
        Círculo azul: toque. Quadrado laranja: espere.
      </p>
    </Stage>
  );
}
