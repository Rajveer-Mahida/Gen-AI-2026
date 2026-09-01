import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'

const REALTIME_MODEL = 'gpt-realtime-2.1'
const envDir = fileURLToPath(new URL('.', import.meta.url))

function openaiRealtimePlugin(): Plugin {
  const handle: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/realtime-session')) {
      next()
      return
    }

    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }

    const env = loadEnv('development', envDir, '')
    const apiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY

    if (!apiKey) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error:
            'OPENAI_API_KEY is missing. Use a file named .env.local (with the leading dot) in the Voice Agent folder, then restart pnpm dev.',
        }),
      )
      return
    }

    try {
      const openaiResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: REALTIME_MODEL,
          },
        }),
      })

      const payload = await openaiResponse.text()
      res.statusCode = openaiResponse.status
      res.setHeader('Content-Type', 'application/json')
      res.end(payload)
    } catch {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Failed to mint an OpenAI realtime client secret' }))
    }
  }

  return {
    name: 'openai-realtime-session',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig({
  envDir,
  plugins: [react(), openaiRealtimePlugin()],
})
