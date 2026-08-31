import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHeader, Instructions, Stage, beep, shuffle, useTimers, type GameProps } from './shell';
import { Button, Card } from '@/components/ui';

/**
 * Trail Making A e B, adaptado para tela de celular.
 *
 * O original em papel usa 25 circulos; numa tela de mao isso vira um amontoado
 * em que errar o alvo e erro de dedo, nao de cognicao. Usamos 15 na parte A e
 * 16 na B, com alvos grandes. O numero e sempre o mesmo, e e o que importa:
 * a comparacao e entre sessoes da mesma pessoa no mesmo formato.
 *
 * A medida que interessa nao e o tempo da parte B sozinho, e a distancia entre
 * B e A. A parte A carrega visao, motricidade e busca visual; B carrega tudo
 * isso mais a alternancia entre duas regras. A razao entre as duas isola o
 * custo de alternar de quem simplesmente ficou mais lento.
 */
const NODES_A = 15;
const SEQUENCE_B = ['1', 'A', '2', 'B', '3', 'C', '4', 'D', '5', 'E', '6', 'F', '7', 'G', '8', 'H'];
const COLS = 4;
const ROWS = 5;

type Phase = 'intro' | 'pronto-a' | 'parte-a' | 'pronto-b' | 'parte-b' | 'fim';

interface Node {
  label: string;
  x: number;
  y: number;
}

/** Distribui os alvos em celulas distintas de uma grade invisivel, com um
 *  tremor pequeno o bastante para nunca encostar um alvo no vizinho. */
function layout(labels: string[]): Node[] {
  const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i)).slice(0, labels.length);
  return labels.map((label, i) => {
    const cell = cells[i]!;
    const cx = cell % COLS;
    const cy = Math.floor(cell / COLS);
    const jx = (Math.random() - 0.5) * 0.34;
    const jy = (Math.random() - 0.5) * 0.34;
    return {
      label,
      x: ((cx + 0.5 + jx) / COLS) * 100,
      y: ((cy + 0.5 + jy) / ROWS) * 100,
    };
  });
}

export function Trilhas({ block, sound, onDone, onQuit }: GameProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [done, setDone] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);

  const timers = useTimers();
  const sequence = useRef<string[]>([]);
  const doneRef = useRef(0);
  const startedAt = useRef(0);
  const timeA = useRef(0);
  const errorsA = useRef(0);
  const errorsB = useRef(0);
  const totalStart = useRef(0);

  const beginPart = useCallback((part: 'a' | 'b') => {
    const labels =
      part === 'a' ? Array.from({ length: NODES_A }, (_, i) => String(i + 1)) : [...SEQUENCE_B];
    sequence.current = labels;
    setNodes(layout(labels));
    setDone(0);
    doneRef.current = 0;
    setWrong(null);
    startedAt.current = performance.now();
    setPhase(part === 'a' ? 'parte-a' : 'parte-b');
  }, []);

  const start = useCallback(() => {
    errorsA.current = 0;
    errorsB.current = 0;
    totalStart.current = performance.now();
    setPhase('pronto-a');
  }, []);

  const finish = useCallback(() => {
    const timeB = Math.round(performance.now() - startedAt.current);
    const errors = errorsA.current + errorsB.current;
    onDone({
      metrics: {
        timeAMs: Math.round(timeA.current),
        errorsA: errorsA.current,
        timeBMs: timeB,
        errorsB: errorsB.current,
        completedB: 1,
        nodesA: NODES_A,
        nodesB: SEQUENCE_B.length,
      },
      durationMs: Math.round(performance.now() - totalStart.current),
      accuracy: Math.max(0, 1 - errors / (NODES_A + SEQUENCE_B.length)),
    });
  }, [onDone]);

  useEffect(() => {
    if (phase === 'fim') finish();
  }, [phase, finish]);

  function handleNode(label: string) {
    const expected = sequence.current[doneRef.current];
    if (label !== expected) {
      if (phase === 'parte-a') errorsA.current++;
      else errorsB.current++;
      beep(false, sound);
      setWrong(label);
      timers.after(400, () => setWrong(null));
      return;
    }

    doneRef.current++;
    setDone(doneRef.current);
    beep(true, sound);

    if (doneRef.current < sequence.current.length) return;

    if (phase === 'parte-a') {
      timeA.current = performance.now() - startedAt.current;
      setPhase('pronto-b');
    } else {
      setPhase('fim');
    }
  }

  if (phase === 'intro') {
    return <Instructions game="trilhas" block={block} onStart={start} onQuit={onQuit} />;
  }

  if (phase === 'pronto-a' || phase === 'pronto-b') {
    const partA = phase === 'pronto-a';
    return (
      <Stage>
        <GameHeader label="Trilhas" progress={partA ? 'Parte 1 de 2' : 'Parte 2 de 2'} onQuit={onQuit} />
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4">
          <Card>
            <h2 className="text-[1.25em] font-bold">{partA ? 'Parte 1: só números' : 'Parte 2: alternando'}</h2>
            <p className="mt-2 text-[1.05em] leading-relaxed">
              {partA
                ? 'Toque nos números em ordem: 1, 2, 3, 4... até o 15. O relógio começa quando você tocar em Começar.'
                : 'Agora alterne: 1, depois A, depois 2, depois B, e assim por diante até o H. Errar não tira ponto grande — só continue de onde parou.'}
            </p>
          </Card>
          <Button full onClick={() => beginPart(partA ? 'a' : 'b')}>
            Começar
          </Button>
        </div>
      </Stage>
    );
  }

  const total = sequence.current.length;
  const nextLabel = sequence.current[doneRef.current] ?? '';

  return (
    <Stage>
      <GameHeader
        label={phase === 'parte-a' ? 'Trilhas · parte 1' : 'Trilhas · parte 2'}
        progress={`${done}/${total}`}
        onQuit={onQuit}
      />
      <p className="px-4 pb-2 text-center text-[1.05em]">
        Próximo: <strong className="text-brand">{nextLabel}</strong>
      </p>
      <div className="flex flex-1 items-start justify-center px-3 pb-6">
        <div className="relative aspect-[3/4] w-full max-w-md">
          {/* A linha ligando os alvos ja tocados da o retorno visual do
              caminho — sem ela a pessoa perde o fio de onde estava. */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {nodes.slice(0, Math.max(0, done - 1)).map((node, i) => {
              const next = nodes[i + 1]!;
              return (
                <line
                  key={node.label}
                  x1={node.x}
                  y1={node.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="var(--color-brand)"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.45"
                />
              );
            })}
          </svg>
          {nodes.map((node, i) => {
            const cleared = i < done;
            const isWrong = wrong === node.label;
            return (
              <button
                key={node.label}
                onPointerDown={() => handleNode(node.label)}
                style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
                className={`absolute flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 text-[1.05em] font-bold transition-colors ${
                  isWrong
                    ? 'border-bad bg-bad text-white'
                    : cleared
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-surface text-ink'
                }`}
              >
                {node.label}
              </button>
            );
          })}
        </div>
      </div>
    </Stage>
  );
}
