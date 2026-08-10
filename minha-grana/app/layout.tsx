import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minha Grana',
  description: 'Comissoes de afiliado da Amazon e da Hotmart, em dolar, pelo iPhone.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Grana',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b0f',
  width: 'device-width',
  initialScale: 1,
  // Sem zoom: num app instalado o pinch-zoom acidental atrapalha mais do que ajuda.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-ink font-sans antialiased">{children}</body>
    </html>
  );
}
