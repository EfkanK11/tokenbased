import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Honor a PORT env var (set by the Claude preview runner) so the dev server
// binds to the exact assigned port instead of auto-incrementing past it.
const port = process.env.PORT ? Number(process.env.PORT) : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...(port ? { server: { port, strictPort: true } } : {}),
})
