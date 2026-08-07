import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ideas, type Scene } from '@/lib/db/schema';
import { ActionButton } from '@/components/action-button';
import { GenerateForm } from '@/components/generate-form';
import { EmptyState, PageHeader, ScorePill, timeAgo } from '@/components/ui';
import { approveIdeaAction, rejectIdeaAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
// Escrever os roteiros acontece dentro da requisicao desta tela; o padrao de
// 10s da Vercel cortaria a geracao no meio.
// Aprovar uma ideia renderiza o video na hora quando nao ha GitHub Actions
// para fazer isso. Medido: cinco cenas em 720x1280 custam ~20s de
// codificacao, mais TTS, download das midias e upload. 300s e o teto da
// Vercel no plano gratuito e da folga de sobra.
export const maxDuration = 300;

export default async function IdeasPage() {
  const rows = await db
    .select()
    .from(ideas)
    .where(sql`${ideas.status} = 'pending'`)
    .orderBy(sql`${ideas.score} desc`)
    .limit(30);

  return (
    <>
      <PageHeader
        title="Ideias"
        subtitle="Roteiros prontos. Aprovar coloca o video na fila de renderizacao."
      />

      <GenerateForm />

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma ideia aguardando"
          description="Gere ideias a partir das tendencias ou escreva um assunto no campo acima."
          href="/tendencias"
          cta="Ver tendencias"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((idea) => {
            const scenes = (idea.scenes ?? []) as Scene[];
            const seconds = Math.round(scenes.reduce((sum, s) => sum + s.seconds, 0));

            return (
              <li key={idea.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[16px] font-semibold leading-snug">{idea.hook}</p>
                  <ScorePill score={idea.score} />
                </div>

                <p className="mt-1 text-[12px] text-muted">
                  {idea.template} · {scenes.length} cenas · ~{seconds}s · ha{' '}
                  {timeAgo(idea.createdAt)}
                </p>

                {/* <details> nativo: no celular, listar o roteiro inteiro de 10
                    ideias empurraria tudo para fora da tela. */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] font-medium text-cyan">
                    Ver roteiro completo
                  </summary>
                  <ol className="mt-3 flex flex-col gap-2.5">
                    {scenes.map((scene, i) => (
                      <li key={i} className="border-l-2 border-line pl-3">
                        <p className="text-[14px] leading-snug">{scene.text}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {scene.seconds}s · fundo: {scene.visual}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 rounded-xl bg-panel2 p-3">
                    <p className="text-[13px] leading-snug">{idea.caption}</p>
                    <p className="mt-1.5 text-[12px] text-cyan">
                      {idea.hashtags.map((h) => `#${h}`).join(' ')}
                    </p>
                  </div>
                  {idea.notes && (
                    <p className="mt-2 text-[12px] italic text-muted">
                      Avaliacao da IA: {idea.notes}
                    </p>
                  )}
                </details>

                <div className="mt-4 flex gap-2">
                  <ActionButton
                    action={approveIdeaAction.bind(null, idea.id)}
                    className="btn-primary"
                    wrapperClassName="flex flex-[2] flex-col gap-1.5"
                  >
                    Gravar video
                  </ActionButton>
                  <ActionButton
                    action={rejectIdeaAction.bind(null, idea.id)}
                    className="btn-danger"
                    wrapperClassName="flex flex-1 flex-col gap-1.5"
                    feedback="none"
                  >
                    Descartar
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
