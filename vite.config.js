import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo-name>/, so the asset base
// must match. Override with VITE_BASE_PATH (e.g. "/") for a custom domain.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/fantasy-parlay-tracker/',
})
