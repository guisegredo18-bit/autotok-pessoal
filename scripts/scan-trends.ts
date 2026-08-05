import { die } from './_bootstrap';

async function main() {
  const { runScan } = await import('../lib/pipeline/trends');

  console.log('Buscando tendencias do TikTok…');
  const result = await runScan();

  console.log(`  ${result.fetched} lidas · ${result.inserted} novas · ${result.updated} atualizadas`);
  for (const warning of result.warnings) console.warn(`  aviso: ${warning}`);

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
