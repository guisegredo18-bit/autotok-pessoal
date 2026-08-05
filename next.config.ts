import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  // Sem isto os arquivos .sql da pasta drizzle/ ficam de fora do bundle da
  // Vercel, e a preparacao do banco pelo painel falha com "arquivo nao
  // encontrado" — justamente no primeiro uso, quem instalou pelo celular.
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.pexels.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
