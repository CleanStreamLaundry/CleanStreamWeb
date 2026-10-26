import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep disconnected forwarding from feeding its own errors back into Vite.
  // Browser console diagnostics remain available.
  server: { forwardConsole: false },
  test: {
    globals: true,
    exclude: ['node_modules/**', 'dist/**', 'scripts/**'],
    environment: 'jsdom', 
    setupFiles: './src/setupTests.ts',
    css: false,
    coverage: {
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules/', 'src/**/*.test.{ts,tsx}', 'src/supabase/enum/*', 'src/supabase/client.ts', 'src/interfaces/*', 'src/di/*', 
        'src/App.tsx', 'src/global.d.ts', 'src/main.tsx', 'src/components/HomePage.tsx'
      ],
    },
  },
})
