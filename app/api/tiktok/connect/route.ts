import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { isLoggedIn } from '@/lib/auth';
import { authorizeUrl } from '@/lib/tiktok/api';
import { hydrateEnv } from '@/lib/secrets';
import { env } from '@/lib/env';

/**
 * Inicia o OAuth do TikTok.
 *
 * O `state` aleatorio vai num cookie e volta na URL de callback; comparar os
 * dois e o que impede alguem de te enviar um link de callback forjado e
 * conectar a conta dele na sua aplicacao (CSRF).
 */
export async function GET() {
  if (!(await isLoggedIn())) {
    return NextResponse.redirect(`${env.appUrl}/login`);
  }
  // As credenciais do TikTok podem estar no banco, preenchidas pelo painel.
  await hydrateEnv();

  const state = randomBytes(16).toString('hex');
  (await cookies()).set('tiktok_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.appUrl.startsWith('https://'),
    path: '/',
    maxAge: 600,
  });

  try {
    return NextResponse.redirect(authorizeUrl(state));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${env.appUrl}/config?erro=${encodeURIComponent(message)}`,
    );
  }
}
