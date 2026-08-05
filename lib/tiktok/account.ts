import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, type Account } from '@/lib/db/schema';
import { getUserInfo, refreshToken, type TokenResponse, type UserInfo } from './api';

/** Renovamos o token com folga: um job longo nao pode expirar no meio. */
const REFRESH_MARGIN_MS = 10 * 60_000;

export async function getAccount(): Promise<Account | null> {
  const [account] = await db.select().from(accounts).limit(1);
  return account ?? null;
}

/** Grava (ou atualiza) a conta conectada depois do fluxo de OAuth. */
export async function saveAccount(token: TokenResponse): Promise<Account> {
  // O perfil e opcional: se a chamada falhar, ainda queremos salvar os tokens
  // (sem eles nao ha publicacao; sem o nome de exibicao, so falta o enfeite).
  const info: UserInfo = await getUserInfo(token.access_token).catch(() => ({
    open_id: token.open_id,
  }));

  const values = {
    openId: token.open_id,
    displayName: info.display_name ?? null,
    avatarUrl: info.avatar_url ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    refreshExpiresAt: new Date(Date.now() + token.refresh_expires_in * 1000),
    scope: token.scope,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(accounts)
    .values(values)
    .onConflictDoUpdate({ target: accounts.openId, set: values })
    .returning();
  return saved;
}

/**
 * Devolve um access token valido, renovando quando necessario.
 *
 * O refresh token do TikTok tambem expira (365 dias). Quando isso acontece nao
 * ha como recuperar sozinho — a mensagem aponta direto para o que resolve, que
 * e reconectar a conta pelo painel.
 */
export async function getValidAccessToken(): Promise<string> {
  const account = await getAccount();
  if (!account) {
    throw new Error('Nenhuma conta do TikTok conectada. Conecte em Configuracoes.');
  }

  if (account.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
    return account.accessToken;
  }

  if (account.refreshExpiresAt && account.refreshExpiresAt.getTime() < Date.now()) {
    throw new Error(
      'A autorizacao do TikTok expirou. Reconecte a conta em Configuracoes.',
    );
  }

  const refreshed = await refreshToken(account.refreshToken);
  await db
    .update(accounts)
    .set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + refreshed.refresh_expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id));

  return refreshed.access_token;
}

export async function disconnectAccount(): Promise<void> {
  await db.delete(accounts);
}

/** Marca se a conta ja pode publicar publicamente (app auditado). */
export async function setCanPostPublic(value: boolean): Promise<void> {
  const account = await getAccount();
  if (!account || account.canPostPublic === value) return;
  await db
    .update(accounts)
    .set({ canPostPublic: value, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
}
