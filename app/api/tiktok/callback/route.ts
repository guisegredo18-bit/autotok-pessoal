import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { isLoggedIn } from '@/lib/auth';
import { exchangeCode } from '@/lib/tiktok/api';
import { saveAccount } from '@/lib/tiktok/account';
import { hydrateEnv } from '@/lib/secrets';
import { env } from '@/lib/env';

/** Retorno do TikTok apos o usuario autorizar (ou recusar). */
export async function GET(request: NextRequest) {
  const back = (message: string, ok = false) =>
    NextResponse.redirect(
      `${env.appUrl}/config?${ok ? 'ok' : 'erro'}=${encodeURIComponent(message)}`,
    );

  if (!(await isLoggedIn())) {
    return NextResponse.redirect(`${env.appUrl}/login`);
  }
  await hydrateEnv();

  const params = request.nextUrl.searchParams;
  const error = params.get('error');
  if (error) {
    return back(`TikTok recusou: ${params.get('error_description') ?? error}`);
  }

  const code = params.get('code');
  const state = params.get('state');
  const jar = await cookies();
  const expected = jar.get('tiktok_oauth_state')?.value;
  jar.delete('tiktok_oauth_state');

  if (!code) return back('O TikTok nao devolveu o codigo de autorizacao.');
  if (!state || !expected || state !== expected) {
    return back('Sessao de autorizacao invalida. Tente conectar novamente.');
  }

  try {
    const token = await exchangeCode(code);
    await saveAccount(token);
    return back('Conta do TikTok conectada.', true);
  } catch (err) {
    return back(err instanceof Error ? err.message : String(err));
  }
}
