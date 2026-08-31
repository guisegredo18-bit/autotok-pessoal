import { useMemo, useState } from 'react';
import { DOMAINS, DOMAIN_IDS, GAMES } from '@/core/domains';
import {
  analyzeDomain,
  analyzeOverall,
  analyzeSeries,
  buildDayPoints,
  buildInsights,
  compositeSeries,
  seriesFor,
  statusLabel,
  type TrendStatus,
  type TrendVerdict,
} from '@/core/trend';
import { num, plural } from '@/core/format';
import type { DomainId } from '@/core/types';
import { LineChart, Sparkline } from '@/components/chart';
import { Badge, Button, Card, ClinicalNote, Empty, Page, type Tone } from '@/components/ui';
import { useStore } from '@/state/store';

const TONE: Record<TrendStatus, Tone> = {
  sem_dados: 'neutro',
  formando_base: 'neutro',
  estavel: 'bom',
  melhora: 'bom',
  melhora_forte: 'bom',
  queda: 'atencao',
  queda_forte: 'ruim',
};

/** Icone junto do rotulo: a cor sozinha nunca carrega o estado. */
const ICON: Record<TrendStatus, string> = {
  sem_dados: '·',
  formando_base: '◔',
  estavel: '✓',
  melhora: '↑',
  melhora_forte: '↑',
  queda: '↓',
  queda_forte: '↓',
};

const HERO_INK: Record<TrendStatus, string> = {
  sem_dados: 'text-muted',
  formando_base: 'text-muted',
  estavel: 'text-ok',
  melhora: 'text-ok',
  melhora_forte: 'text-ok',
  queda: 'text-warn',
  queda_forte: 'text-bad',
};

function heroTitle(status: TrendStatus): string {
  switch (status) {
    case 'sem_dados':
      return 'Sem dados ainda';
    case 'formando_base':
      return 'Formando a linha de base';
    case 'estavel':
      return 'Estável';
    case 'melhora':
    case 'melhora_forte':
      return 'Acima da linha de base';
    case 'queda':
    case 'queda_forte':
      return 'Abaixo da linha de base';
  }
}

/** Frase que quantifica o veredito em desvios-padrao — a unidade que de fato
 *  responde "isso e muito?", ao contrario de uma nota de 0 a 100. */
function heroDetail(verdict: TrendVerdict, sessions: number): string {
  if (verdict.status === 'sem_dados') return 'Nenhuma sessão registrada.';
  if (verdict.status === 'formando_base') {
    return `${plural(sessions, 'sessão feita', 'sessões feitas')} · faltam ${plural(
      verdict.sessionsToBaseline,
      'sessão',
      'sessões',
    )} para a primeira leitura.`;
  }
  const z = verdict.z ?? 0;
  const direction = z < 0 ? 'abaixo' : 'acima';
  const distance = Math.abs(z) < 1 ? 'dentro da variação normal' : `${num(Math.abs(z))} desvios-padrão ${direction}`;
  return `${plural(sessions, 'sessão', 'sessões')} · as recentes ${
    Math.abs(z) < 1 ? `ficam ${distance}` : `ficam ${distance} do início`
  }.`;
}

export function Relatorio({ navigate }: { navigate: (to: string) => void }) {
  const store = useStore();
  const [table, setTable] = useState(false);

  const points = useMemo(() => buildDayPoints(store.sessions, store.results), [store.sessions, store.results]);
  const overall = useMemo(() => analyzeOverall(points), [points]);
  const composite = useMemo(() => compositeSeries(points), [points]);
  const byDomain = useMemo(() => {
    const out: Partial<Record<DomainId, TrendVerdict>> = {};
    for (const domain of DOMAIN_IDS) out[domain] = analyzeDomain(points, domain);
    return out;
  }, [points]);
  const insights = useMemo(() => buildInsights(points, overall, byDomain), [points, overall, byDomain]);

  if (!store.profile) {
    return (
      <Page title="Relatório">
        <Empty icon="👤" title="Escolha um perfil" detail="O relatório é de uma pessoa por vez." action={<Button onClick={() => navigate('/perfis')}>Ir para perfis</Button>} />
      </Page>
    );
  }

  if (points.length === 0) {
    return (
      <Page title="Relatório" subtitle={store.profile.name}>
        <Empty
          icon="📈"
          title="Ainda não há sessões"
          detail="Faça a primeira sessão para começar a linha do tempo. São necessárias 8 sessões antes do app arriscar qualquer conclusão."
          action={<Button onClick={() => navigate('/sessao')}>Começar agora</Button>}
        />
        <ClinicalNote className="mt-6" />
      </Page>
    );
  }

  return (
    <Page title="Relatório" subtitle={`${store.profile.name} · ${plural(points.length, 'sessão', 'sessões')}`}>
      <Card>
        {/* O titulo e o veredito em palavras, e nao uma nota.
            A escala composta e uma conveniencia interna (50 = base, 10 = um
            desvio); mostrada como numero grande, ela vira uma "nota" que
            ninguem sabe interpretar — e que satura no fundo da escala
            justamente nos casos mais graves, escondendo o tamanho da queda. */}
        <div className="text-[0.8em] font-semibold uppercase tracking-wide text-muted">
          Índice geral
        </div>
        <div className={`mt-1 text-[1.7em] font-bold leading-tight ${HERO_INK[overall.status]}`}>
          <span aria-hidden>{ICON[overall.status]}</span> {heroTitle(overall.status)}
        </div>
        <p className="mt-1 text-[0.95em] leading-snug text-muted">{heroDetail(overall, points.length)}</p>

        {composite.length > 0 ? (
          <div className="mt-4">
            <LineChart
              points={composite}
              baseline={analyzeSeries(composite).baseline}
              label="Índice geral por sessão"
            />
            <p className="mt-1 text-center text-[0.8em] text-muted">
              A faixa cinza é a variação normal desta pessoa. 50 = igual à linha de base; cada 10
              pontos = um desvio padrão.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[0.95em] text-muted">
            O índice geral aparece depois de 8 sessões com o mesmo jogo — antes disso não há base
            para comparar.
          </p>
        )}
      </Card>

      <h2 className="mb-2 mt-6 text-[1.1em] font-bold">O que os dados dizem</h2>
      <div className="grid gap-3">
        {insights.map((insight) => (
          <Card
            key={insight.title}
            className={
              insight.level === 'atencao' ? 'border-warn/40 bg-warn-soft' : insight.level === 'bom' ? 'border-ok/30' : ''
            }
          >
            <h3 className="font-bold">{insight.title}</h3>
            <p className="mt-1 text-[0.95em] leading-snug text-muted">{insight.detail}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-[1.1em] font-bold">Por domínio</h2>
      <div className="grid gap-3">
        {DOMAIN_IDS.map((domain) => {
          const verdict = byDomain[domain];
          const series = seriesFor(points, domain);
          if (!verdict || series.length === 0) return null;
          const meta = DOMAINS[domain];
          return (
            <Card key={domain}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold">{meta.name}</h3>
                  <p className="text-[0.85em] leading-snug text-muted">{meta.plain}</p>
                </div>
                <Badge tone={TONE[verdict.status]}>
                  <span aria-hidden>{ICON[verdict.status]}</span> {statusLabel(verdict.status)}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <Sparkline points={series} baseline={verdict.baseline} />
                </div>
                <div className="w-20 text-right">
                  <div className="text-[1.4em] font-bold leading-none tabular-nums">
                    {series[series.length - 1]!.score.toFixed(0)}
                  </div>
                  <div className="text-[0.75em] text-muted">{series.length} sessões</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <Button variant="secondary" full onClick={() => setTable((v) => !v)}>
          {table ? 'Esconder a tabela' : 'Ver os números em tabela'}
        </Button>
      </div>

      {table && (
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[0.85em]">
            <caption className="mb-2 text-left text-[0.95em] font-bold">
              Uma linha por sessão. Vazio = o jogo daquele domínio não entrou naquele dia.
            </caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-1.5 pr-2 font-semibold">Data</th>
                {DOMAIN_IDS.map((domain) => (
                  <th key={domain} className="py-1.5 pr-2 text-right font-semibold">
                    {DOMAINS[domain].name.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.date + point.time} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 tabular-nums">{point.date.split('-').reverse().slice(0, 2).join('/')}</td>
                  {DOMAIN_IDS.map((domain) => (
                    <td key={domain} className="py-1.5 pr-2 text-right tabular-nums">
                      {typeof point.scores[domain] === 'number' ? point.scores[domain]!.toFixed(0) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mt-6">
        <h3 className="font-bold">Como ler isto</h3>
        <ul className="mt-2 grid gap-2 text-[0.92em] leading-snug text-muted">
          <li>
            A comparação é sempre com a própria pessoa. Não há tabela por idade nem nota "normal" —
            o que conta é a distância entre as sessões recentes e as primeiras.
          </li>
          <li>
            Só a sessão diária entra aqui. Treinos livres e rodadas extras ficam de fora para o
            efeito de prática não virar "melhora".
          </li>
          <li>
            Jogos usados: {Object.values(GAMES).map((g) => g.name).join(', ')}.
          </li>
        </ul>
      </Card>

      <ClinicalNote className="mt-6" />
    </Page>
  );
}
