// Thin Redis client wrapper shared across admin server routes.
//
// Uses node-redis (`redis` package) which requires the Node runtime —
// any route that calls getJSON/setJSON/del must not set runtime='edge'.
// Falls back to null when REDIS_URL is unset so local dev without the
// env var degrades gracefully to DB-only reads.
//
// Connection is module-singleton so warm serverless invocations reuse
// the same TCP connection instead of reconnecting per request.

import { createClient, type RedisClientType } from 'redis';

type Client = ReturnType<typeof createClient>;

let clientPromise: Promise<Client | null> | null = null;

function connect(): Promise<Client | null> {
  const url = process.env.REDIS_URL;
  if (!url) return Promise.resolve(null);

  const client = createClient({ url });
  // Swallow runtime errors so a Redis outage never crashes the route.
  client.on('error', (err) => console.warn('[redis] connection error', err?.message ?? err));

  return client.connect()
    .then(() => client)
    .catch((err) => {
      console.warn('[redis] connect failed', err?.message ?? err);
      return null;
    });
}

async function getClient(): Promise<Client | null> {
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

export async function redisGetJSON<T = unknown>(key: string): Promise<T | null> {
  try {
    const c = await getClient();
    if (!c) return null;
    const raw = await c.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[redis] get failed', key, err);
    return null;
  }
}

export async function redisSetJSON(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    await c.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.warn('[redis] set failed', key, err);
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    await c.del(key);
  } catch (err) {
    console.warn('[redis] del failed', key, err);
  }
}
