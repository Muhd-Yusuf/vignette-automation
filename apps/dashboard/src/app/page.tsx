'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Stats {
  today: number;
  pending: number;
  failed: number;
  totalCompleted: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getStats()
      .then((data) => setStats(data as Stats))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load stats: {error}</p>
        <p className="text-red-600 text-sm mt-1">Make sure the API server is running on port 3001</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today's Orders" value={stats?.today ?? '-'} color="blue" />
        <StatCard label="Pending Payment" value={stats?.pending ?? '-'} color="yellow" />
        <StatCard label="Failed Today" value={stats?.failed ?? '-'} color="red" />
        <StatCard label="Total Completed" value={stats?.totalCompleted ?? '-'} color="green" />
      </div>

      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex gap-3">
          <a
            href="/orders/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            New Purchase
          </a>
          <a
            href="/verify"
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
          >
            Verify Vignette
          </a>
          <a
            href="/orders?status=failed"
            className="bg-red-50 text-red-700 px-4 py-2 rounded-lg hover:bg-red-100"
          >
            View Failed Orders
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    green: 'bg-green-50 border-green-200 text-green-900',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
