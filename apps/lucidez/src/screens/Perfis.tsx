import { useState } from 'react';
import { Button, Card, Page } from '@/components/ui';
import { useStore } from '@/state/store';

export function Perfis({ navigate }: { navigate: (to: string) => void }) {
  const store = useStore();
  const [creating, setCreating] = useState(store.profiles.length === 0);
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [condition, setCondition] = useState('');
  const [error, setError] = useState('');

  async function create() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Escreva um nome com pelo menos duas letras.');
      return;
    }
    const year = birthYear.trim() ? Number(birthYear.trim()) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())) {
      setError('Ano de nascimento inválido.');
      return;
    }
    await store.addProfile({ name: trimmed, birthYear: year, condition: condition.trim() });
    setName('');
    setBirthYear('');
    setCondition('');
    setError('');
    setCreating(false);
    navigate('/');
  }

  return (
    <Page title="Perfis" subtitle="Cada pessoa tem histórico próprio, guardado só neste aparelho.">
      <div className="grid gap-3">
        {store.profiles.map((profile) => {
          const active = profile.id === store.profile?.id;
          return (
            <button
              key={profile.id}
              onClick={() => void store.selectProfile(profile.id).then(() => navigate('/'))}
              className={`card flex items-center justify-between gap-3 text-left ${
                active ? 'border-brand bg-brand-soft' : ''
              }`}
            >
              <div>
                <div className="text-[1.1em] font-bold">{profile.name}</div>
                <div className="text-[0.85em] text-muted">
                  {profile.birthYear ? `${new Date().getFullYear() - profile.birthYear} anos` : 'idade não informada'}
                  {profile.condition ? ` · ${profile.condition}` : ''}
                </div>
              </div>
              {active && <span className="text-[0.85em] font-bold text-brand">em uso</span>}
            </button>
          );
        })}
      </div>

      {creating ? (
        <Card className="mt-4">
          <h2 className="text-[1.1em] font-bold">Novo perfil</h2>
          <label className="mt-3 block text-[0.9em] font-semibold">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como quer ser chamado"
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3"
            />
          </label>
          <label className="mt-3 block text-[0.9em] font-semibold">
            Ano de nascimento <span className="font-normal text-muted">(opcional)</span>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              inputMode="numeric"
              placeholder="1948"
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3"
            />
          </label>
          <label className="mt-3 block text-[0.9em] font-semibold">
            Condição acompanhada <span className="font-normal text-muted">(opcional)</span>
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Ex.: Parkinson, em investigação, nenhuma"
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3"
            />
          </label>
          {error && <p className="mt-2 text-[0.9em] font-semibold text-bad">{error}</p>}
          <div className="mt-4 grid gap-2">
            <Button full onClick={() => void create()}>
              Criar perfil
            </Button>
            {store.profiles.length > 0 && (
              <Button variant="ghost" full onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Button variant="secondary" className="mt-4" full onClick={() => setCreating(true)}>
          Adicionar perfil
        </Button>
      )}
    </Page>
  );
}
