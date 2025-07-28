import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import { join } from 'path'

let terminalServer: any = null

const terminalServerPlugin = () => ({
  name: 'terminal-server',
  configureServer() {
    if (!terminalServer) {
      console.log('Starting terminal WebSocket server...')
      const serverPath = join(process.cwd(), 'websocket-server.js')
      terminalServer = spawn('node', [serverPath], {
        stdio: ['ignore', 'inherit', 'inherit'],
        cwd: process.cwd()
      })
      
      terminalServer.on('error', (error: any) => {
        console.error('Failed to start WebSocket server:', error)
      })
      
      terminalServer.on('exit', (code: any) => {
        if (code !== 0) {
          console.error(`WebSocket server exited with code ${code}`)
        }
      })
    }
  },
  buildEnd() {
    if (terminalServer) {
      console.log('Stopping WebSocket server...')
      terminalServer.kill()
      terminalServer = null
    }
  }
})

export default defineConfig({
  plugins: [react(), terminalServerPlugin()],
  server: {
    port: 4262,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
