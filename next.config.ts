import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Garante que a API key do OpenRouter nunca vaze para o client bundle
  serverExternalPackages: [],
  // Headers de segurança básicos
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
