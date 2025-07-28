import { io, Socket } from "socket.io-client";
import { EventEmitter } from "events";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

export class WebSocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private tools: ToolDefinition[] = [];
  private connected = false;
  private pendingExecutions = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  constructor(private url: string = "http://localhost:8001") {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        transports: ["websocket"],
      });

      this.socket.on("connect", () => {
        this.connected = true;
        this.emit("connected");
        
        this.socket!.emit("mcp:register");
        resolve();
      });

      this.socket.on("disconnect", () => {
        console.log("[WS-Client] Disconnected from WebSocket singleton");
        this.connected = false;
        
        for (const [executionId, pending] of this.pendingExecutions.entries()) {
          pending.reject(new Error("WebSocket connection lost"));
        }
        this.pendingExecutions.clear();
        
        this.emit("disconnected");
      });

      this.socket.on("error", (error: any) => {
        reject(error);
      });

      this.socket.on("tools:update", (tools: ToolDefinition[]) => {
        this.tools = tools;
        this.emit("tools:update", tools);
      });

      this.socket.on("tool:execution:response", (data: any) => {
        const pending = this.pendingExecutions.get(data.executionId);
        if (pending) {
          this.pendingExecutions.delete(data.executionId);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error("Connection timeout"));
        }
      }, 5000);
    });
  }

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  async requestTools(): Promise<ToolDefinition[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to WebSocket server"));
        return;
      }

      this.socket.emit("mcp:list-tools");
      
      this.socket.once("mcp:tools", (tools: ToolDefinition[]) => {
        this.tools = tools;
        resolve(tools);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error("Request tools timeout"));
      }, 5000);
    });
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to WebSocket server"));
        return;
      }

      const executionId = `mcp-exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.pendingExecutions.set(executionId, { resolve, reject });

      this.socket.emit("mcp:execute-tool", {
        toolName,
        args,
        executionId,
      });

      setTimeout(() => {
        if (this.pendingExecutions.has(executionId)) {
          this.pendingExecutions.delete(executionId);
          reject(new Error(`Tool execution timeout for ${toolName}`));
        }
      }, 30000);
    });
  }

  async clearTools(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to WebSocket server"));
        return;
      }

      fetch(`${this.url}/clear-tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(response => response.json())
        .then(data => resolve(data))
        .catch(error => reject(error));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.tools = [];
  }
}