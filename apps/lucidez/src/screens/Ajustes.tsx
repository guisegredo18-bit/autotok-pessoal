import { useRef, useState } from 'react';
import { GAME_IDS } from '@/core/domains';
import { plural } from '@/core/format';
import type { ProfileSettings } from '@/core/types';
import { exportBackup, importBackup, resultsToCsv } from '@/storage/repo';
import { getStore } from '@/storage/db';
import type { Profile, Session, TestResult } from '@/core/types';
import { Button, Card, ClinicalNote, Page } from '@/components/ui';
import { useStore } from '@/state/store';

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revogar na hora cancelaria o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const TEXT_SIZES: { value: ProfileSettings['textSize']; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'grande', label: 'Grande' },
  { value: 'enorme', label: 'Enorme' },
];

export function Ajustes({ navigate }: { navigate: (to: string) => void }) {
  const store = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'erro'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const profile = store.profile;
  const today = new Date().toISOString().slice(0, 10);

  async function doExportJson() {
    const backup = await exportBackup();
    download(`lucidez-backup-${today}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  async function doExportCsv() {
    const dbStore = await getStore();
    const [profiles, sessions, results] = await Promise.all([
      dbStore.getAll<Profile>('profiles'),
      dbStore.getAll<Session>('sessions'),
      dbStore.getAll<TestResult>('results'),
    ]);
    // BOM na frente: sem ele o Excel abre acentos quebrados.
    download(`lucidez-resultados-${today}.csv`, `﻿${resultsToCsv(profiles, sessions, results)}`, 'text/csv;charset=utf-8');
  }

  async function doImport(file: File) {
    try {
      const report = await importBackup(JSON.parse(await file.text()));
      await store.reload();
      setMessage({
        tone: 'ok',
        text: `Importado: ${plural(report.profiles, 'perfil', 'perfis')}, ${plural(
          report.sessions,
          'sessão',
          'sessões',
        )} e ${plural(report.results, 'resultado', 'resultados')}.`,
      });
    } catch (error) {
      setMessage({ tone: 'erro', text: error instanceof Error ? error.message : 'Arquivo inválido.' });
    }
  }

  return (
    <Page title="Ajustes" subtitle={profile ? profile.name : 'Nenhum perfil selecionado'}>
      {profile && (
        <>
          <Card>
            <h2 className="font-bold">Leitura</h2>
            <p className="mt-1 mb-3 text-[0.88em] text-muted">
              Tamanho do texto e contraste valem para o app todo, inclusive dentro dos jogos.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TEXT_SIZES.map((size) => (
                <button
                  key={size.value}
                  onClick={() => void store.updateSettings({ textSize: size.value })}
                  aria-pressed={profile.settings.textSize === size.value}
                  className={`rounded-xl border-2 py-3 font-semibold ${
                    profile.settings.textSize === size.value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface'
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
            <Toggle
              className="mt-4"
              label="Alto contraste"
              hint="Preto no branco, bordas mais fortes."
              checked={profile.settings.highContrast}
              onChange={(highContrast) => void store.updateSettings({ highContrast })}
            />
            <Toggle
              className="mt-3"
              label="Sons de acerto e erro"
              hint="Um bip curto a cada resposta."
              checked={profile.settings.sound}
              onChange={(sound) => void store.updateSettings({ sound })}
            />
          </Card>

          <Card className="mt-4">
            <h2 className="font-bold">Sessão diária</h2>
            <p className="mt-1 mb-3 text-[0.88em] text-muted">
              Quantos jogos por dia. O app faz rodízio: em poucos dias todos os {GAME_IDS.length} são
              medidos. Sessão curta é a que a pessoa mantém.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  onClick={() => void store.updateSettings({ gamesPerSession: count })}
                  aria-pressed={profile.settings.gamesPerSession === count}
                  className={`rounded-xl border-2 py-3 font-bold ${
                    profile.settings.gamesPerSession === count ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <Toggle
              className="mt-4"
              label="Oferecer rodada extra difícil"
              hint="Depois de cada jogo, uma versão que fica mais difícil conforme a pessoa melhora. Não entra na análise."
              checked={profile.settings.challengeBlock}
              onChange={(challengeBlock) => void store.updateSettings({ challengeBlock })}
            />
          </Card>
        </>
      )}

      <Card className="mt-4">
        <h2 className="font-bold">Backup</h2>
        <p className="mt-1 mb-3 text-[0.88em] text-muted">
          Os dados ficam só neste aparelho. Se ele for perdido ou os dados do navegador forem
          limpos, o histórico vai junto — exporte de vez em quando.
        </p>
        <div className="grid gap-2">
          <Button variant="secondary" full onClick={() => void doExportJson()}>
            Exportar backup (.json)
          </Button>
          <Button variant="secondary" full onClick={() => void doExportCsv()}>
            Exportar planilha (.csv)
          </Button>
          <Button variant="secondary" full onClick={() => fileInput.current?.click()}>
            Importar backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void doImport(file);
              e.target.value = '';
            }}
          />
        </div>
        {message && (
          <p className={`mt-3 text-[0.92em] font-semibold ${message.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
            {message.text}
          </p>
        )}
      </Card>

      {profile && (
        <Card className="mt-4 border-bad/30">
          <h2 className="font-bold">Apagar este perfil</h2>
          <p className="mt-1 text-[0.88em] text-muted">
            Remove {profile.name} e todo o histórico dessa pessoa deste aparelho. Não dá para
            desfazer — exporte o backup antes.
          </p>
          {confirmDelete ? (
            <div className="mt-3 grid gap-2">
              <Button
                variant="danger"
                full
                onClick={() => void store.removeProfile(profile.id).then(() => navigate('/perfis'))}
              >
                Confirmar: apagar {profile.name}
              </Button>
              <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="mt-3" full onClick={() => setConfirmDelete(true)}>
              Apagar perfil
            </Button>
          )}
        </Card>
      )}

      <ClinicalNote className="mt-6" />
    </Page>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  className = '',
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange(value: boolean): void;
  className?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-3 py-3 text-left ${
        checked ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
      } ${className}`}
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-[0.82em] leading-snug text-muted">{hint}</span>
      </span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors ${
          checked ? 'justify-end bg-brand' : 'justify-start bg-line'
        }`}
        aria-hidden
      >
        <span className="block h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  );
}
