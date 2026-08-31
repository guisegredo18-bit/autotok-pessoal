import { useCallback, useEffect, useState } from 'react';
import { levelOf, nextLevel } from '@/core/adaptive';
import { GAMES } from '@/core/domains';
import { plural } from '@/core/format';
import type { CheckIn, GameId, Session } from '@/core/types';
import { GAME_COMPONENTS, gameSummary, type GameOutcome } from '@/games';
import { Badge, Button, Card, ClinicalNote, Page } from '@/components/ui';
import { useStore } from '@/state/store';

type Step =
  | { kind: 'carregando' }
  | { kind: 'checkin' }
  | { kind: 'jogo'; index: number; block: 'calibrado' | 'desafio' }
  | { kind: 'resultado'; index: number; game: GameId; metrics: Record<string, number>; score: number; valid: boolean; reason: string | null }
  | { kind: 'fim' };

export function Sessao({ navigate }: { navigate: (to: string) => void }) {
  const store = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'carregando' });

  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    if (!store.profile) return;
    let cancelled = false;
    void store
      .openTodaySession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);

        // Retomar uma sessao interrompida nao pode refazer o que ja foi
        // medido hoje: repetir o mesmo jogo no mesmo dia grava um segundo
        // resultado, e o ganho de tanto praticar entraria no grafico como
        // melhora cognitiva.
        const played = new Set(
          store.results.filter((r) => r.sessionId === s.id && r.block === 'calibrado').map((r) => r.game),
        );
        const pending = s.planned.findIndex((game) => !played.has(game));
        if (pending === -1) {
          setStep({ kind: 'fim' });
          return;
        }
        setStartIndex(pending);
        setStep(s.checkIn ? { kind: 'jogo', index: pending, block: 'calibrado' } : { kind: 'checkin' });
      })
      .catch(() => {
        if (!cancelled) setStep({ kind: 'fim' });
      });
    return () => {
      cancelled = true;
    };
    // Abre a sessao do dia uma unica vez ao entrar na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishGame = useCallback(
    async (game: GameId, block: 'calibrado' | 'desafio', index: number, outcome: GameOutcome) => {
      if (!session) return;
      const result = await store.recordResult({
        sessionId: session.id,
        game,
        block,
        metrics: outcome.metrics,
        durationMs: outcome.durationMs,
      });

      if (block === 'desafio') {
        // A escada so se move no bloco desafio. Mexer nela a partir do bloco
        // calibrado mudaria a prova que serve justamente de regua fixa.
        const level = levelOf(store.profile?.difficulty ?? {}, game);
        await store.setDifficulty(game, nextLevel(level, outcome.accuracy));
      }

      setStep({
        kind: 'resultado',
        index,
        game,
        metrics: outcome.metrics,
        score: result.score,
        valid: result.valid,
        reason: result.invalidReason,
      });
    },
    [session, store],
  );

  const advance = useCallback(
    async (index: number) => {
      if (!session) return;
      const next = index + 1;
      if (next >= session.planned.length) {
        await store.finishSession(session.id);
        setStep({ kind: 'fim' });
        return;
      }
      setStep({ kind: 'jogo', index: next, block: 'calibrado' });
    },
    [session, store],
  );

  if (!store.profile) {
    return (
      <Page title="Nenhum perfil">
        <Card>
          <p>Escolha ou crie um perfil antes de começar.</p>
          <Button className="mt-3" onClick={() => navigate('/perfis')}>
            Ir para perfis
          </Button>
        </Card>
      </Page>
    );
  }

  if (step.kind === 'carregando' || !session) {
    return (
      <Page title="Preparando...">
        <Card>Abrindo a sessão de hoje.</Card>
      </Page>
    );
  }

  if (step.kind === 'checkin') {
    return (
      <CheckInForm
        onSubmit={async (checkIn) => {
          await store.setCheckIn(session.id, checkIn);
          setStep({ kind: 'jogo', index: startIndex, block: 'calibrado' });
        }}
        onSkip={() => setStep({ kind: 'jogo', index: startIndex, block: 'calibrado' })}
      />
    );
  }

  if (step.kind === 'jogo') {
    const game = session.planned[step.index];
    if (!game) return null;
    const Game = GAME_COMPONENTS[game];
    return (
      <Game
        key={`${game}-${step.block}-${step.index}`}
        block={step.block}
        level={levelOf(store.profile.difficulty, game)}
        sound={store.profile.settings.sound}
        onDone={(outcome) => void finishGame(game, step.block, step.index, outcome)}
        onQuit={() => navigate('/')}
      />
    );
  }

  if (step.kind === 'resultado') {
    const meta = GAMES[step.game];
    const remaining = session.planned.length - step.index - 1;
    return (
      <Page title="Rodada concluída" subtitle={meta.name}>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[2em] leading-none" aria-hidden>
              {meta.icon}
            </span>
            {step.valid ? (
              <Badge tone="marca">{step.score.toFixed(0)} pontos</Badge>
            ) : (
              <Badge tone="atencao">rodada não contabilizada</Badge>
            )}
          </div>
          {step.valid ? (
            <p className="mt-3 text-[1.05em]">{gameSummary(step.game, step.metrics)}</p>
          ) : (
            <>
              <p className="mt-3 text-[1.05em] font-semibold">{step.reason}</p>
              <p className="mt-1 text-[0.92em] text-muted">
                Esta rodada fica de fora da linha do tempo. Pode seguir em frente — só entram na
                análise as medidas em que dá para confiar.
              </p>
            </>
          )}
        </Card>

        <div className="mt-4 grid gap-3">
          {store.profile.settings.challengeBlock && (
            <Button
              variant="secondary"
              full
              onClick={() => setStep({ kind: 'jogo', index: step.index, block: 'desafio' })}
            >
              Rodada extra, mais difícil
            </Button>
          )}
          <Button full onClick={() => void advance(step.index)}>
            {remaining > 0
              ? `Próximo jogo — ${remaining === 1 ? 'falta 1' : `faltam ${remaining}`}`
              : 'Terminar sessão'}
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Sessão concluída" subtitle="Obrigado — até amanhã.">
      <Card>
        <p className="text-[1.05em]">
          Você fez {plural(session.planned.length, 'jogo', 'jogos')} hoje. Cada sessão deixa a linha
          do tempo um pouco mais confiável.
        </p>
      </Card>
      <div className="mt-4 grid gap-3">
        <Button full onClick={() => navigate('/relatorio')}>
          Ver relatório
        </Button>
        <Button variant="secondary" full onClick={() => navigate('/')}>
          Voltar ao início
        </Button>
      </div>
      <ClinicalNote className="mt-6" />
    </Page>
  );
}

const SLEEP_LABELS = ['Muito mal', 'Mal', 'Ok', 'Bem', 'Muito bem'];
const MOOD_LABELS = ['Muito mal', 'Mal', 'Ok', 'Bem', 'Muito bem'];

/**
 * Tres perguntas antes de jogar.
 *
 * Sem elas, uma queda de duas semanas por causa de insonia ou remedio trocado
 * fica indistinguivel de uma queda cognitiva — e essa confusao e exatamente o
 * que assusta uma familia a toa. Sao opcionais: obrigar responde tudo com
 * "ok" e piora o dado.
 */
function CheckInForm({ onSubmit, onSkip }: { onSubmit(checkIn: CheckIn): void; onSkip(): void }) {
  const [sleep, setSleep] = useState(3);
  const [mood, setMood] = useState(3);
  // `undefined` = ninguem respondeu ainda; `null` = a pessoa respondeu que
  // nao usa remedio. Sem essa distincao o botao "Nao uso" ja aparecia marcado
  // e o app gravava como resposta uma afirmacao que ninguem fez.
  const [meds, setMeds] = useState<boolean | null | undefined>(undefined);

  return (
    <Page title="Antes de começar" subtitle="Três perguntas rápidas. Elas ajudam a explicar os dias fora da curva.">
      <Card>
        <Scale label="Como você dormiu?" labels={SLEEP_LABELS} value={sleep} onChange={setSleep} />
        <div className="mt-5">
          <Scale label="Como está se sentindo hoje?" labels={MOOD_LABELS} value={mood} onChange={setMood} />
        </div>
        <div className="mt-5">
          <p className="mb-2 font-semibold">Tomou os remédios como de costume?</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: true, label: 'Sim' },
              { value: false, label: 'Não' },
              { value: null, label: 'Não uso' },
            ].map((option) => (
              <button
                key={String(option.value)}
                onClick={() => setMeds(option.value)}
                className={`rounded-xl border-2 px-2 py-3 font-semibold ${
                  meds === option.value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-3">
        <Button full onClick={() => onSubmit({ sleep, mood, meds: meds ?? null, notes: '' })}>
          Começar os jogos
        </Button>
        <Button variant="ghost" full onClick={onSkip}>
          Pular estas perguntas
        </Button>
      </div>
    </Page>
  );
}

function Scale({
  label,
  labels,
  value,
  onChange,
}: {
  label: string;
  labels: string[];
  value: number;
  onChange(value: number): void;
}) {
  return (
    <div>
      <p className="mb-2 font-semibold">{label}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {labels.map((text, i) => (
          <button
            key={text}
            onClick={() => onChange(i + 1)}
            aria-pressed={value === i + 1}
            className={`rounded-xl border-2 px-1 py-2 text-[0.75em] font-semibold leading-tight ${
              value === i + 1 ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
