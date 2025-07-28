#!/usr/bin/env node

import { spawn } from "node-pty";
import { WebSocketServer } from "ws";

const sessions = new Map();

console.log("Starting terminal WebSocket server on port 40002...");

const wss = new WebSocketServer({
  port: 40002,
  perMessageDeflate: false,
});

console.log("Terminal WebSocket server running on port 40002");

wss.on("connection", (ws, req) => {
  console.log("Terminal client connected");

  try {
    const url = new URL(req.url, "http://localhost");
    const sessionId =
      url.searchParams.get("session") || `session-${Date.now()}`;
    let cwd = url.searchParams.get("cwd") || process.cwd();

    // Resolve ~ to home directory
    if (cwd === "~") {
      cwd = process.env.HOME || process.env.USERPROFILE || process.cwd();
    }

    const shell =
      url.searchParams.get("shell") ||
      (process.platform === "win32" ? "cmd.exe" : "/bin/zsh");

    console.log(`🔍 Session: ${sessionId}, CWD: ${cwd}, Shell: ${shell}`);
    console.log(
      `📊 Active sessions: ${Array.from(sessions.keys()).join(", ")}`
    );
    console.log(
      `🎯 Requested session exists in memory: ${sessions.has(sessionId)}`
    );

    let session = sessions.get(sessionId);
    if (!session) {
      console.log(
        `Creating new PTY session: ${sessionId} in directory: ${cwd}`
      );

      const createPty = () =>
        spawn(shell, [], {
          name: "xterm-color",
          cols: 80,
          rows: 24,
          cwd: cwd,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          },
        });

      let pty;
      let attempts = 0;
      const maxAttempts = 3;
      while (!pty && attempts < maxAttempts) {
        try {
          pty = createPty();
        } catch (error) {
          attempts++;
          console.error(
            `PTY spawn attempt ${attempts} failed: ${error.message}`
          );
          if (attempts < maxAttempts) {
            // Fallback to home dir on failure
            cwd = process.env.HOME || "/Users/robby";
            console.log(`Retrying with fallback CWD: ${cwd}`);
          }
        }
      }

      if (!pty) {
        throw new Error("Failed to create PTY after retries");
      }

      console.log(`PTY spawned with pid: ${pty.pid}`);

      // Buffer for output (last 1000 lines for reconnection)
      const outputBuffer = [];
      const maxBufferLines = 1000;

      pty.onData((data) => {
        const currentSession = sessions.get(sessionId);
        if (currentSession?.ws?.readyState === 1) {
          currentSession.ws.send(JSON.stringify({ type: "output", data }));
        }
        // Add to buffer
        outputBuffer.push(data);
        if (outputBuffer.length > maxBufferLines) {
          outputBuffer.shift();
        }
      });

      pty.onExit(({ exitCode }) => {
        console.log(`Session ${sessionId} exited with code ${exitCode}`);
        sessions.delete(sessionId);
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "error",
              data: `Session exited with code ${exitCode}`,
            })
          );
        }
      });

      session = { pty, ws, outputBuffer };
      sessions.set(sessionId, session);

      // ws.send(
      //   JSON.stringify({
      //     type: "output",
      //     data: `\r\n\x1b[32m✓ Created new session: ${sessionId}\x1b[0m\r\n`,
      //   })
      // );
    } else {
      console.log(`Reconnecting to existing PTY session: ${sessionId}`);
      session.ws = ws;

      // Send buffered output on reconnect
      if (session.outputBuffer.length > 0) {
        // ws.send(
        //   JSON.stringify({
        //     type: "output",
        //     data: `\r\n\x1b[33m↻ Reconnected to session: ${sessionId}\x1b[0m\r\n`,
        //   })
        // );
        session.outputBuffer.forEach((data) => {
          ws.send(JSON.stringify({ type: "output", data }));
        });
      }
    }

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        const currentSession = sessions.get(sessionId);

        if (msg.type === "input" && currentSession?.pty) {
          currentSession.pty.write(msg.data);
        } else if (msg.type === "resize" && currentSession?.pty) {
          console.log(`🔄 Resizing PTY: ${msg.cols}x${msg.rows}`);
          currentSession.pty.resize(msg.cols, msg.rows);
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log(`Terminal client disconnected from session: ${sessionId}`);
      const currentSession = sessions.get(sessionId);
      if (currentSession?.ws === ws) {
        currentSession.ws = null;
      }
    });
  } catch (error) {
    console.error("Error setting up terminal session:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        data: `Failed to create terminal: ${error.message}`,
      })
    );
  }
});

wss.on("error", (error) => {
  console.error("WebSocket server error:", error);
});

process.on("SIGINT", () => {
  console.log("\nShutting down terminal server...");
  sessions.forEach((session, sessionId) => {
    if (session.pty) {
      console.log(`Closing session: ${sessionId}`);
      session.pty.kill();
    }
  });
  wss.close(() => {
    console.log("WebSocket server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\nTerminating terminal server...");
  sessions.forEach((session) => {
    if (session.pty) session.pty.kill();
  });
  process.exit(0);
});
