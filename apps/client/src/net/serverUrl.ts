/** Room server address. Dev uses 127.0.0.1 (localhost points at another project on this machine). */
export function serverUrl(): string {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const v = env.VITE_SERVER_URL;
  if (typeof v === 'string' && v) return v.replace(/\/$/, '');
  return env.DEV ? 'http://127.0.0.1:8787' : 'https://fitd-server.dorukplays.com';
}
export const wsUrl = (base = serverUrl()) => base.replace(/^http/, 'ws');

export async function createRoom(): Promise<string> {
  const r = await fetch(`${serverUrl()}/api/rooms`, { method: 'POST' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { code } = await r.json() as { code: string };
  return code;
}
