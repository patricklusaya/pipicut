import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'

const ffmpegDir = fileURLToPath(new URL('./node_modules/@ffmpeg/core/dist/esm/', import.meta.url))
const ffmpegJs = path.join(ffmpegDir, 'ffmpeg-core.js')
const ffmpegWasm = path.join(ffmpegDir, 'ffmpeg-core.wasm')

function ffmpegCore(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req: Connect.IncomingMessage, res, next) => {
      const url = req.url?.split('?')[0]
      if (url === '/ffmpeg/ffmpeg-core.js') {
        res.setHeader('Content-Type', 'text/javascript')
        fs.createReadStream(ffmpegJs).pipe(res)
        return
      }
      if (url === '/ffmpeg/ffmpeg-core.wasm') {
        res.setHeader('Content-Type', 'application/wasm')
        fs.createReadStream(ffmpegWasm).pipe(res)
        return
      }
      next()
    })
  }

  return {
    name: 'ffmpeg-core',
    configureServer: attach,
    configurePreviewServer: attach,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'ffmpeg/ffmpeg-core.js',
        source: fs.readFileSync(ffmpegJs),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'ffmpeg/ffmpeg-core.wasm',
        source: fs.readFileSync(ffmpegWasm),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ffmpegCore()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
