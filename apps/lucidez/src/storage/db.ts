/**
 * Persistencia local.
 *
 * Tudo mora no aparelho. Nao ha servidor, conta, nem sincronizacao — o que se
 * mede aqui e dado de saude, e a forma mais simples de nao vazar dado de saude
 * e nunca envia-lo para lugar nenhum. O preco disso e que backup vira
 * responsabilidade do usuario, e por isso a tela de ajustes exporta um arquivo.
 */

export type StoreName = 'profiles' | 'sessions' | 'results' | 'meta';

const DB_NAME = 'lucidez';
const DB_VERSION = 1;

export interface Store {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllBy<T>(store: StoreName, index: string, value: string): Promise<T[]>;
  put(store: StoreName, value: unknown): Promise<void>;
  putMany(store: StoreName, values: unknown[]): Promise<void>;
  remove(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  /** false quando caiu no modo memoria e os dados somem ao fechar a aba. */
  readonly durable: boolean;
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('profiles')) {
    db.createObjectStore('profiles', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('sessions')) {
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('profileId', 'profileId');
  }
  if (!db.objectStoreNames.contains('results')) {
    const results = db.createObjectStore('results', { keyPath: 'id' });
    results.createIndex('profileId', 'profileId');
    results.createIndex('sessionId', 'sessionId');
  }
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha no IndexedDB.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Nao foi possivel abrir o banco local.'));
    // Safari em aba privada abre e trava sem erro nem sucesso. Sem esse limite
    // o app ficaria na tela de carregando para sempre.
    setTimeout(() => reject(new Error('Tempo esgotado ao abrir o banco local.')), 4000);
  });
}

class IdbStore implements Store {
  readonly durable = true;
  constructor(private readonly db: IDBDatabase) {}

  private tx(store: StoreName, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(store, mode).objectStore(store);
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return request<T | undefined>(this.tx(store, 'readonly').get(key) as IDBRequest<T | undefined>);
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return request<T[]>(this.tx(store, 'readonly').getAll() as IDBRequest<T[]>);
  }

  getAllBy<T>(store: StoreName, index: string, value: string): Promise<T[]> {
    return request<T[]>(this.tx(store, 'readonly').index(index).getAll(value) as IDBRequest<T[]>);
  }

  async put(store: StoreName, value: unknown): Promise<void> {
    await request(this.tx(store, 'readwrite').put(value));
  }

  putMany(store: StoreName, values: unknown[]): Promise<void> {
    if (values.length === 0) return Promise.resolve();
    // Uma transacao so: com uma por item, importar um ano de historico faria
    // centenas de idas ao disco.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const value of values) os.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar em lote.'));
      tx.onabort = () => reject(tx.error ?? new Error('Gravacao em lote cancelada.'));
    });
  }

  async remove(store: StoreName, key: string): Promise<void> {
    await request(this.tx(store, 'readwrite').delete(key));
  }

  async clear(store: StoreName): Promise<void> {
    await request(this.tx(store, 'readwrite').clear());
  }
}

/** Ultimo recurso: mantem o app utilizavel numa aba privada, avisando na tela
 *  que nada sera guardado. Melhor um app que funciona e avisa do que uma tela
 *  de erro. */
class MemoryStore implements Store {
  readonly durable = false;
  private data: Record<StoreName, Map<string, unknown>> = {
    profiles: new Map(),
    sessions: new Map(),
    results: new Map(),
    meta: new Map(),
  };

  private keyOf(store: StoreName, value: unknown): string {
    const record = value as Record<string, string>;
    return store === 'meta' ? record.key! : record.id!;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.data[store].get(key) as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.data[store].values()] as T[];
  }

  async getAllBy<T>(store: StoreName, index: string, value: string): Promise<T[]> {
    const all = await this.getAll<Record<string, unknown>>(store);
    return all.filter((row) => row[index] === value) as T[];
  }

  async put(store: StoreName, value: unknown): Promise<void> {
    this.data[store].set(this.keyOf(store, value), value);
  }

  async putMany(store: StoreName, values: unknown[]): Promise<void> {
    for (const value of values) await this.put(store, value);
  }

  async remove(store: StoreName, key: string): Promise<void> {
    this.data[store].delete(key);
  }

  async clear(store: StoreName): Promise<void> {
    this.data[store].clear();
  }
}

let pending: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof indexedDB === 'undefined') return new MemoryStore();
    try {
      const db = await openDatabase();
      // Pede ao navegador para nao despejar os dados quando o disco apertar.
      // O Safari, para sites nao instalados na tela de inicio, limpa storage
      // apos sete dias sem uso; instalado como app, isso nao acontece.
      void navigator.storage?.persist?.().catch(() => undefined);
      return new IdbStore(db);
    } catch {
      return new MemoryStore();
    }
  })();
  return pending;
}
