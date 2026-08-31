/** Identificador unico. `randomUUID` existe no Safari 15.4+ e no Node 19+;
 *  o fallback cobre contextos nao seguros (http em rede local, por exemplo),
 *  onde a API fica indisponivel. */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
