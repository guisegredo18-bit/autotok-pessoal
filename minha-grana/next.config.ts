import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  // O rastreador do Next segue `import`, entao nao enxerga os .sql das
  // migrations — eles sao lidos em tempo de execucao pelo botao "Preparar
  // banco de dados". Sem isto, esse botao falha com "arquivo nao encontrado"
  // no deploy, e so no deploy.
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**'],
  },
  images: {
    remotePatterns: [
      // Imagens de produto da Amazon.
      { protocol: 'https', hostname: '**.media-amazon.com' },
      { protocol: 'https', hostname: '**.ssl-images-amazon.com' },
      // Imagens de produto da Hotmart.
      { protocol: 'https', hostname: '**.hotmart.com' },
    ],
  },
};

export default nextConfig;
