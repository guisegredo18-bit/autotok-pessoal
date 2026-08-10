import { NextResponse, type NextRequest } from 'next/server';
import { isLoggedIn } from '@/lib/auth';
import { listCommissions } from '@/lib/pipeline/comissoes';
import { fileName, toCsv } from '@/lib/afiliados/exportar';

/**
 * Baixa as comissoes em CSV.
 *
 * E uma rota, e nao uma server action, porque o resultado e um download: uma
 * action devolveria o texto para o JavaScript montar um arquivo, e no Safari
 * do iPhone esse caminho e justamente o que costuma nao salvar nada.
 */
export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ erro: 'nao autenticado' }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get('dias'));
  const rows = await listCommissions(
    Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : 365,
  );

  return new NextResponse(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName(rows)}"`,
      // Dado de renda nao pode ficar em cache de proxy nenhum.
      'cache-control': 'no-store, private',
    },
  });
}
