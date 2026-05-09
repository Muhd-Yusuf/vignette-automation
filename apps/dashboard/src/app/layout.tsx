import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vignette Automation Dashboard',
  description: 'Multi-site vignette purchase automation system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900">Vignette Automation</h1>
            <div className="flex gap-4">
              <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/orders" className="text-gray-600 hover:text-gray-900">Orders</a>
              <a href="/orders/new" className="text-gray-600 hover:text-gray-900">New Purchase</a>
              <a href="/verify" className="text-gray-600 hover:text-gray-900">Verify</a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
