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
  const { runAutopilotRound } = await import('../lib/pipeline/round');
  const { describeAutopilot } = await import('../lib/pipeline/autopilot');
  const { getSettings } = await import('../lib/db/settings');
  const { hydrateEnv } = await import('../lib/secrets');

  await hydrateEnv();
  const settings = await getSettings();
  console.log(`Piloto automatico: ${describeAutopilot(settings)}`);

  if (!settings.autoApprove && !settings.autoPublish) {
    console.log('Nada a fazer — ligue em Configuracoes → Piloto automatico.');
    process.exit(0);
  }

  // O render acontece no proprio processo quando o motor e "aqui": este script
  // roda no runner do Actions ou num terminal, e nos dois casos ha ffmpeg e
  // tempo de sobra — que e justamente o que falta na Vercel.
  const result = await runAutopilotRound((m) => console.log(`  ${m}`));

  console.log(`\n${result.summary}`);
  for (const blocker of result.blockers) {
    console.log(`\n[${blocker.severity}] ${blocker.label}\n  ${blocker.hint}`);
  }

  console.log('\n✔ Rodada concluida');

  // Falha de publicacao sem nenhum sucesso vira codigo de erro: e o que faz a
  // execucao aparecer em vermelho na lista do painel, onde voce olha.
  process.exit(result.failed > 0 && result.published === 0 ? 1 : 0);
}

main().catch(die);
