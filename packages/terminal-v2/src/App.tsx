import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import './App.css'

function App() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const websocket = useRef<WebSocket | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const session = urlParams.get('session') || `session-${Date.now()}`
    const cwd = urlParams.get('cwd') || '/Users/robby'
    const shell = urlParams.get('shell') || (navigator.platform.includes('Win') ? 'cmd.exe' : '/bin/zsh')
    
    
    setSessionId(session)

    if (!urlParams.get('session')) {
      urlParams.set('session', session)
      urlParams.set('cwd', cwd)
      urlParams.set('shell', shell)
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`
      window.history.replaceState({}, '', newUrl)
    }

    if (terminalRef.current) {
      terminal.current = new Terminal({
        cursorBlink: true,
        theme: {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff'
        },
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
      })

      fitAddon.current = new FitAddon()
      terminal.current.loadAddon(fitAddon.current)
      terminal.current.loadAddon(new WebLinksAddon())

      terminal.current.open(terminalRef.current)
      
      // Multiple fit attempts to ensure proper sizing
      const performFit = () => {
        if (fitAddon.current && terminal.current) {
          fitAddon.current.fit()
          // Send resize to websocket after fitting
          const { rows, cols } = terminal.current
          if (websocket.current?.readyState === WebSocket.OPEN) {
            websocket.current.send(JSON.stringify({ type: 'resize', rows, cols }))
          }
        }
      }
      
      // Progressive fit attempts with increasing delays
      setTimeout(performFit, 100)
      setTimeout(performFit, 300)
      setTimeout(performFit, 500)

      terminal.current.onData((data) => {
        if (websocket.current?.readyState === WebSocket.OPEN) {
          websocket.current.send(JSON.stringify({ type: 'input', data }))
        }
      })
    }

    const wsUrl = `ws://localhost:40002?session=${encodeURIComponent(session)}&cwd=${encodeURIComponent(cwd)}&shell=${encodeURIComponent(shell)}`
    
    const connectWebSocket = () => {
      websocket.current = new WebSocket(wsUrl)

      websocket.current.onopen = () => {
        setIsConnected(true)
        // Force a fit when WebSocket connects and signal ready for buffer
        setTimeout(() => {
          if (fitAddon.current && terminal.current) {
            fitAddon.current.fit()
            const { rows, cols } = terminal.current
            websocket.current?.send(JSON.stringify({ type: 'resize', rows, cols }))
            
            // Signal that terminal is ready and send current size
            websocket.current?.send(JSON.stringify({ type: 'terminal-ready' }))
            websocket.current?.send(JSON.stringify({ 
              type: 'resize', 
              rows: terminal.current.rows, 
              cols: terminal.current.cols 
            }))
          }
        }, 300) // Increased delay for iframe rendering
      }

      websocket.current.onclose = () => {
        setIsConnected(false)
      }

      websocket.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          // Removed verbose logging for performance
          
          if (terminal.current) {
            if (message.type === 'output') {
              // Ensure terminal is ready before writing
              if (terminal.current._core) {
                terminal.current.write(message.data)
              } else {
                // Terminal not fully ready, wait a bit
                setTimeout(() => {
                  if (terminal.current) {
                    terminal.current.write(message.data)
                  }
                }, 100)
              }
            } else if (message.type === 'buffer-restore') {
              // Handle buffer restoration with automatic resize trigger
              if (terminal.current) {
                terminal.current.write(message.data)
                
                // IMMEDIATELY force the resize sequence to make buffer visible
                if (fitAddon.current && terminalRef.current) {
                  setTimeout(() => {
                    // Force multiple fit attempts to trigger proper rendering
                    fitAddon.current!.fit()
                    
                    setTimeout(() => {
                      fitAddon.current!.fit()
                      
                      // Force a window resize event to trigger the container resize
                      const resizeEvent = new Event('resize')
                      window.dispatchEvent(resizeEvent)
                      
                      setTimeout(() => {
                        fitAddon.current!.fit()
                        // Force terminal to refresh all visible lines
                        terminal.current!.refresh(0, terminal.current!.rows - 1)
                      }, 50)
                    }, 50)
                  }, 200) // Slightly longer delay for buffer to be written
                }
              }
            } else if (message.type === 'error') {
              terminal.current.write(`\r\n\x1b[31mError: ${message.data}\x1b[0m\r\n`)
            }
          }
        } catch (error) {
        }
      }

      websocket.current.onerror = (error) => {
        setIsConnected(false)
      }
    }

    setTimeout(connectWebSocket, 200)

    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        fitAddon.current.fit()
        const { rows, cols } = terminal.current
        if (websocket.current?.readyState === WebSocket.OPEN) {
          websocket.current.send(JSON.stringify({ type: 'resize', rows, cols }))
        }
      }
    }

    window.addEventListener('resize', handleResize)
    
    // Use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null
    if (terminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        // Immediate resize, no debouncing
        handleResize()
      })
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (websocket.current) {
        websocket.current.close()
      }
      if (terminal.current) {
        terminal.current.dispose()
      }
    }
  }, [])

  return (
    <div className="terminal-container">
      <div ref={terminalRef} className="terminal" />
    </div>
  )
}

export default App
