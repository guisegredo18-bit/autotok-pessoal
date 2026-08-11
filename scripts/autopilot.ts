import { die } from './_bootstrap';

/**
 * Uma rodada do piloto automatico.
 *
 * Aprova as melhores ideias esperando, manda renderizar e publica o que ja
 * estiver pronto. E o unico comando que o canal precisa para andar sozinho —
 * e roda tanto no GitHub Actions (tres vezes por dia) quanto num terminal
 * qualquer, se voce preferir chamar na mao.
 *
 * Com o piloto desligado nas Configuracoes, ele nao faz nada e sai com codigo
 * zero: um cron que grita quando esta tudo certo ensina a ignorar cron.
 */
async function main() {
  const { autoApproveIdeas } = await import('../lib/pipeline/queue');
  const { autoPublishReady, describeAutopilot } = await import('../lib/pipeline/autopilot');
  const { getSettings } = await import('../lib/db/settings');
  const { hydrateEnv } = await import('../lib/secrets');

  await hydrateEnv();
  const settings = await getSettings();
  console.log(`Piloto automatico: ${describeAutopilot(settings)}`);

  if (!settings.autoApprove && !settings.autoPublish) {
    console.log('Nada a fazer — ligue em Configuracoes → Piloto automatico.');
    process.exit(0);
  }

  // Aqui o render acontece no proprio processo quando o motor e "aqui": este
  // script roda no runner do Actions ou num terminal, e nos dois casos ha
  // ffmpeg e tempo de sobra — que e justamente o que falta na Vercel.
  const aprovadas = await autoApproveIdeas({ log: (m) => console.log(`  ${m}`) });
  console.log(
    `\nAprovacao: ${aprovadas.videoIds.length} video(s) de ${aprovadas.pending} ideia(s) esperando` +
      (aprovadas.reason ? ` — ${aprovadas.reason}` : ''),
  );

  const publicados = await autoPublishReady((m) => console.log(`  ${m}`));
  console.log(
    `Publicacao: ${publicados.published.length} no ar, ${publicados.failed.length} falha(s)` +
      (publicados.reason ? ` — ${publicados.reason}` : ''),
  );

  console.log('\n✔ Rodada concluida');

  // Falha de publicacao sem nenhum sucesso vira codigo de erro: e o que faz a
  // execucao aparecer em vermelho na lista do painel, onde voce olha.
  process.exit(publicados.failed.length > 0 && publicados.published.length === 0 ? 1 : 0);
}

main().catch(die);
