import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // O @ffmpeg-installer resolve o binario por `require` em tempo de execucao.
  // Empacotado pelo bundler, esse caminho deixaria de existir.
  serverExternalPackages: ['postgres', '@ffmpeg-installer/ffmpeg'],
  // O rastreador do Next segue `import`, entao nao enxerga nada que so e lido
  // em tempo de execucao: os .sql das migrations, o binario do ffmpeg e a
  // fonte da legenda ficariam de fora do pacote da Vercel. Cada um deles falha
  // de um jeito diferente e nenhum falha no build — a preparacao do banco
  // acusa "arquivo nao encontrado", a renderizacao acusa "ffmpeg nao
  // encontrado", e a fonte, pior de todas, nao acusa nada: devolve o video com
  // a legenda invisivel.
  outputFileTracingIncludes: {
    '/**': [
      './drizzle/**',
      './assets/fonts/**',
      './node_modules/@ffmpeg-installer/**',
    ],
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
