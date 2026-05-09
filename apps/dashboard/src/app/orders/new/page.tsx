'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function NewPurchasePage() {
  const [form, setForm] = useState({
    country: 'bulgaria',
    vehicleType: 'light',
    vignetteType: 'weekly',
    vehicleCountry: '',
    plateNumber: '',
    validityStartDate: new Date().toISOString().split('T')[0],
    validityStartTime: '00:00',
    email: '',
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await api.createPurchase(form);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">New Vignette Purchase</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type</label>
            <select
              value={form.vehicleType}
              onChange={(e) => update('vehicleType', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="light">Light Vehicle (≤3.5t)</option>
              <option value="trailer">Trailer (combined &gt;3.5t)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vignette Type</label>
            <select
              value={form.vignetteType}
              onChange={(e) => update('vignetteType', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="daily">Daily - €4.09</option>
              <option value="weekly">Weekly - €7.67</option>
              <option value="monthly">Monthly - €15.34</option>
              <option value="quarterly">Quarterly - €27.61</option>
              <option value="annual">Annual - €49.60</option>
              <option value="weekend">Weekend - €5.11</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Country (ISO)</label>
            <input
              type="text"
              placeholder="DE, GB, RO..."
              value={form.vehicleCountry}
              onChange={(e) => update('vehicleCountry', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              maxLength={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plate Number</label>
            <input
              type="text"
              placeholder="B1234AB"
              value={form.plateNumber}
              onChange={(e) => update('plateNumber', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={form.validityStartDate}
              onChange={(e) => update('validityStartDate', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              value={form.validityStartTime}
              onChange={(e) => update('validityStartTime', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email (for vignette delivery)</label>
          <input
            type="email"
            placeholder="customer@example.com"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Initiate Purchase'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">Purchase queued successfully!</p>
          <p className="text-green-700 text-sm mt-1">Order ID: {result.id}</p>
          <p className="text-green-700 text-sm">Status: {result.status}</p>
          <a
            href={`/orders/${result.id}`}
            className="inline-block mt-2 text-blue-600 hover:underline"
          >
            Track Order →
          </a>
        </div>
      )}
    </div>
  );
}
