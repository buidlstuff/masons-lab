import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: 'manifest.json',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');

          if (normalized.includes('/src/components/AssistantPanel.tsx') || normalized.includes('/src/lib/api.ts')) {
            return 'assistant';
          }

          if (normalized.includes('/src/lib/physics-engine.ts') || normalized.includes('/node_modules/matter-js/')) {
            return 'builder-physics';
          }

          if (
            normalized.includes('/src/components/MachineCanvas.tsx')
            || normalized.includes('/src/lib/p5-lite.ts')
            || normalized.includes('/node_modules/p5/')
          ) {
            return 'builder-render';
          }

          if (normalized.includes('/src/lib/starter-catalog.ts')) {
            return 'seed-catalog';
          }

          if (
            normalized.includes('/src/pages/MachinePage.tsx')
            || normalized.includes('/src/pages/JobPage.tsx')
            || normalized.includes('/src/pages/BlueprintPage.tsx')
          ) {
            return 'detail-pages';
          }

          if (
            normalized.includes('/node_modules/react-router/')
            || normalized.includes('/node_modules/react-router-dom/')
            || normalized.includes('/src/components/RouteSkeleton.tsx')
            || normalized.includes('/src/lib/app-boot.tsx')
            || normalized.includes('/src/lib/perf.ts')
            || normalized.includes('/src/lib/route-preload.ts')
            || normalized.includes('/src/lib/xp.ts')
          ) {
            return 'app-shell';
          }

          if (
            normalized.includes('/node_modules/dexie/')
            || normalized.includes('/node_modules/dexie-react-hooks/')
            || normalized.includes('/src/lib/db.ts')
            || normalized.includes('/src/lib/seed.ts')
            || normalized.includes('/src/hooks/useHomeSummary.ts')
          ) {
            return 'storage';
          }

          if (
            normalized.includes('/src/lib/manifest-factories.ts')
            || normalized.includes('/src/lib/seed-data.ts')
          ) {
            return 'draft-factories';
          }

          if (
            normalized.includes('/src/pages/BuildPage.tsx')
            || normalized.includes('/src/components/ControlPanel.tsx')
            || normalized.includes('/src/components/HudOverlay.tsx')
            || normalized.includes('/src/components/StarterOverlay.tsx')
            || normalized.includes('/src/components/InspectorPanel.tsx')
            || normalized.includes('/src/components/PartPalette.tsx')
            || normalized.includes('/src/lib/editor.ts')
            || normalized.includes('/src/lib/jobs.ts')
            || normalized.includes('/src/lib/play-state.ts')
            || normalized.includes('/src/lib/sfx.ts')
            || normalized.includes('/src/lib/simulation.ts')
            || normalized.includes('/src/lib/blueprints.ts')
          ) {
            return 'builder-core';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
