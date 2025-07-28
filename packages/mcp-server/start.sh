#!/bin/bash

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "Starting Redis server..."
    redis-server --daemonize yes
    sleep 2
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build TypeScript
echo "Building MCP server..."
npm run build

# Start the MCP server
echo "Starting MCP server..."
echo "WebSocket server will run on port 8001"
echo "MCP server will use stdio for communication"
npm start