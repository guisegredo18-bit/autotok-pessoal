import { useMemo } from 'react';
import { GAMES } from '@/core/domains';
import { dayKey, sessionForDay, streak } from '@/core/session';
import { analyzeOverall, buildDayPoints, statusLabel, type TrendStatus } from '@/core/trend';
import { Badge, Button, Card, ClinicalNote, Empty, Page, type Tone } from '@/components/ui';
import { useStore } from '@/state/store';

const TONE_BY_STATUS: Record<TrendStatus, Tone> = {
  sem_dados: 'neutro',
  formando_base: 'neutro',
  estavel: 'bom',
  melhora: 'bom',
  melhora_forte: 'bom',
  queda: 'atencao',
  queda_forte: 'ruim',
};

export function Inicio({ navigate }: { navigate: (to: string) => void }) {
  const store = useStore();
  const today = dayKey();

  const points = useMemo(() => buildDayPoints(store.sessions, store.results), [store.sessions, store.results]);
  const overall = useMemo(() => analyzeOverall(points), [points]);

  if (!store.profile) {
    return (
      <Page title="Lucidez" subtitle="Treino e acompanhamento cognitivo diário.">
        <Empty
          icon="👤"
          title="Comece criando um perfil"
          detail="Cada pessoa tem o próprio histórico. Você pode ter vários perfis no mesmo aparelho."
          action={<Button onClick={() => navigate('/perfis')}>Criar perfil</Button>}
        />
        <ClinicalNote className="mt-6" />
      </Page>
    );
  }

  const done = sessionForDay(store.sessions, today);
  const doneToday = done?.completed === true;
  const dias = streak(store.sessions, today);

  return (
    <Page title={`Olá, ${store.profile.name}`} subtitle={doneToday ? 'Sessão de hoje concluída.' : 'Sua sessão de hoje leva poucos minutos.'}>
      {!store.durable && (
        <Card className="mb-4 border-warn/40 bg-warn-soft">
          <p className="text-[0.95em] text-warn">
            Este navegador não está guardando dados (janela anônima?). Você pode jogar, mas o
            histórico some ao fechar a aba.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[0.8em] font-semibold uppercase tracking-wide text-muted">Sequência</div>
            <div className="text-[2em] font-bold leading-tight">
              {dias}{' '}
              <span className="text-[0.5em] font-semibold text-muted">
                {dias === 1 ? 'dia seguido' : 'dias seguidos'}
              </span>
            </div>
          </div>
          <Badge tone={TONE_BY_STATUS[overall.status]}>{statusLabel(overall.status)}</Badge>
        </div>
        <Button className="mt-4" full onClick={() => navigate('/sessao')}>
          {doneToday ? 'Fazer uma rodada extra' : 'Começar a sessão de hoje'}
        </Button>
        {doneToday && (
          <p className="mt-2 text-center text-[0.88em] text-muted">
            Rodadas extras treinam, mas não entram na linha do tempo — só uma sessão por dia conta.
          </p>
        )}
      </Card>

      <h2 className="mb-2 mt-6 text-[1.1em] font-bold">Treinar um jogo</h2>
      <div className="grid grid-cols-2 gap-3">
        {Object.values(GAMES).map((game) => (
          <button
            key={game.id}
            onClick={() => navigate(`/treinar/${game.id}`)}
            className="card flex flex-col items-start gap-1 text-left"
          >
            <span className="text-[1.6em] leading-none" aria-hidden>
              {game.icon}
            </span>
            <span className="font-bold">{game.name}</span>
            <span className="text-[0.82em] leading-snug text-muted">{game.tagline}</span>
          </button>
        ))}
      </div>

      <ClinicalNote className="mt-6" />
    </Page>
  );
}
