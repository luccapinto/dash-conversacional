import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // frame-ancestors substitui X-Frame-Options (mais flexível e moderno)
          // permite Vercel preview + bloqueia outras origens arbitrárias
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://vercel.com https://*.vercel.app" },
        ],
      },
    ];
  },
};

export default nextConfig;
