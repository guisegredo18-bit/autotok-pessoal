import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Carrega o .env antes de qualquer outro import que leia process.env.
 *
 * Escrito a mao em vez de usar dotenv por um motivo pratico: no GitHub Actions
 * nao existe .env (as variaveis vem dos secrets), e um `import` que explode
 * quando o arquivo nao existe transformaria uma dependencia opcional num
 * requisito. Aqui, arquivo ausente e simplesmente um no-op.
 */
function loadEnvFile(): void {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;

  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Variaveis reais do ambiente ganham do arquivo: e assim que um secret do
    // CI sobrescreve um valor de desenvolvimento sem editar nada.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

/** Encerra o processo com a mensagem certa, sem stack trace ilegivel. */
export function die(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n✖ ${message}\n`);
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
}

/** Lê um argumento de linha de comando ou variavel de ambiente. */
export function arg(name: string, envName: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : process.env[envName];
}
