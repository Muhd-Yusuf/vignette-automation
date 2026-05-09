'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface PurchaseDetail {
  id: string;
  status: string;
  paymentUrl?: string;
  paymentUrlExpiresAt?: string;
  vignetteDetails: {
    type: string;
    vehicleCountry: string;
    plateNumber: string;
    validFrom: string;
    validTo?: string;
    priceEUR?: number;
    priceBGN?: number;
  };
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!params.id) return;

    const fetchPurchase = async () => {
      try {
        const data = await api.getPurchase(params.id as string);
        setPurchase(data as PurchaseDetail);

        // Stop polling if terminal state
        const terminalStates = ['awaiting_payment', 'payment_completed', 'verified', 'failed', 'cancelled'];
        if (terminalStates.includes((data as PurchaseDetail).status)) {
          setPolling(false);
        }
      } catch (err: any) {
        setError(err.message);
        setPolling(false);
      }
    };

    fetchPurchase();

    // Poll every 3 seconds while processing
    if (polling) {
      const interval = setInterval(fetchPurchase, 3000);
      return () => clearInterval(interval);
    }
  }, [params.id, polling]);

  const handleRetry = async () => {
    try {
      await api.retryPurchase(params.id as string);
      setPolling(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelPurchase(params.id as string);
      const data = await api.getPurchase(params.id as string);
      setPurchase(data as PurchaseDetail);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (error && !purchase) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>;
  }

  if (!purchase) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const isExpired = purchase.paymentUrlExpiresAt && new Date(purchase.paymentUrlExpiresAt) < new Date();

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Order Detail</h2>

      {/* Payment URL Card - Most Important */}
      {purchase.paymentUrl && (
        <div className={`rounded-lg border-2 p-6 mb-6 ${isExpired ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
          <h3 className="font-bold text-lg mb-2">
            {isExpired ? 'Payment Link Expired' : 'Payment Link Ready'}
          </h3>
          <div className="bg-white rounded border p-3 mb-3 break-all font-mono text-sm">
            {purchase.paymentUrl}
          </div>
          {!isExpired && (
            <>
              <a
                href={purchase.paymentUrl}
                target="_blank"
                rel="noopener"
                className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 mr-3"
              >
                Open Payment Page
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(purchase.paymentUrl!)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                Copy Link
              </button>
            </>
          )}
          {purchase.paymentUrlExpiresAt && (
            <p className="text-sm mt-3 text-gray-600">
              Expires: {new Date(purchase.paymentUrlExpiresAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Status & Details */}
      <div className="bg-white rounded-lg border p-6 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <Detail label="Status" value={purchase.status} />
          <Detail label="Attempts" value={String(purchase.attempts)} />
          <Detail label="Plate" value={purchase.vignetteDetails.plateNumber} />
          <Detail label="Country" value={purchase.vignetteDetails.vehicleCountry} />
          <Detail label="Type" value={purchase.vignetteDetails.type} />
          <Detail label="Price" value={purchase.vignetteDetails.priceEUR ? `€${purchase.vignetteDetails.priceEUR}` : '-'} />
          <Detail label="Valid From" value={purchase.vignetteDetails.validFrom ? new Date(purchase.vignetteDetails.validFrom).toLocaleDateString() : '-'} />
          <Detail label="Valid To" value={purchase.vignetteDetails.validTo ? new Date(purchase.vignetteDetails.validTo).toLocaleDateString() : '-'} />
          <Detail label="Created" value={new Date(purchase.createdAt).toLocaleString()} />
          <Detail label="Updated" value={new Date(purchase.updatedAt).toLocaleString()} />
        </div>

        {purchase.error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-800 text-sm">{purchase.error}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {purchase.status === 'failed' && (
          <button onClick={handleRetry} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            Retry Purchase
          </button>
        )}
        {['queued', 'processing'].includes(purchase.status) && (
          <button onClick={handleCancel} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
            Cancel
          </button>
        )}
        <a href="/orders" className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
          Back to Orders
        </a>
      </div>

      {/* Processing indicator */}
      {['queued', 'processing'].includes(purchase.status) && (
        <div className="mt-6 flex items-center gap-2 text-blue-600">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Processing... checking every 3 seconds</span>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}
