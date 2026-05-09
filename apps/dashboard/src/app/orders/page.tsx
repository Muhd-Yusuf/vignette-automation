'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Purchase {
  id: string;
  status: string;
  country: string;
  plateNumber: string;
  vignetteType: string;
  paymentUrl?: string;
  priceEUR?: number;
  createdAt: string;
}

interface PurchaseList {
  data: Purchase[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function OrdersPage() {
  const [purchases, setPurchases] = useState<PurchaseList | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listPurchases({ status: statusFilter || undefined, page, limit: 20 })
      .then((data) => setPurchases(data as PurchaseList))
      .catch((err) => setError(err.message));
  }, [statusFilter, page]);

  const statusColors: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    awaiting_payment: 'bg-yellow-100 text-yellow-800',
    payment_completed: 'bg-green-100 text-green-800',
    verified: 'bg-green-200 text-green-900',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-200 text-gray-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
        <a href="/orders/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          New Purchase
        </a>
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'queued', 'processing', 'awaiting_payment', 'failed'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 rounded-full text-sm ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plate</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Price</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Payment</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchases?.data.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <a href={`/orders/${p.id}`} className="text-blue-600 hover:underline font-mono">
                    {p.plateNumber}
                  </a>
                </td>
                <td className="px-4 py-3 text-sm capitalize">{p.vignetteType}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || ''}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{p.priceEUR ? `€${p.priceEUR}` : '-'}</td>
                <td className="px-4 py-3">
                  {p.paymentUrl && (
                    <a href={p.paymentUrl} target="_blank" rel="noopener" className="text-blue-600 text-sm hover:underline">
                      Pay →
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(p.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {purchases && purchases.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-gray-500">
              Page {purchases.pagination.page} of {purchases.pagination.totalPages} ({purchases.pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= purchases.pagination.totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
