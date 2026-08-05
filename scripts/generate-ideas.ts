import { arg, die } from './_bootstrap';

async function main() {
  const { generateIdeasFromTrends, generateIdeasForTopic } = await import(
    '../lib/pipeline/ideas'
  );

  const topic = arg('topic', 'TOPIC');
  console.log(topic ? `Gerando ideias sobre "${topic}"…` : 'Gerando ideias das tendencias…');

  const result = topic
    ? await generateIdeasForTopic(topic)
    : await generateIdeasFromTrends();

  console.log(`  ${result.created} criada(s), ${result.discarded} descartada(s) por nota baixa`);
  console.log(`  tendencias usadas: ${result.trendsUsed.join(', ') || '—'}`);
  console.log('✔ Geracao concluida');
  process.exit(0);
}

main().catch(die);
