import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import { createClient } from "redis";
import { z } from "zod";
import { EventEmitter } from "events";

const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()).optional(),
});

type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

interface ToolStatus {
  definition: ToolDefinition;
  projectId: string;
  online: boolean;
  lastSeen: number;
  isDisabled?: boolean;
}

// Tool execution schemas
const ToolExecutionRequestSchema = z.object({
  toolName: z.string(),
  args: z.record(z.any()),
  executionId: z.string(),
});

const ToolExecutionResponseSchema = z.object({
  executionId: z.string(),
  result: z.any(),
  error: z.string().optional(),
});

interface WSManagerConfig {
  port?: number;
  redisUrl?: string;
  silent?: boolean;
}

class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager | null = null;
  private io: SocketIOServer;
  private httpServer: ReturnType<typeof createServer>;
  private redis: ReturnType<typeof createClient>;
  private projectConnections = new Map<string, any>();
  private mcpConnections = new Set<any>();
  private toolRegistry = new Map<string, ToolStatus>();
  private pendingExecutions = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private initialized = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 2000;
  private readonly HEARTBEAT_TIMEOUT = 30000;
  private serverStarted = false;

  private constructor(config: WSManagerConfig = {}) {
    super();

    this.redis = createClient({
      url: config.redisUrl || process.env.REDIS_URL || "redis://localhost:6379",
    });

    this.httpServer = createServer(async (req, res) => {
      // Enable CORS for all endpoints
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === "GET" && req.url === "/debug") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(this.getDebugInfo(), null, 2));
        return;
      }

      if (req.method === "GET" && req.url === "/tools") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        const tools = this.getTools();
        const toolsWithStatus = tools.map((tool) => {
          const status = this.toolRegistry.get(tool.name);
          return {
            ...tool,
            online: status?.online || false,
            projectId: status?.projectId || "unknown",
            lastSeen: status?.lastSeen
              ? new Date(status.lastSeen).toISOString()
              : null,
            isDisabled: status?.isDisabled || false,
          };
        });
        res.end(JSON.stringify({ tools: toolsWithStatus }, null, 2));
        return;
      }

      if (req.method === "GET" && req.url === "/all-tools") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        const allTools = [];
        for (const [toolName, status] of this.toolRegistry.entries()) {
          allTools.push({
            ...status.definition,
            online: status.online,
            projectId: status.projectId,
            lastSeen: status.lastSeen
              ? new Date(status.lastSeen).toISOString()
              : null,
            isDisabled: status.isDisabled || false,
          });
        }

        const mightyMoonTools = allTools.filter(
          (t) => t.projectId === "mighty-moon-285"
        );
        if (mightyMoonTools.length > 0) {
          console.log(
            `[MCP PANEL ISSUE] /all-tools returning ${mightyMoonTools.length} mighty-moon-285 tools:`,
            mightyMoonTools.map((t) => ({ name: t.name, online: t.online }))
          );
        }

        res.end(JSON.stringify({ tools: allTools }, null, 2));
        return;
      }

      if (req.method === "POST" && req.url === "/toggle-tool") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const parsedBody = JSON.parse(body);
            const { toolName, isDisabled } = parsedBody;

            if (!toolName || typeof toolName !== "string") {
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: "toolName is required and must be a string",
                })
              );
              return;
            }

            const toolStatus = this.toolRegistry.get(toolName);
            if (!toolStatus) {
              res.writeHead(404, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: `Tool ${toolName} not found`,
                })
              );
              return;
            }

            toolStatus.isDisabled = isDisabled;

            await this.redis.set(
              `tool:${toolName}`,
              JSON.stringify(toolStatus),
              { EX: 86400 * 7 }
            );

            this.notifyMCPServers();

            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(
              JSON.stringify({
                success: true,
                tool: {
                  name: toolName,
                  isDisabled: isDisabled,
                },
              })
            );
          } catch (error) {
            res.writeHead(500, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
              })
            );
          }
        });
        return;
      }

      if (req.method === "POST" && req.url === "/execute-tool") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            console.error(
              "[WS] Execute tool request received, body length:",
              body.length
            );

            let parsedBody;
            try {
              parsedBody = JSON.parse(body);
              console.error("[WS] Parsed body:", parsedBody);
            } catch (parseError) {
              console.error("[WS] JSON parse error:", parseError);
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: "Invalid JSON in request body",
                })
              );
              return;
            }

            const { toolName, args } = parsedBody;
            console.error(
              "[WS] Tool execution request for:",
              toolName,
              "with args:",
              args
            );

            if (!toolName || typeof toolName !== "string") {
              console.error("[WS] Invalid toolName:", toolName);
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: "toolName is required and must be a string",
                })
              );
              return;
            }

            const toolStatus = this.toolRegistry.get(toolName);
            console.error(
              "[WS] Tool status:",
              toolStatus
                ? {
                    online: toolStatus.online,
                    projectId: toolStatus.projectId,
                    lastSeen: new Date(toolStatus.lastSeen).toISOString(),
                  }
                : "NOT_FOUND"
            );

            if (!toolStatus) {
              console.error(
                "[WS] Tool not found in registry. Available tools:",
                Array.from(this.toolRegistry.keys())
              );
              res.writeHead(404, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: `Tool ${toolName} not found in registry. Available tools: ${Array.from(
                    this.toolRegistry.keys()
                  ).join(", ")}`,
                })
              );
              return;
            }

            if (!toolStatus.online) {
              console.error("[WS] Tool is offline:", toolName);
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: `Tool ${toolName} is offline. Last seen: ${new Date(
                    toolStatus.lastSeen
                  ).toISOString()}`,
                })
              );
              return;
            }

            const targetSocket = this.projectConnections.get(
              toolStatus.projectId
            );
            console.error(
              "[WS] Target socket for project",
              toolStatus.projectId,
              ":",
              targetSocket ? "CONNECTED" : "NOT_FOUND"
            );
            console.error(
              "[WS] Active project connections:",
              Array.from(this.projectConnections.keys())
            );

            if (!targetSocket) {
              console.error("[WS] No active connection for project");
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error: `No active connection for project ${
                    toolStatus.projectId
                  }. Active projects: ${Array.from(
                    this.projectConnections.keys()
                  ).join(", ")}`,
                })
              );
              return;
            }

            try {
              console.error("[WS] Executing tool via WebSocket...");
              const result = await this.executeTool(toolName, args || {});
              console.error("[WS] Tool execution successful, result:", result);
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ result }));
            } catch (executionError) {
              console.error("[WS] Tool execution failed:", executionError);
              res.writeHead(500, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(
                JSON.stringify({
                  error:
                    executionError instanceof Error
                      ? executionError.message
                      : "Tool execution failed",
                })
              );
            }
          } catch (error) {
            console.error(
              "[WS] Unexpected error in execute-tool handler:",
              error
            );
            res.writeHead(500, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
              })
            );
          }
        });
        return;
      }

      // Handle clear tools endpoint
      if (req.method === "POST" && req.url === "/clear-tools") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });

        try {
          const result = await this.clearTools();
          res.end(JSON.stringify(result));
        } catch (error) {
          res.end(
            JSON.stringify({
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to clear tools",
            })
          );
        }
        return;
      }

      if (req.method === "POST" && req.url === "/delete-tool") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const { toolName } = JSON.parse(body);

            if (!toolName) {
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ error: "Tool name is required" }));
              return;
            }

            // Delete the tool from registry
            const result = await this.deleteTool(toolName);

            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
              })
            );
          }
        });
        return;
      }

      res.writeHead(404, {
        "Access-Control-Allow-Origin": "*",
      });
      res.end();
    });
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupSocketHandlers();
  }

  static getInstance(config?: WSManagerConfig): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager(config);
    }
    return WebSocketManager.instance;
  }

  static resetInstance(): void {
    WebSocketManager.instance = null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (!this.redis.isReady) {
        await this.redis.connect();
      }

      await this.loadToolsFromRedis();

      if (process.env.START_WS_SINGLETON === "true" && !this.serverStarted) {
        const port = process.env.WS_PORT || 8001;
        await new Promise<void>((resolve, reject) => {
          this.httpServer
            .listen(port)
            .on("listening", () => {
              // WebSocket server listening
              this.serverStarted = true;
              resolve();
            })
            .on("error", (err: any) => {
              if (err.code === "EADDRINUSE") {
                this.serverStarted = true;
                resolve();
              } else {
                reject(err);
              }
            });
        });
      }

      if (!this.heartbeatInterval) {
        this.startHeartbeat();
      }

      this.initialized = true;
    } catch (error) {
      throw error;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [toolName, status] of this.toolRegistry.entries()) {
        if (status.online && now - status.lastSeen > this.HEARTBEAT_TIMEOUT) {
          status.online = false;
          this.emit("tool:offline", toolName);
          this.notifyMCPServers();
        }
      }

      for (const [projectId, socket] of this.projectConnections.entries()) {
        socket.emit("ping", { timestamp: now });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private async loadToolsFromRedis() {
    try {
      const keys = await this.redis.keys("tool:*");

      for (const key of keys) {
        const toolData = await this.redis.get(key);
        if (toolData) {
          try {
            const tool = JSON.parse(toolData) as ToolStatus;
            tool.online = false;
            if (tool.isDisabled === undefined) {
              tool.isDisabled = false;
            }
            this.toolRegistry.set(tool.definition.name, tool);
          } catch (e) {}
        }
      }
    } catch (error) {}
  }

  private setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      socket.on("mcp:register", () => {
        this.mcpConnections.add(socket);
        socket.emit("mcp:tools", this.getTools());

        socket.on("disconnect", () => {
          this.mcpConnections.delete(socket);
        });
      });

      socket.on("mcp:list-tools", () => {
        socket.emit("mcp:tools", this.getTools());
      });

      socket.on("mcp:execute-tool", async (data) => {
        const { toolName, args, executionId } = data;
        console.log(
          `[WS] MCP tool execution request - tool: ${toolName}, executionId: ${executionId}`
        );

        const mcpExecutionId = executionId;
        const mcpSocket = socket;

        try {
          const result = await this.executeTool(toolName, args);
          console.log(
            `[WS] MCP tool execution successful - executionId: ${mcpExecutionId}`
          );

          mcpSocket.emit("tool:execution:response", {
            executionId: mcpExecutionId,
            result,
          });
        } catch (error) {
          console.error(
            `[WS] MCP tool execution failed - executionId: ${mcpExecutionId}`,
            error
          );

          mcpSocket.emit("tool:execution:response", {
            executionId: mcpExecutionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      socket.on("project:register", async (data) => {
        const { projectId } = data;
        this.projectConnections.set(projectId, socket);

        socket.emit("ping", { timestamp: Date.now() });

        try {
          const keys = await this.redis.keys("tool:*");
          for (const key of keys) {
            const toolName = key.replace("tool:", "");
            if (!this.toolRegistry.has(toolName)) {
              const toolData = await this.redis.get(key);
              if (toolData) {
                try {
                  const tool = JSON.parse(toolData) as ToolStatus;
                  if (tool.projectId === projectId) {
                    tool.online = false;
                    this.toolRegistry.set(toolName, tool);
                  }
                } catch (e) {}
              }
            }
          }
        } catch (error) {}

        const projectTools: string[] = [];
        for (const [toolName, status] of this.toolRegistry.entries()) {
          if (status.projectId === projectId) {
            projectTools.push(toolName);
          }
        }

        socket.emit("project:tools", { tools: projectTools });

        const now = Date.now();
        const onlineTools = [];
        for (const [toolName, status] of this.toolRegistry.entries()) {
          if (status.projectId === projectId) {
            status.lastSeen = now;
            if (!status.online) {
              status.online = true;
              onlineTools.push(toolName);
              this.emit("tool:online", toolName);
            }
          }
        }

        if (onlineTools.length > 0) {
          console.log(
            `[MCP PANEL ISSUE] Project ${projectId} connected, marking ${onlineTools.length} tools as online:`,
            onlineTools
          );
          this.notifyMCPServers();
        }

        socket.on("disconnect", () => {
          console.log(`[MCP PANEL ISSUE] Project disconnected: ${projectId}`);
          this.projectConnections.delete(projectId);
          setTimeout(() => {
            if (!this.projectConnections.has(projectId)) {
              const offlineTools = [];
              for (const [toolName, status] of this.toolRegistry.entries()) {
                if (status.projectId === projectId && status.online) {
                  status.online = false;
                  offlineTools.push(toolName);
                  this.emit("tool:offline", toolName);
                }
              }

              if (offlineTools.length > 0) {
                console.log(
                  `[MCP PANEL ISSUE] Marked ${offlineTools.length} tools as offline after grace period:`,
                  offlineTools
                );
                this.notifyMCPServers();
              }
            } else {
              console.log(
                `[MCP PANEL ISSUE] Project ${projectId} reconnected during grace period`
              );
            }
          }, 5000);
        });
      });

      socket.on("pong", async (data) => {
        const { toolNames, projectId } = data;
        if (toolNames && Array.isArray(toolNames)) {
          const now = Date.now();
          for (const toolName of toolNames) {
            const status = this.toolRegistry.get(toolName);
            if (status && status.projectId === projectId) {
              status.lastSeen = now;
              if (!status.online) {
                status.online = true;
                this.emit("tool:online", toolName);
                this.notifyMCPServers();
              }
            }
          }
        }
      });

      socket.on("tool:register", async (data) => {
        try {
          const { projectId, tool } = data;
          const validatedTool = ToolDefinitionSchema.parse(tool);

          if (validatedTool.inputSchema) {
            if (!validatedTool.inputSchema.type) {
              validatedTool.inputSchema.type = "object";
            }
            if (!validatedTool.inputSchema.properties) {
              validatedTool.inputSchema.properties = {};
            }
          }

          const toolStatus: ToolStatus = {
            definition: validatedTool,
            projectId,
            online: true,
            lastSeen: Date.now(),
            isDisabled: false,
          };

          const existingTool = this.toolRegistry.get(validatedTool.name);
          if (existingTool && existingTool.projectId !== projectId) {
            throw new Error(
              `Tool ${validatedTool.name} is already registered by another project`
            );
          }

          this.toolRegistry.set(validatedTool.name, toolStatus);

          await this.redis.set(
            `tool:${validatedTool.name}`,
            JSON.stringify(toolStatus),
            { EX: 86400 * 7 }
          );

          console.log(
            `[MCP PANEL ISSUE] Tool registered: ${validatedTool.name}, online: ${toolStatus.online}, projectId: ${projectId}`
          );
          socket.emit("tool:registered", {
            name: validatedTool.name,
            success: true,
          });

          this.emit("tool:registered", validatedTool);
          this.notifyMCPServers();
        } catch (error) {
          socket.emit("tool:registered", {
            success: false,
            error: String(error),
          });
        }
      });

      socket.on("tool:execution:response", async (data) => {
        try {
          console.error("[WS] Received tool:execution:response:", data);
          const response = ToolExecutionResponseSchema.parse(data);

          const pending = this.pendingExecutions.get(response.executionId);
          console.error(
            "[WS] Found pending execution:",
            pending ? "YES" : "NO",
            "for executionId:",
            response.executionId
          );

          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingExecutions.delete(response.executionId);
            console.error(
              "[WS] Cleared pending execution, remaining:",
              this.pendingExecutions.size
            );

            if (response.error) {
              console.error("[WS] Tool execution error:", response.error);
              pending.reject(new Error(response.error));
            } else {
              console.error("[WS] Tool execution success:", response.result);
              pending.resolve(response.result);
            }
          } else {
            console.error(
              "[WS] No pending execution found for:",
              response.executionId
            );
          }
        } catch (error) {
          console.error("[WS] Error handling execution response:", error);
        }
      });

      socket.on("tool:unregister", async (data) => {
        const { projectId, toolName } = data;

        const toolStatus = this.toolRegistry.get(toolName);
        if (toolStatus && toolStatus.projectId === projectId) {
          this.toolRegistry.delete(toolName);
          await this.redis.del(`tool:${toolName}`);

          socket.emit("tool:unregistered", { name: toolName, success: true });

          this.emit("tool:unregistered", toolName);
          this.notifyMCPServers();
        } else {
          socket.emit("tool:unregistered", {
            name: toolName,
            success: false,
            error: "Tool not found or not owned by this project",
          });
        }
      });
    });
  }

  getTools(): ToolDefinition[] {
    const availableTools: ToolDefinition[] = [];
    for (const [_, status] of this.toolRegistry.entries()) {
      if (status.online && !status.isDisabled) {
        availableTools.push(status.definition);
      }
    }
    return availableTools;
  }

  getDebugInfo() {
    return {
      toolRegistry: Array.from(this.toolRegistry.entries()).map(
        ([name, status]) => ({
          name,
          projectId: status.projectId,
          online: status.online,
          lastSeen: new Date(status.lastSeen).toISOString(),
          isDisabled: status.isDisabled || false,
        })
      ),
      projectConnections: Array.from(this.projectConnections.keys()),
      pendingExecutions: this.pendingExecutions.size,
    };
  }

  private notifyMCPServers() {
    const tools = this.getTools();
    for (const mcpSocket of this.mcpConnections) {
      mcpSocket.emit("tools:update", tools);
    }
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    console.error("[WS] executeTool called for:", toolName);

    const toolStatus = this.toolRegistry.get(toolName);
    if (!toolStatus) {
      console.error("[WS] Tool not found in executeTool:", toolName);
      throw new Error(`Tool ${toolName} not found`);
    }

    if (!toolStatus.online) {
      console.error("[WS] Tool is offline in executeTool:", toolName);
      throw new Error(`Tool ${toolName} is offline`);
    }

    if (toolStatus.isDisabled) {
      console.error("[WS] Tool is disabled in executeTool:", toolName);
      throw new Error(`Tool ${toolName} is disabled`);
    }

    const targetSocket = this.projectConnections.get(toolStatus.projectId);
    if (!targetSocket) {
      console.error(
        "[WS] No target socket in executeTool for project:",
        toolStatus.projectId
      );
      throw new Error(`No active connection for tool ${toolName}`);
    }

    const executionId = `exec-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    console.error("[WS] Created execution ID:", executionId);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(
          "[WS] Tool execution timeout for:",
          toolName,
          "executionId:",
          executionId
        );
        this.pendingExecutions.delete(executionId);
        reject(new Error(`Tool execution timeout for ${toolName}`));
      }, 30000);

      this.pendingExecutions.set(executionId, { resolve, reject, timeout });
      console.error(
        "[WS] Added to pending executions, total pending:",
        this.pendingExecutions.size
      );

      const executionData = {
        toolName,
        args: args || {},
        executionId,
      };

      console.error(
        "[WS] Emitting tool:execute to target socket with data:",
        executionData
      );
      targetSocket.emit("tool:execute", executionData);
    });
  }

  async clearTools(): Promise<{ success: boolean; message: string }> {
    const toolCount = this.toolRegistry.size;

    this.toolRegistry.clear();

    try {
      const keys = await this.redis.keys("tool:*");
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {}

    for (const [_, socket] of this.projectConnections.entries()) {
      socket.emit("tools:cleared");
    }

    this.notifyMCPServers();

    return {
      success: true,
      message: `Cleared ${toolCount} tools from memory and Redis`,
    };
  }

  async deleteTool(
    toolName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existed = this.toolRegistry.has(toolName);
      if (existed) {
        this.toolRegistry.delete(toolName);
      }

      try {
        await this.redis.del(`tool:${toolName}`);
      } catch (error) {
        console.error("Failed to delete tool from Redis:", error);
      }

      const tool = this.toolRegistry.get(toolName);
      if (tool && tool.projectId) {
        const socket = this.projectConnections.get(tool.projectId);
        if (socket) {
          socket.emit("tool:deleted", { toolName });
        }
      }

      this.notifyMCPServers();

      return {
        success: true,
        message: existed
          ? `Tool ${toolName} deleted successfully`
          : `Tool ${toolName} not found`,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete tool",
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [id, pending] of this.pendingExecutions.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("WebSocket manager shutting down"));
    }
    this.pendingExecutions.clear();

    this.io.close();
    if (this.serverStarted) {
      this.httpServer.close();
      this.serverStarted = false;
    }

    if (this.redis.isReady) {
      await this.redis.quit();
    }

    WebSocketManager.instance = null;
    this.initialized = false;
  }
}

export function getWebSocketManager(
  config?: WSManagerConfig
): WebSocketManager {
  return WebSocketManager.getInstance(config);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.START_WS_SINGLETON = "true";

  const manager = getWebSocketManager();

  manager.initialize().catch((error) => {
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    await manager.shutdown();
    process.exit(0);
  });
}
