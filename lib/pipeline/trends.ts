import { scanTrends, pruneOldTrends, type ScanResult } from '@/lib/trends/scan';
import { withJob } from '@/lib/db/jobs';
import { hydrateEnv } from '@/lib/secrets';
import { env } from '@/lib/env';

/**
 * Varredura de tendencias com registro de execucao.
 *
 * `scanTrends` fica puro em lib/trends para poder ser testado sem banco; a
 * parte que grava historico de execucao mora aqui.
 */
export async function runScan(): Promise<ScanResult> {
  await hydrateEnv();
  return withJob('scan', undefined, async (log) => {
    log(`buscando tendencias (${env.trendCountry})`);
    const result = await scanTrends({ country: env.trendCountry, period: 7, limit: 30 });

    log(`${result.fetched} lidas · ${result.inserted} novas · ${result.updated} atualizadas`);
    for (const warning of result.warnings) log(`aviso: ${warning}`);

    const removed = await pruneOldTrends(30);
    if (removed > 0) log(`${removed} tendencias antigas removidas`);

    return result;
  });
}
