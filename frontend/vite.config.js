import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = process.env.PORT ? Number(process.env.PORT) : undefined

export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...(port ? { server: { port, strictPort: true } } : {}),
})
