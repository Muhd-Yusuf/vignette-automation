const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api/v1';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Purchases
  createPurchase: (data: any) =>
    fetchAPI('/purchases', { method: 'POST', body: JSON.stringify(data) }),

  getPurchase: (id: string) => fetchAPI(`/purchases/${id}`),

  listPurchases: (params?: { status?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return fetchAPI(`/purchases?${query}`);
  },

  cancelPurchase: (id: string) =>
    fetchAPI(`/purchases/${id}/cancel`, { method: 'POST' }),

  clearAllPurchases: () =>
    fetchAPI('/purchases', { method: 'DELETE' }),

  retryPurchase: (id: string) =>
    fetchAPI(`/purchases/${id}/retry`, { method: 'POST' }),

  // Verification
  verify: (data: any) =>
    fetchAPI('/verify', { method: 'POST', body: JSON.stringify(data) }),

  getVerification: (id: string) => fetchAPI(`/verify/${id}`),

  // Pre-purchase period check
  checkPeriod: (data: any) =>
    fetchAPI('/check-period', { method: 'POST', body: JSON.stringify(data) }),

  getCheckPeriod: (id: string) => fetchAPI(`/check-period/${id}`),

  // Config
  getVignetteTypes: () => fetchAPI('/config/vignette-types'),

  // Stats
  getStats: () => fetchAPI('/stats'),

  // Health
  getHealth: () => fetchAPI('/health'),
};
