/**
 * API Client — Centralized HTTP layer for backend communication.
 * Toggle between local mock and remote API via VITE_API_BASE_URL.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/*  Generic fetch helper                                               */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Query-string builder                                               */
/* ------------------------------------------------------------------ */

function filterParams(filters: { quarter: string; selectedBGs: string[]; selectedGeos: string[] }): string {
  const p = new URLSearchParams();
  p.set('quarter', filters.quarter);
  if (filters.selectedBGs.length) p.set('bgs', filters.selectedBGs.join(','));
  if (filters.selectedGeos.length) p.set('geos', filters.selectedGeos.join(','));
  return p.toString();
}

/* ------------------------------------------------------------------ */
/*  Dashboard Data APIs                                                */
/* ------------------------------------------------------------------ */

export interface ApiFilters {
  quarter: string;
  selectedBGs: string[];
  selectedGeos: string[];
}

export async function fetchOpeningData(filters: ApiFilters) {
  return apiFetch(`/api/data/opening?${filterParams(filters)}`);
}

export async function fetchSecondaryData(filters: ApiFilters) {
  return apiFetch(`/api/data/secondary?${filterParams(filters)}`);
}

export async function fetchTertiaryData(filters: ApiFilters) {
  return apiFetch(`/api/data/tertiary?${filterParams(filters)}`);
}

/* ------------------------------------------------------------------ */
/*  AI Chat API                                                        */
/* ------------------------------------------------------------------ */

export interface ChatApiRequest {
  message: string;
  filters: ApiFilters;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}

export interface ChatApiResponse {
  text: string;
  blocks: Array<{ type: string; data: Record<string, unknown> }>;
}

/** Non-streaming chat — returns full response */
export async function sendChatMessage(req: ChatApiRequest): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** Streaming chat — yields SSE events */
export async function* sendChatMessageStream(
  req: ChatApiRequest,
): AsyncGenerator<{ type: string; content?: string; text?: string; blocks?: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) throw new Error(`Chat stream error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            yield JSON.parse(data);
          } catch {
            // skip malformed
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Health check                                                       */
/* ------------------------------------------------------------------ */

export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch('/api/health');
    return true;
  } catch {
    return false;
  }
}
