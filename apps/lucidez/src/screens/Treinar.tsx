import { useCallback, useEffect, useState } from 'react';
import { levelOf, nextLevel } from '@/core/adaptive';
import { GAMES } from '@/core/domains';
import type { GameId, Session } from '@/core/types';
import { GAME_COMPONENTS, gameSummary } from '@/games';
import { Badge, Button, Card, Page } from '@/components/ui';
import { useStore } from '@/state/store';

/**
 * Treino livre.
 *
 * Sempre gravado como bloco desafio, mesmo quando a pessoa nunca fez a sessao
 * do dia. Jogar tres vezes o mesmo jogo numa tarde e otimo para a pessoa e
 * pessimo para a medida: entraria como "tres sessoes" e o efeito de pratica
 * viraria "melhora cognitiva" no grafico.
 */
export function Treinar({ game, navigate }: { game: GameId; navigate: (to: string) => void }) {
  const store = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [done, setDone] = useState<{ metrics: Record<string, number>; score: number } | null>(null);

  useEffect(() => {
    if (!store.profile) return;
    let cancelled = false;
    void store
      .openTodaySession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = useCallback(
    async (metrics: Record<string, number>, durationMs: number, accuracy: number) => {
      if (!session) return;
      const result = await store.recordResult({
        sessionId: session.id,
        game,
        block: 'desafio',
        metrics,
        durationMs,
      });
      const level = levelOf(store.profile?.difficulty ?? {}, game);
      await store.setDifficulty(game, nextLevel(level, accuracy));
      setDone({ metrics, score: result.score });
    },
    [game, session, store],
  );

  if (!store.profile || !session) {
    return (
      <Page title="Preparando...">
        <Card>Um instante.</Card>
      </Page>
    );
  }

  if (done) {
    const meta = GAMES[game];
    return (
      <Page title="Boa!" subtitle={`${meta.name} · treino livre`}>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[2em] leading-none" aria-hidden>
              {meta.icon}
            </span>
            <Badge tone="neutro">fora da linha do tempo</Badge>
          </div>
          <p className="mt-3 text-[1.05em]">{gameSummary(game, done.metrics)}</p>
          <p className="mt-2 text-[0.9em] text-muted">
            Treinos livres deixam o jogo mais difícil na próxima vez, mas não entram na análise —
            só a sessão diária entra.
          </p>
        </Card>
        <div className="mt-4 grid gap-3">
          <Button full onClick={() => setDone(null)}>
            Jogar de novo
          </Button>
          <Button variant="secondary" full onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </div>
      </Page>
    );
  }

  const Game = GAME_COMPONENTS[game];
  return (
    <Game
      block="desafio"
      level={levelOf(store.profile.difficulty, game)}
      sound={store.profile.settings.sound}
      onDone={(outcome) => void handleDone(outcome.metrics, outcome.durationMs, outcome.accuracy)}
      onQuit={() => navigate('/')}
    />
  );
}
