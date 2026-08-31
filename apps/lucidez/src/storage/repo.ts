import { uid } from '@/core/id';
import { GAMES } from '@/core/domains';
import type { GameId, Profile, ProfileSettings, Session, TestResult } from '@/core/types';
import { getStore } from './db';

export const DEFAULT_SETTINGS: ProfileSettings = {
  textSize: 'normal',
  highContrast: false,
  sound: true,
  gamesPerSession: 3,
  challengeBlock: true,
};

export function newProfile(input: {
  name: string;
  birthYear: number | null;
  condition: string;
  settings?: Partial<ProfileSettings>;
}): Profile {
  return {
    id: uid(),
    name: input.name.trim(),
    birthYear: input.birthYear,
    condition: input.condition.trim(),
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    difficulty: {},
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const store = await getStore();
  const profiles = await store.getAll<Profile>('profiles');
  return profiles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveProfile(profile: Profile): Promise<void> {
  const store = await getStore();
  await store.put('profiles', profile);
}

/** Apaga o perfil e tudo que pertence a ele. Um perfil sem os proprios dados
 *  seria pior que nada: o historico orfao entraria na conta de outra pessoa. */
export async function deleteProfile(profileId: string): Promise<void> {
  const store = await getStore();
  const [sessions, results] = await Promise.all([
    store.getAllBy<Session>('sessions', 'profileId', profileId),
    store.getAllBy<TestResult>('results', 'profileId', profileId),
  ]);
  for (const r of results) await store.remove('results', r.id);
  for (const s of sessions) await store.remove('sessions', s.id);
  await store.remove('profiles', profileId);
}

export async function listSessions(profileId: string): Promise<Session[]> {
  const store = await getStore();
  const sessions = await store.getAllBy<Session>('sessions', 'profileId', profileId);
  return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export async function saveSession(session: Session): Promise<void> {
  const store = await getStore();
  await store.put('sessions', session);
}

export async function listResults(profileId: string): Promise<TestResult[]> {
  const store = await getStore();
  const results = await store.getAllBy<TestResult>('results', 'profileId', profileId);
  return results.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export async function saveResult(result: TestResult): Promise<void> {
  const store = await getStore();
  await store.put('results', result);
}

export async function isDurable(): Promise<boolean> {
  return (await getStore()).durable;
}

/* ------------------------------------------------------------------ backup */

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'lucidez';
  version: number;
  exportedAt: string;
  profiles: Profile[];
  sessions: Session[];
  results: TestResult[];
}

export async function exportBackup(): Promise<Backup> {
  const store = await getStore();
  const [profiles, sessions, results] = await Promise.all([
    store.getAll<Profile>('profiles'),
    store.getAll<Session>('sessions'),
    store.getAll<TestResult>('results'),
  ]);
  return {
    app: 'lucidez',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    sessions,
    results,
  };
}

export interface ImportReport {
  profiles: number;
  sessions: number;
  results: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validProfile(value: unknown): value is Profile {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function validSession(value: unknown): value is Session {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.profileId === 'string' &&
    typeof value.date === 'string'
  );
}

function validResult(value: unknown): value is TestResult {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.profileId === 'string' &&
    typeof value.game === 'string' &&
    value.game in GAMES &&
    typeof value.score === 'number'
  );
}

/**
 * Importa um backup.
 *
 * O arquivo vem de fora e pode estar corrompido, editado a mao ou ser de outro
 * app inteiro. Validamos linha a linha e descartamos o que nao encaixa, em vez
 * de gravar lixo que so apareceria muito depois como um grafico sem sentido.
 * Registros com o mesmo id sobrescrevem os locais.
 */
export async function importBackup(raw: unknown): Promise<ImportReport> {
  if (!isObject(raw) || raw.app !== 'lucidez') {
    throw new Error('Este arquivo não é um backup do Lucidez.');
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new Error('Este backup vem de uma versão mais nova do app.');
  }

  const profiles = Array.isArray(raw.profiles) ? raw.profiles.filter(validProfile) : [];
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(validSession) : [];
  const results = Array.isArray(raw.results) ? raw.results.filter(validResult) : [];

  if (profiles.length === 0) {
    throw new Error('O backup não contém nenhum perfil válido.');
  }

  // Sessoes e resultados so entram se o perfil dono vier junto ou ja existir.
  const store = await getStore();
  const known = new Set([...(await store.getAll<Profile>('profiles')).map((p) => p.id), ...profiles.map((p) => p.id)]);
  const keptSessions = sessions.filter((s) => known.has(s.profileId));
  const keptResults = results.filter((r) => known.has(r.profileId));

  await store.putMany('profiles', profiles);
  await store.putMany('sessions', keptSessions);
  await store.putMany('results', keptResults);

  return { profiles: profiles.length, sessions: keptSessions.length, results: keptResults.length };
}

/* --------------------------------------------------------------------- csv */

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Planilha de uma linha por teste, para levar ao neurologista ou abrir no
 * Excel. Usa ponto e virgula porque o Excel em portugues trata a virgula como
 * separador decimal e quebraria as colunas.
 */
export function resultsToCsv(profiles: Profile[], sessions: Session[], results: TestResult[]): string {
  const profileName = new Map(profiles.map((p) => [p.id, p.name]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const metricKeys = [...new Set(results.flatMap((r) => Object.keys(r.metrics)))].sort();
  const header = [
    'perfil',
    'data',
    'jogo',
    'dominio',
    'bloco',
    'nota',
    'valido',
    'motivo_invalidez',
    'duracao_s',
    'sono_1a5',
    'humor_1a5',
    'medicacao',
    ...metricKeys,
  ];

  const lines = [header.join(';')];
  for (const r of [...results].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const session = sessionById.get(r.sessionId);
    const meta = GAMES[r.game as GameId];
    lines.push(
      [
        csvCell(profileName.get(r.profileId) ?? r.profileId),
        csvCell(session?.date ?? r.startedAt.slice(0, 10)),
        csvCell(meta?.name ?? r.game),
        csvCell(meta?.domain ?? ''),
        csvCell(r.block),
        csvCell(r.score),
        csvCell(r.valid ? 'sim' : 'nao'),
        csvCell(r.invalidReason),
        csvCell(Math.round(r.durationMs / 1000)),
        csvCell(session?.checkIn?.sleep ?? null),
        csvCell(session?.checkIn?.mood ?? null),
        csvCell(session?.checkIn?.meds === null || session?.checkIn === null ? '' : session?.checkIn?.meds ? 'sim' : 'nao'),
        ...metricKeys.map((key) => csvCell(r.metrics[key] ?? null)),
      ].join(';'),
    );
  }
  return lines.join('\n');
}
