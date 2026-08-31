import { DOMAIN_IDS, domainOf } from './domains.ts';
import { num, plural } from './format.ts';
import { clamp, linearRegression, mean, median, sd } from './stats.ts';
import type { DayPoint, DomainId, Session, TestResult } from './types.ts';

/**
 * Analise longitudinal.
 *
 * A pergunta do app e "a cognicao desta pessoa esta caindo ou melhorando?", e a
 * unica referencia honesta para responder isso e a propria pessoa: o que conta
 * e o desvio em relacao a linha de base dela, medido na variabilidade dela.
 * Duas decisoes seguram o impulso de gritar "piora" a toa:
 *
 *  1. So existe veredito depois de MIN_BASELINE sessoes de base e MIN_RECENT
 *     sessoes recentes. Antes disso o estado e "formando base".
 *  2. O desvio padrao usado no denominador tem piso (SD_FLOOR). Quem foi muito
 *     regular na base teria um desvio minusculo, e qualquer dia ruim viraria
 *     um z gigante.
 *  3. O centro de cada periodo e a MEDIANA, nao a media. Um unico dia perdido
 *     — telefone tocando, alguem entrando na sala — desloca a media da janela
 *     em varios desvios e produziria um alarme falso; a mediana ignora esse
 *     dia e so se move quando a maioria das sessoes se move junto.
 */

export const MIN_BASELINE = 5;
export const RECENT_WINDOW = 5;
export const MIN_RECENT = 3;
/** Em pontos da escala 0-100. Abaixo disso a "variabilidade" e so arredondamento. */
export const SD_FLOOR = 4;

export type TrendStatus =
  | 'sem_dados'
  | 'formando_base'
  | 'estavel'
  | 'melhora'
  | 'melhora_forte'
  | 'queda'
  | 'queda_forte';

export interface Baseline {
  /** Mediana das sessoes de base. */
  center: number;
  sd: number;
  n: number;
  firstDate: string;
  lastDate: string;
}

export interface TrendVerdict {
  status: TrendStatus;
  baseline: Baseline | null;
  /** Mediana das sessoes recentes. */
  recent: number | null;
  /** Desvios-padrao de distancia entre o periodo recente e a linha de base. */
  z: number | null;
  /** Inclinacao em pontos por semana, so quando se destaca do ruido. */
  slopePerWeek: number | null;
  totalSessions: number;
  /** Quantas sessoes ainda faltam para sair de 'formando_base'. */
  sessionsToBaseline: number;
}

export interface SeriesPoint {
  date: string;
  time: number;
  score: number;
}

/**
 * Reduz sessoes e resultados a um ponto por sessao.
 *
 * Entram apenas resultados do bloco calibrado e marcados como validos: o bloco
 * desafio muda de dificuldade ao longo do tempo e contaminaria a comparacao.
 */
export function buildDayPoints(sessions: Session[], results: TestResult[]): DayPoint[] {
  const bySession = new Map<string, TestResult[]>();
  for (const r of results) {
    if (r.block !== 'calibrado' || !r.valid) continue;
    const list = bySession.get(r.sessionId);
    if (list) list.push(r);
    else bySession.set(r.sessionId, [r]);
  }

  const points: DayPoint[] = [];
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  for (const session of ordered) {
    const rows = bySession.get(session.id);
    if (!rows || rows.length === 0) continue;

    const buckets = new Map<DomainId, number[]>();
    for (const r of rows) {
      const domain = domainOf(r.game);
      const list = buckets.get(domain);
      if (list) list.push(r.score);
      else buckets.set(domain, [r.score]);
    }

    const scores: Partial<Record<DomainId, number>> = {};
    for (const [domain, values] of buckets) scores[domain] = mean(values);

    const present = Object.values(scores) as number[];
    points.push({
      date: session.date,
      time: new Date(session.startedAt).getTime(),
      scores,
      overall: present.length > 0 ? mean(present) : null,
      checkIn: session.checkIn,
    });
  }

  return points;
}

export function seriesFor(points: DayPoint[], domain: DomainId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const p of points) {
    const score = p.scores[domain];
    if (typeof score === 'number') out.push({ date: p.date, time: p.time, score });
  }
  return out;
}

function statusFromZ(z: number): TrendStatus {
  if (z <= -2) return 'queda_forte';
  if (z <= -1) return 'queda';
  if (z >= 2) return 'melhora_forte';
  if (z >= 1) return 'melhora';
  return 'estavel';
}

/**
 * Inclinacao so e reportada quando o coeficiente supera duas vezes o proprio
 * erro padrao — o equivalente pratico de "isso nao e o serrilhado normal".
 */
function weeklySlope(values: SeriesPoint[]): number | null {
  if (values.length < 5) return null;
  const t0 = values[0]!.time;
  const days = values.map((v) => (v.time - t0) / 86_400_000);
  const scores = values.map((v) => v.score);
  const fit = linearRegression(days, scores);
  if (!fit || !Number.isFinite(fit.slopeStdErr)) return null;
  if (Math.abs(fit.slope) < 2 * fit.slopeStdErr) return null;
  return fit.slope * 7;
}

/** Veredito para uma serie qualquer ja ordenada no tempo. */
export function analyzeSeries(series: SeriesPoint[]): TrendVerdict {
  const total = series.length;
  const empty: TrendVerdict = {
    status: 'sem_dados',
    baseline: null,
    recent: null,
    z: null,
    slopePerWeek: null,
    totalSessions: total,
    sessionsToBaseline: Math.max(0, MIN_BASELINE + MIN_RECENT - total),
  };
  if (total === 0) return empty;

  if (total < MIN_BASELINE + MIN_RECENT) {
    return { ...empty, status: 'formando_base' };
  }

  const baseSlice = series.slice(0, MIN_BASELINE);
  const baseScores = baseSlice.map((p) => p.score);
  const baseline: Baseline = {
    center: median(baseScores),
    sd: Math.max(sd(baseScores), SD_FLOOR),
    n: baseSlice.length,
    firstDate: baseSlice[0]!.date,
    lastDate: baseSlice[baseSlice.length - 1]!.date,
  };

  const recentSlice = series.slice(Math.max(MIN_BASELINE, total - RECENT_WINDOW));
  const recent = median(recentSlice.map((p) => p.score));
  const z = (recent - baseline.center) / baseline.sd;

  return {
    status: statusFromZ(z),
    baseline,
    recent,
    z,
    slopePerWeek: weeklySlope(series),
    totalSessions: total,
    sessionsToBaseline: 0,
  };
}

export function analyzeDomain(points: DayPoint[], domain: DomainId): TrendVerdict {
  return analyzeSeries(seriesFor(points, domain));
}

/**
 * Veredito geral.
 *
 * Nao e a media das notas brutas: se num dia a pessoa jogou so os dois jogos em
 * que vai melhor, a media do dia sobe sem que nada tenha mudado. Convertemos
 * cada dominio para desvios da propria base e tiramos a media desses desvios,
 * o que deixa o indice imune a variacao de quais jogos entraram no dia.
 */
/**
 * Serie do indice geral, ja em pontos de 0 a 100.
 *
 * Cada dia vira a media dos z dos dominios medidos naquele dia, deslocada para
 * uma escala legivel: 50 = exatamente a linha de base, e cada 10 pontos = um
 * desvio padrao. Devolve vazio enquanto nenhum dominio tiver base suficiente.
 */
export function compositeSeries(points: DayPoint[]): SeriesPoint[] {
  const baselines = new Map<DomainId, Baseline>();
  for (const domain of DOMAIN_IDS) {
    const series = seriesFor(points, domain);
    if (series.length < MIN_BASELINE + MIN_RECENT) continue;
    const baseScores = series.slice(0, MIN_BASELINE).map((p) => p.score);
    baselines.set(domain, {
      center: median(baseScores),
      sd: Math.max(sd(baseScores), SD_FLOOR),
      n: MIN_BASELINE,
      firstDate: series[0]!.date,
      lastDate: series[MIN_BASELINE - 1]!.date,
    });
  }
  if (baselines.size === 0) return [];

  const composite: SeriesPoint[] = [];
  for (const p of points) {
    const zs: number[] = [];
    for (const [domain, base] of baselines) {
      const score = p.scores[domain];
      if (typeof score === 'number') zs.push((score - base.center) / base.sd);
    }
    if (zs.length > 0) {
      composite.push({ date: p.date, time: p.time, score: clamp(50 + mean(zs) * 10, 0, 100) });
    }
  }
  return composite;
}

export function analyzeOverall(points: DayPoint[]): TrendVerdict {
  const composite = compositeSeries(points);

  if (composite.length === 0) {
    const usable = points.filter((p) => p.overall !== null);
    return {
      status: usable.length === 0 ? 'sem_dados' : 'formando_base',
      baseline: null,
      recent: null,
      z: null,
      slopePerWeek: null,
      totalSessions: usable.length,
      sessionsToBaseline: Math.max(0, MIN_BASELINE + MIN_RECENT - usable.length),
    };
  }

  return analyzeSeries(composite);
}

export interface Insight {
  level: 'bom' | 'neutro' | 'atencao';
  title: string;
  detail: string;
}

const STATUS_WORD: Record<TrendStatus, string> = {
  sem_dados: 'sem dados',
  formando_base: 'formando linha de base',
  estavel: 'estável',
  melhora: 'em melhora',
  melhora_forte: 'em melhora consistente',
  queda: 'em queda',
  queda_forte: 'em queda consistente',
};

export function statusLabel(status: TrendStatus): string {
  return STATUS_WORD[status];
}

/**
 * Traduz os vereditos em frases para a tela do cuidador — incluindo os avisos
 * que impedem uma leitura apressada: sono ruim, poucos dados, dia unico ruim.
 */
export function buildInsights(
  points: DayPoint[],
  overall: TrendVerdict,
  byDomain: Partial<Record<DomainId, TrendVerdict>>,
): Insight[] {
  const insights: Insight[] = [];

  if (overall.status === 'sem_dados') {
    insights.push({
      level: 'neutro',
      title: 'Ainda não há sessões concluídas',
      detail: 'Faça a primeira sessão para começar a linha do tempo.',
    });
    return insights;
  }

  if (overall.status === 'formando_base') {
    insights.push({
      level: 'neutro',
      title: `Faltam ${plural(overall.sessionsToBaseline, 'sessão', 'sessões')} para a primeira leitura`,
      detail:
        'As primeiras sessões servem para aprender o jogo e formar a linha de base. Só depois disso comparar faz sentido.',
    });
  } else {
    const z = overall.z ?? 0;
    const delta = num(Math.abs(z));
    if (overall.status === 'estavel') {
      insights.push({
        level: 'bom',
        title: 'Desempenho geral estável',
        detail: `As últimas sessões ficam dentro da variação normal da linha de base (${delta} desvios-padrão de distância).`,
      });
    } else if (overall.status.startsWith('melhora')) {
      insights.push({
        level: 'bom',
        title: 'Desempenho geral acima da linha de base',
        detail: `As últimas sessões estão ${delta} desvios-padrão acima do início. Parte disso costuma ser prática — o ganho tende a estabilizar.`,
      });
    } else {
      insights.push({
        level: 'atencao',
        title: 'Desempenho geral abaixo da linha de base',
        detail: `As últimas sessões estão ${delta} desvios-padrão abaixo do início. Isso é um dado para levar ao médico, não um diagnóstico.`,
      });
    }
  }

  for (const domain of DOMAIN_IDS) {
    const verdict = byDomain[domain];
    if (!verdict || verdict.status === 'sem_dados' || verdict.status === 'formando_base') continue;
    if (verdict.status === 'estavel') continue;

    const falling = verdict.status.startsWith('queda');
    insights.push({
      level: falling ? 'atencao' : 'bom',
      title: `${domainName(domain)} ${STATUS_WORD[verdict.status]}`,
      detail:
        verdict.slopePerWeek !== null
          ? `Tendência de ${verdict.slopePerWeek > 0 ? '+' : ''}${num(verdict.slopePerWeek)} pontos por semana ao longo de ${plural(verdict.totalSessions, 'sessão', 'sessões')}.`
          : `Mediana recente de ${Math.round(verdict.recent ?? 0)} contra ${Math.round(verdict.baseline?.center ?? 0)} na linha de base.`,
    });
  }

  // Confundidores: uma queda com sono ruim no periodo pede repetir antes de
  // concluir qualquer coisa.
  const recent = points.slice(-RECENT_WINDOW);
  const sleeps = recent.map((p) => p.checkIn?.sleep).filter((s): s is number => typeof s === 'number');
  if (sleeps.length >= 2 && mean(sleeps) <= 2.5 && overall.status.startsWith('queda')) {
    insights.push({
      level: 'neutro',
      title: 'Sono ruim no período',
      detail:
        'As sessões recentes vieram depois de noites mal dormidas, que sozinhas já derrubam atenção e velocidade. Vale repetir alguns dias bem dormidos antes de tirar conclusões.',
    });
  }

  const skippedMeds = recent.filter((p) => p.checkIn?.meds === false).length;
  if (skippedMeds >= 2) {
    insights.push({
      level: 'neutro',
      title: 'Medicação fora do padrão',
      detail: `Em ${skippedMeds} das últimas sessões a medicação não foi tomada como de costume. Anote isso ao mostrar o relatório.`,
    });
  }

  return insights;
}

function domainName(domain: DomainId): string {
  const names: Record<DomainId, string> = {
    velocidade: 'Velocidade',
    inibicao: 'Controle de impulso',
    memoria_trabalho: 'Memória de trabalho',
    memoria_visual: 'Memória visual',
    atencao: 'Atenção seletiva',
    flexibilidade: 'Flexibilidade mental',
  };
  return names[domain];
}
