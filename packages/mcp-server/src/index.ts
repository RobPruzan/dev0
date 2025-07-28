import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";
import { WebSocketClient } from "./ws-client.js";

const wsClient = new WebSocketClient();

const mcpServer = new Server(
  {
    name: "dev-0-dynamic-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  let tools = await wsClient.requestTools();

  if (tools.length === 0) {
    console.log("[MCP] No tools available, implementing retry logic...");
    const maxRetries = 5;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries && tools.length === 0; i++) {
      console.log(`[MCP] Retry ${i + 1}/${maxRetries} for tool listing...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      tools = await wsClient.requestTools();
    }

    if (tools.length === 0) {
      console.log("[MCP] No tools found after retries");
    } else {
      console.log(`[MCP] Found ${tools.length} tools after retrying`);
    }
  }

  const builtInTools = [
    {
      name: "clear_all_tools",
      description:
        "Clear all registered tools from the WebSocket server. This will remove all tools from memory and Redis.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];

  const allTools = [
    ...builtInTools,
    ...tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
        ? {
            type: "object",
            ...tool.inputSchema,
            properties: tool.inputSchema.properties || {},
          }
        : {
            type: "object",
            properties: {},
          },
    })),
  ];

  return { tools: allTools };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "clear_all_tools") {
    try {
      const result = await wsClient.clearTools();
      const textContent: TextContent = {
        type: "text",
        text: JSON.stringify(result),
      };

      const toolResult: CallToolResult = {
        content: [textContent],
      };

      return toolResult;
    } catch (error) {
      throw new Error(
        `Failed to clear tools: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  try {
    const result = await wsClient.executeTool(name, args);

    const resultText = JSON.stringify(result);
    const textContent: TextContent = {
      type: "text",
      text: resultText,
    };

    const toolResult: CallToolResult = {
      content: [textContent],
    };

    return toolResult;
  } catch (error) {
    throw error;
  }
});

const mcpHttpServer = createServer();

mcpHttpServer.setMaxListeners(50);

mcpHttpServer.on("request", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, mcp-protocol-version, mcp-session-id"
  );
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/clear-tools") {
    try {
      const result = {
        success: true,
        message: "Clear tools not available via client",
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to clear tools" }));
      return;
    }
  }

  try {
    const requestServer = new Server(
      {
        name: "dev-0-dynamic-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      }
    );

    requestServer.setRequestHandler(ListToolsRequestSchema, async () => {
      let tools = await wsClient.requestTools();

      if (tools.length === 0) {
        const maxRetries = 5;
        const retryDelay = 1000;

        for (let i = 0; i < maxRetries && tools.length === 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          tools = await wsClient.requestTools();
        }
      }

      const builtInTools = [
        {
          name: "clear_all_tools",
          description:
            "Clear all registered tools from the WebSocket server. This will remove all tools from memory and Redis.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ];

      const allTools = [
        ...builtInTools,
        ...tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
            ? {
                type: "object",
                ...tool.inputSchema,
                properties: tool.inputSchema.properties || {},
              }
            : {
                type: "object",
                properties: {},
              },
        })),
      ];

      return { tools: allTools };
    });

    requestServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Handle built-in tools
      if (name === "clear_all_tools") {
        try {
          const result = await wsClient.clearTools();
          const textContent: TextContent = {
            type: "text",
            text: JSON.stringify(result),
          };

          const toolResult: CallToolResult = {
            content: [textContent],
          };

          return toolResult;
        } catch (error) {
          throw new Error(
            `Failed to clear tools: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      try {
        const result = await wsClient.executeTool(name, args);

        // Format result as MCP CallToolResult
        const resultText = JSON.stringify(result);
        const textContent: TextContent = {
          type: "text",
          text: resultText,
        };

        const toolResult: CallToolResult = {
          content: [textContent],
        };

        return toolResult;
      } catch (error) {
        throw error;
      }
    });

    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      httpTransport.close();
      requestServer.close();
    });

    await requestServer.connect(httpTransport);

    let body = "";
    if (req.method === "POST") {
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsedBody = body ? JSON.parse(body) : undefined;
          await httpTransport.handleRequest(req, res, parsedBody);
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        }
      });
    } else {
      await httpTransport.handleRequest(req, res);
    }
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        })
      );
    }
  }
});

async function start() {
  try {
    await wsClient.connect();

    if (process.argv.includes("--stdio")) {
      const stdinTransport = new StdioServerTransport();
      await mcpServer.connect(stdinTransport);
      process.stdin.resume();
      return;
    }

    const mcpPort = parseInt(process.env.MCP_PORT || "8002");

    let currentPort = mcpPort;
    let retries = 0;
    const maxRetries = 10;

    const startHttpServer = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        mcpHttpServer
          .listen(currentPort)
          .on("listening", () => {
            resolve();
          })
          .on("error", (err: any) => {
            if (err.code === "EADDRINUSE" && retries < maxRetries) {
              retries++;
              currentPort++;
              mcpHttpServer.close();
              startHttpServer().then(resolve).catch(reject);
            } else {
              reject(err);
            }
          });
      });
    };

    await startHttpServer();
  } catch (error) {
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  mcpHttpServer.close();
  process.exit(0);
});

start();
