import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { uid } from '@/core/id';
import { dayKey, planSession, sessionForDay } from '@/core/session';
import { scoreGame } from '@/core/scoring';
import type { Block, CheckIn, GameId, Profile, ProfileSettings, Session, TestResult } from '@/core/types';
import { getStore } from '@/storage/db';
import {
  deleteProfile,
  listProfiles,
  listResults,
  listSessions,
  newProfile,
  saveProfile,
  saveResult,
  saveSession,
} from '@/storage/repo';

interface State {
  ready: boolean;
  durable: boolean;
  profiles: Profile[];
  profile: Profile | null;
  sessions: Session[];
  results: TestResult[];
}

interface Actions {
  addProfile(input: { name: string; birthYear: number | null; condition: string }): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  updateSettings(patch: Partial<ProfileSettings>): Promise<void>;
  removeProfile(profileId: string): Promise<void>;
  selectProfile(profileId: string | null): Promise<void>;
  /** Abre (ou reaproveita) a sessao de hoje. */
  openTodaySession(): Promise<Session>;
  setCheckIn(sessionId: string, checkIn: CheckIn): Promise<void>;
  recordResult(input: {
    sessionId: string;
    game: GameId;
    block: Block;
    metrics: Record<string, number>;
    durationMs: number;
  }): Promise<TestResult>;
  finishSession(sessionId: string): Promise<void>;
  setDifficulty(game: GameId, level: number): Promise<void>;
  reload(): Promise<void>;
}

const ACTIVE_KEY = 'activeProfileId';

const StoreContext = createContext<(State & Actions) | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    ready: false,
    durable: true,
    profiles: [],
    profile: null,
    sessions: [],
    results: [],
  });

  const loadFor = useCallback(async (profiles: Profile[], activeId: string | null): Promise<State> => {
    const store = await getStore();
    const profile = profiles.find((p) => p.id === activeId) ?? null;
    if (!profile) {
      return { ready: true, durable: store.durable, profiles, profile: null, sessions: [], results: [] };
    }
    const [sessions, results] = await Promise.all([listSessions(profile.id), listResults(profile.id)]);
    return { ready: true, durable: store.durable, profiles, profile, sessions, results };
  }, []);

  const reload = useCallback(async () => {
    const store = await getStore();
    const profiles = await listProfiles();
    const saved = await store.get<{ key: string; value: string | null }>('meta', ACTIVE_KEY);
    // Um unico perfil dispensa a tela de selecao: entra direto nele.
    const activeId = saved?.value ?? (profiles.length === 1 ? profiles[0]!.id : null);
    setState(await loadFor(profiles, activeId));
  }, [loadFor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Preferencias de leitura valem para o documento inteiro, entao vivem no
  // <html> e nao em cada componente.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.text = state.profile?.settings.textSize ?? 'normal';
    if (state.profile?.settings.highContrast) root.dataset.contrast = 'alto';
    else delete root.dataset.contrast;
  }, [state.profile]);

  const actions: Actions = useMemo(
    () => ({
      async addProfile(input) {
        const profile = newProfile(input);
        await saveProfile(profile);
        const store = await getStore();
        await store.put('meta', { key: ACTIVE_KEY, value: profile.id });
        const profiles = await listProfiles();
        setState(await loadFor(profiles, profile.id));
        return profile;
      },

      async updateProfile(patch) {
        setState((prev) => {
          if (!prev.profile) return prev;
          const profile = { ...prev.profile, ...patch, id: prev.profile.id };
          void saveProfile(profile);
          return {
            ...prev,
            profile,
            profiles: prev.profiles.map((p) => (p.id === profile.id ? profile : p)),
          };
        });
      },

      async updateSettings(patch) {
        setState((prev) => {
          if (!prev.profile) return prev;
          const profile = { ...prev.profile, settings: { ...prev.profile.settings, ...patch } };
          void saveProfile(profile);
          return {
            ...prev,
            profile,
            profiles: prev.profiles.map((p) => (p.id === profile.id ? profile : p)),
          };
        });
      },

      async removeProfile(profileId) {
        await deleteProfile(profileId);
        const store = await getStore();
        const profiles = await listProfiles();
        const saved = await store.get<{ key: string; value: string | null }>('meta', ACTIVE_KEY);
        const activeId = saved?.value === profileId ? null : saved?.value ?? null;
        if (saved?.value === profileId) await store.put('meta', { key: ACTIVE_KEY, value: null });
        setState(await loadFor(profiles, activeId));
      },

      async selectProfile(profileId) {
        const store = await getStore();
        await store.put('meta', { key: ACTIVE_KEY, value: profileId });
        const profiles = await listProfiles();
        setState(await loadFor(profiles, profileId));
      },

      async openTodaySession() {
        const profile = state.profile;
        if (!profile) throw new Error('Nenhum perfil selecionado.');

        // Uma sessao por dia. Se a de hoje ja existe — concluida ou deixada
        // pela metade — e ela que volta; abrir outra criaria dois pontos no
        // mesmo dia e o efeito de pratica entraria como melhora.
        const today = dayKey();
        const existing = sessionForDay(state.sessions, today);
        if (existing) return existing;

        const history = state.results.map((r) => ({
          game: r.game,
          date: state.sessions.find((s) => s.id === r.sessionId)?.date ?? r.startedAt.slice(0, 10),
        }));
        const session: Session = {
          id: uid(),
          profileId: profile.id,
          date: today,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          checkIn: null,
          planned: planSession(profile.settings.gamesPerSession, history),
          completed: false,
        };
        await saveSession(session);
        setState((prev) => ({ ...prev, sessions: [...prev.sessions, session] }));
        return session;
      },

      async setCheckIn(sessionId, checkIn) {
        setState((prev) => {
          const sessions = prev.sessions.map((s) => (s.id === sessionId ? { ...s, checkIn } : s));
          const updated = sessions.find((s) => s.id === sessionId);
          if (updated) void saveSession(updated);
          return { ...prev, sessions };
        });
      },

      async recordResult({ sessionId, game, block, metrics, durationMs }) {
        const profile = state.profile;
        if (!profile) throw new Error('Nenhum perfil selecionado.');

        const scored = scoreGame(game, metrics);
        const result: TestResult = {
          id: uid(),
          profileId: profile.id,
          sessionId,
          game,
          block,
          startedAt: new Date(Date.now() - durationMs).toISOString(),
          durationMs,
          metrics,
          score: scored.score,
          valid: scored.valid,
          invalidReason: scored.invalidReason,
        };
        await saveResult(result);
        setState((prev) => ({ ...prev, results: [...prev.results, result] }));
        return result;
      },

      async finishSession(sessionId) {
        setState((prev) => {
          const sessions = prev.sessions.map((s) =>
            s.id === sessionId ? { ...s, completed: true, finishedAt: new Date().toISOString() } : s,
          );
          const updated = sessions.find((s) => s.id === sessionId);
          if (updated) void saveSession(updated);
          return { ...prev, sessions };
        });
      },

      async setDifficulty(game, level) {
        setState((prev) => {
          if (!prev.profile) return prev;
          const profile = {
            ...prev.profile,
            difficulty: { ...prev.profile.difficulty, [game]: level },
          };
          void saveProfile(profile);
          return {
            ...prev,
            profile,
            profiles: prev.profiles.map((p) => (p.id === profile.id ? profile : p)),
          };
        });
      },

      reload,
    }),
    [loadFor, reload, state.profile, state.results, state.sessions],
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): State & Actions {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore precisa estar dentro de <StoreProvider>.');
  return value;
}
