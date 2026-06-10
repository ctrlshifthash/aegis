import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  // NOTE: We intentionally do NOT set Cross-Origin-Opener-Policy: same-origin /
  // Cross-Origin-Embedder-Policy: require-corp. Those enable SharedArrayBuffer
  // (multi-threaded snarkjs proving) but break wallet SDK popups (Coinbase, Base
  // smart wallets) and cross-origin wallet iframes. snarkjs proving works
  // single-threaded, so wallet compatibility wins.
  optimizeDeps: {
    exclude: ['snarkjs'],
  },
})
