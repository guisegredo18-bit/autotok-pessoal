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
   * Piloto automatico da aprovacao: ideia com nota alta vira video sozinha,
   * sem voce tocar em "Gravar video".
   */
  autoApprove: boolean;
  /**
   * Piloto automatico da publicacao: video renderizado vai para o TikTok
   * sozinho, sem passar pela sua aprovacao na Fila.
   *
   * Este e o unico passo irreversivel do fluxo — por isso nasce desligado e
   * so liga por escolha explicita na tela.
   */
  autoPublish: boolean;
  /**
   * Nota minima para o piloto agir por conta propria.
   *
   * E separada de `minScore` de proposito: aquela decide o que merece a sua
   * atencao, esta decide o que merece ir ao ar sem nenhuma atencao. A segunda
   * pergunta e mais exigente que a primeira, entao o padrao e mais alto.
   */
  autoMinScore: number;
  /**
   * Minutos entre uma publicacao automatica e a proxima.
   *
   * Sem isso, tres videos prontos ao mesmo tempo virariam tres posts no mesmo
   * minuto — o que nenhum perfil humano faz, e o TikTok trata como sinal de
   * conta automatizada. Zero desliga o espacamento.
   */
  autoGapMinutes: number;
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
  // O piloto nasce desligado: quem instalou pediu um painel de aprovacao, e
  // ligar sozinho o que publica sozinho seria decidir no lugar da pessoa.
  autoApprove: false,
  autoPublish: false,
  autoMinScore: 75,
  autoGapMinutes: 90,
  renderEngineChosen: false,
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
