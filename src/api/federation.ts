import { supabase } from '@/lib/supabase';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const GATEWAY_API_KEY = import.meta.env.VITE_GATEWAY_API_KEY;

async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    // supabase.auth may be a proxy that throws if not configured — guard safely
    // @ts-ignore
    if (!supabase?.auth?.getSession) return null;
    // supabase.auth.getSession() returns { data, error }
    // @ts-ignore
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token ?? null;
    return token;
  } catch {
    return null;
  }
}

async function gatewayFetch(path: string, options: RequestInit = {}) {
  if (!GATEWAY_URL) throw new Error('VITE_GATEWAY_URL is not set');
  const supabaseToken = await getSupabaseAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(GATEWAY_API_KEY ? { 'x-gateway-api-key': GATEWAY_API_KEY } : {}),
    ...(supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : {}),
  };

  const res = await fetch(`${GATEWAY_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}), ...headers },
    credentials: 'omit',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export async function getHomeTimeline(params: { limit?: number; before?: string } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.before) q.set('before', params.before);
  return gatewayFetch(`/timeline/home?${q.toString()}`);
}

export async function getGlobalTimeline(params: { limit?: number; before?: string } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.before) q.set('before', params.before);
  return gatewayFetch(`/timeline/global?${q.toString()}`);
}

export async function getLocalTimeline(params: { limit?: number; before?: string } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.before) q.set('before', params.before);
  return gatewayFetch(`/timeline/local?${q.toString()}`);
}

export async function getUser(acct: string) {
  return gatewayFetch(`/users/${encodeURIComponent(acct)}`);
}

export async function postStatus(payload: { content: string; mediaIds?: string[]; visibility?: string; inReplyTo?: string }) {
  return gatewayFetch(`/posts`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function follow(acct: string) {
  return gatewayFetch(`/follow`, { method: 'POST', body: JSON.stringify({ target: acct }) });
}

export async function boost(postId: string) {
  return gatewayFetch(`/boost`, { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function favorite(postId: string) {
  return gatewayFetch(`/favorite`, { method: 'POST', body: JSON.stringify({ post_id: postId }) });
}

export async function reply(payload: { postId: string; content: string }) {
  return gatewayFetch(`/reply`, { method: 'POST', body: JSON.stringify({ post_id: payload.postId, content: payload.content }) });
}

export async function search(q: string, type: 'users' | 'posts' | 'hashtags' | 'instances' = 'users') {
  const params = new URLSearchParams({ q, type });
  return gatewayFetch(`/search?${params.toString()}`);
}
