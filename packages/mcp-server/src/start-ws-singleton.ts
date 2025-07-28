#!/usr/bin/env node
import { getWebSocketManager } from "./ws-singleton.js";

process.env.START_WS_SINGLETON = "true";

console.log("Starting WebSocket Singleton Server...");

const manager = getWebSocketManager();

async function start() {
  try {
    await manager.initialize();
    console.log("WebSocket Singleton Server is running");
    console.log("Press Ctrl+C to stop");
  } catch (error) {
    console.error("Failed to start WebSocket singleton:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("\nShutting down WebSocket Singleton Server...");
  await manager.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down WebSocket Singleton Server...");
  await manager.shutdown();
  process.exit(0);
});

start();
