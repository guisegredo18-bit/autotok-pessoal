import { die } from './_bootstrap';

async function main() {
  const { scanTrends, pruneOldTrends } = await import('../lib/trends/scan');
  const { env } = await import('../lib/env');

  console.log(`Buscando tendencias do TikTok (${env.trendCountry})…`);
  const result = await scanTrends({ country: env.trendCountry, period: 7, limit: 30 });

  console.log(`  ${result.fetched} lidas · ${result.inserted} novas · ${result.updated} atualizadas`);
  for (const warning of result.warnings) console.warn(`  aviso: ${warning}`);

  const removed = await pruneOldTrends(30);
  if (removed > 0) console.log(`  ${removed} tendencias antigas removidas`);

  if (result.fetched === 0) {
    throw new Error(
      'Nenhuma tendencia retornada. O Creative Center pode ter mudado a API — ' +
        'confira lib/trends/creative-center.ts.',
    );
  }
  console.log('✔ Varredura concluida');
  process.exit(0);
}

main().catch(die);
