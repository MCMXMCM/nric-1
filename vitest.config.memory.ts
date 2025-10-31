import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: true,
    
    // Memory optimization settings
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Use single thread to reduce memory overhead
        isolate: false, // Share context between tests to reduce memory
      }
    },
    
    // Reduce concurrent test execution to save memory
    maxConcurrency: 1,
    
    // More aggressive garbage collection
    testTimeout: 10000,
    hookTimeout: 5000,
    
    // Limit memory usage per test file
    sequence: {
      concurrent: false, // Run tests sequentially to reduce memory pressure
    },
    
    // Coverage settings that won't consume excessive memory
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/test/**',
      ],
    },
    
    // Include/exclude patterns
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.git/**',
    ],
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // Optimize build for tests
  esbuild: {
    target: 'node14',
    minify: false, // Don't minify in tests to save memory during compilation
  },
  
  // Define for environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
});
