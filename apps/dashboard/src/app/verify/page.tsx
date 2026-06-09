'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface VignetteRecord {
  idNumber?: string;
  vehicleClass?: string;
  validFrom?: string;
  validTo?: string;
  amount?: string;
  status?: 'active' | 'expired' | 'unused' | 'unknown';
  statusLabel?: string;
}

interface VerificationResult {
  id: string;
  status: string;
  result?: {
    found: boolean;
    isActive?: boolean;
    vignettes?: VignetteRecord[];
    validFrom?: string;
    validTo?: string;
    idNumber?: string;
  };
  error?: string;
}

function fmt(d?: string) {
  return d ? new Date(d).toLocaleString() : '—';
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-200 text-gray-700',
  unused: 'bg-blue-100 text-blue-800',
  unknown: 'bg-yellow-100 text-yellow-800',
};

export default function VerifyPage() {
  const [form, setForm] = useState({ vehicleCountry: '', plateNumber: '' });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Create verification request
      const initial = await api.verify({
        country: 'bulgaria',
        vehicleCountry: form.vehicleCountry,
        plateNumber: form.plateNumber,
      }) as { id: string };

      // Poll for result (CAPTCHA solving takes 60-90s, so poll for up to 150s)
      let attempts = 0;
      while (attempts < 50) {
        await new Promise((r) => setTimeout(r, 3000));
        const data = await api.getVerification(initial.id) as VerificationResult;

        if (data.status !== 'pending') {
          setResult(data);
          break;
        }
        attempts++;
      }

      if (attempts >= 50) {
        setError('Verification timed out — CAPTCHA solving may be slow, try again');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Verify Vignette</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Country (ISO code)</label>
          <input
            type="text"
            placeholder="DE, GB, RO, BG..."
            value={form.vehicleCountry}
            onChange={(e) => setForm((f) => ({ ...f, vehicleCountry: e.target.value }))}
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
            onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Check Vignette'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-lg border p-4 ${
          result.result?.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <h3 className="font-bold mb-3">
            {result.result?.found
              ? result.result.isActive
                ? 'Active Vignette Found'
                : 'Vignette(s) Found — none currently active'
              : 'No Vignette Found'}
          </h3>

          {result.result?.found && (result.result.vignettes?.length ?? 0) > 0 && (
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="px-2 py-1 font-medium">Id Number</th>
                    <th className="px-2 py-1 font-medium">Vehicle Class</th>
                    <th className="px-2 py-1 font-medium">Valid From</th>
                    <th className="px-2 py-1 font-medium">Valid To</th>
                    <th className="px-2 py-1 font-medium">Amount</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.result.vignettes!.map((v, i) => (
                    <tr key={v.idNumber ?? i} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-mono text-xs">{v.idNumber ?? '—'}</td>
                      <td className="px-2 py-1.5">{v.vehicleClass ?? '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmt(v.validFrom)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmt(v.validTo)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{v.amount ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[v.status ?? 'unknown']
                        }`}>
                          {v.statusLabel ?? v.status ?? 'unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.error && <p className="text-red-600 text-sm mt-2">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
