'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface VerificationResult {
  id: string;
  status: string;
  result?: {
    found: boolean;
    isActive?: boolean;
    validFrom?: string;
    validTo?: string;
    productType?: string;
  };
  error?: string;
}

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

      // Poll for result
      let attempts = 0;
      while (attempts < 20) {
        await new Promise((r) => setTimeout(r, 3000));
        const data = await api.getVerification(initial.id) as VerificationResult;

        if (data.status !== 'pending') {
          setResult(data);
          break;
        }
        attempts++;
      }

      if (attempts >= 20) {
        setError('Verification timed out');
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
          <h3 className="font-bold mb-2">
            {result.result?.found
              ? result.result.isActive ? 'Active Vignette Found' : 'Vignette Found (Inactive)'
              : 'No Vignette Found'}
          </h3>
          {result.result?.found && (
            <div className="space-y-1 text-sm">
              {result.result.productType && <p>Type: {result.result.productType}</p>}
              {result.result.validFrom && <p>Valid From: {new Date(result.result.validFrom).toLocaleDateString()}</p>}
              {result.result.validTo && <p>Valid To: {new Date(result.result.validTo).toLocaleDateString()}</p>}
            </div>
          )}
          {result.error && <p className="text-red-600 text-sm mt-2">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
