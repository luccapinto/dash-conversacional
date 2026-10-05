import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // os testes de lib/analytics percorrem o roster inteiro (~8 mil pessoas × 36 meses) e montam a
    // tabela de fatos; o padrão de 5 s/10 s estoura quando rodam em paralelo
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // O Next resolve `import 'server-only'` internamente; fora do Next (vitest) é um módulo vazio.
      'server-only': path.resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
});
