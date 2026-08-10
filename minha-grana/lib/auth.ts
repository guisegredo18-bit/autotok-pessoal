import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual, createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Autenticacao do painel.
 *
 * E uma aplicacao pessoal de um usuario so, entao nao ha cadastro: uma senha
 * unica (APP_PASSWORD) troca por um cookie de sessao assinado, valido por 30
 * dias — tempo suficiente para nao ficar logando toda hora no celular.
 */

const COOKIE = 'grana_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function secret(): Uint8Array {
  if (!env.authSecret) {
    throw new Error('AUTH_SECRET nao configurado. Gere com: openssl rand -hex 32');
  }
  return new TextEncoder().encode(env.authSecret);
}

/**
 * Comparacao em tempo constante: comparar com `===` vaza, pelo tempo de
 * resposta, quantos caracteres iniciais da senha estao certos. O hash antes da
 * comparacao garante que os dois lados tenham o mesmo tamanho.
 */
function passwordMatches(candidate: string): boolean {
  if (!env.appPassword) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(env.appPassword).digest();
  return timingSafeEqual(a, b);
}

export async function login(password: string): Promise<boolean> {
  if (!passwordMatches(password)) return false;

  const token = await new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.appUrl.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

/** Usado pelas rotas de API: lanca se nao estiver autenticado. */
export async function requireAuth(): Promise<void> {
  if (!(await isLoggedIn())) {
    throw new UnauthorizedError();
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Nao autenticado.');
    this.name = 'UnauthorizedError';
  }
}
