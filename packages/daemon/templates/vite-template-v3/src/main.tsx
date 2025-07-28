import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

// Store CWD received from parent window
let currentCwd: string | null = null

// Listen for CWD updates from parent window
window.addEventListener('message', (event) => {
  if (event.data?.type === 'DEV_TOOLS_CWD_UPDATE') {
    currentCwd = event.data.cwd
    // Try to send to server when we receive it
    if (currentCwd) {
      sendCwdToServer()
    }
  }
})

// Send CWD data to server if available
function sendCwdToServer() {
  let cwd = currentCwd || (window as any).DEV_TOOLS_CWD
  
  if (cwd) {
    fetch('/api/update-claude-md', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd })
    }).then(response => {
      return response.json()
    }).then(data => {
    }).catch(err => {
    })
  } else {
  }
}

// Check for CWD periodically and send it when available
function checkAndSendCwd() {
  sendCwdToServer()
  // Check again in 1 second if CWD wasn't found
  if (!currentCwd && !(window as any).DEV_TOOLS_CWD) {
    setTimeout(checkAndSendCwd, 1000)
  }
}

// Also request CWD from parent window on startup
window.addEventListener('load', () => {
  // Request CWD from parent window
  try {
    window.parent?.postMessage({
      type: 'DEV_TOOLS_CWD_REQUEST'
    }, '*')
  } catch (e) {
  }
})

// Start checking for CWD after a short delay
setTimeout(checkAndSendCwd, 500)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
