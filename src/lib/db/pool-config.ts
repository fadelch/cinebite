function bounded(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
/** Per warm instance, in addition to the hosted Neon transaction pooler. */
export function runtimePoolConfig() {
  return {
    max: bounded("DB_POOL_MAX", 10, 1, 20),
    connectionTimeoutMillis: 2500,
    idleTimeoutMillis: 10000,
    query_timeout: bounded("DB_QUERY_TIMEOUT_MS", 10000, 1000, 30000),
  };
}
