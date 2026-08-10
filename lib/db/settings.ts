import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';
import { DEFAULT_RENDER_ENGINE, type RenderEngine } from '@/lib/render-engine';

/** Preferencias de conteudo, editaveis pelo painel no iPhone. */
export type AppSettings = {
  /** Nicho descrito em linguagem natural — entra no prompt da IA. */
  niche: string;
  /** Template padrao das ideias geradas automaticamente. */
  template: 'produto' | 'viral';
  country: string;
  language: string;
  /** Quantas ideias gerar por varredura. */
  ideasPerScan: number;
  /** Quantos videos renderizar automaticamente por dia. */
  videosPerDay: number;
  /** Ideias com score abaixo disso sao descartadas na origem. */
  minScore: number;
  /** Duracao alvo do video em segundos. */
  targetDuration: number;
  /** Assinatura fixa colada no fim de toda legenda. */
  captionSignature: string;
  /** Palavras que nunca devem aparecer no roteiro. */
  blockedWords: string[];
  /**
   * Onde os videos sao renderizados.
   *
   * `github` manda o trabalho pesado para o Actions e mantem o painel leve —
   * o que so funciona enquanto a conta recebe runner. Quando nao recebe, o job
   * fica em "queued" para sempre e nao ha erro para mostrar.
   *
   * `aqui` roda no proprio processo do painel: serve quando ele esta num
   * container de verdade, com ffmpeg e sem limite de tempo de request.
   *
   * `manual` nao renderiza nada — deixa o video esperando para quem chegar
   * depois com uma maquina (o caderno do Colab, ou `npm run queue` num
   * terminal). E a unica opcao honesta quando nao existe nenhum servidor
   * capaz: melhor a fila parada de propria, e dizendo isso, do que um erro
   * inventado por tentar renderizar onde nao da.
   */
  renderEngine: RenderEngine;
  /**
   * Se `renderEngine` foi de fato escolhido por alguem.
   *
   * Ate a versao que embutiu o ffmpeg no painel, o formulario lia esse campo
   * com um ternario que so conhecia dois valores e gravava "github" para
   * qualquer outra escolha. Entao um "github" sem esta marca nao e uma
   * preferencia: e o resultado de um bug, e seguir obedecendo a ele deixaria a
   * pessoa presa no motor que nao entrega maquina.
   */
  renderEngineChosen: boolean;
  /**
   * De qual papel sao as suas comissoes na Hotmart.
   *
   * A mesma venda aparece com o quanto cada parte ganhou — produtor,
   * coprodutor, afiliado. Somar todas faria o painel exibir o faturamento do
   * produto como se fosse o seu ganho, entao e preciso dizer qual e o seu.
   */
  hotmartRole: 'AFFILIATE' | 'PRODUCER' | 'COPRODUCER';
  /** Termos usados para buscar produtos na Amazon (PA-API SearchItems). */
  affiliateKeywords: string[];
  /** Quantos dias para tras cada importacao da Hotmart varre. */
  importWindowDays: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  niche: 'curiosidades e dicas praticas do dia a dia',
  template: 'viral',
  country: 'BR',
  language: 'pt-BR',
  ideasPerScan: 5,
  videosPerDay: 3,
  minScore: 60,
  targetDuration: 30,
  captionSignature: '',
  blockedWords: [],
  renderEngine: DEFAULT_RENDER_ENGINE,
  renderEngineChosen: false,
  hotmartRole: 'AFFILIATE',
  affiliateKeywords: [],
  importWindowDays: 90,
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  return applyStored(row.value as Partial<AppSettings>);
}

/** Mesclagem com o padrao, exportada porque e onde mora a migracao. */
export function applyStored(stored: Partial<AppSettings>): AppSettings {
  // Mesclar com o padrao garante que campos novos apareçam sem migration.
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (!merged.renderEngineChosen) merged.renderEngine = DEFAULT_RENDER_ENGINE;
  return merged;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  // Salvar pelo formulario e o ato de escolher: a partir daqui o valor e
  // preferencia de gente, e nenhuma migracao futura deve passar por cima.
  if (patch.renderEngine !== undefined) next.renderEngineChosen = true;
  await db
    .insert(settings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}
