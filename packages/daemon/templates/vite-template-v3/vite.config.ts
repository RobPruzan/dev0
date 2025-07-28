// @ts-nocheck
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the Hono app
import { app } from "./endpoints";

// Custom plugin to handle CLAUDE.md updates and serve Hono API
const honoApiPlugin = () => {
  return {
    name: "hono-api-plugin",
    configureServer(server: any) {
      // Get the actual server port
      const actualPort = server.config.server.port || 5173;
      console.log(`🚀 Dev server running on port: ${actualPort}`);
      console.log(
        `📡 API endpoints available at: http://localhost:${actualPort}/api/*`
      );

      // Update CLAUDE.md with the actual port on server startup
      try {
        const templatePath = path.join(__dirname, "CLAUDE.md");
        if (fs.existsSync(templatePath)) {
          let claudeContent = fs.readFileSync(templatePath, "utf-8");

          // Replace the DEV_SERVER_PORT placeholder with actual port
          claudeContent = claudeContent.replace(
            /\{\{DEV_SERVER_PORT\}\}/g,
            actualPort.toString()
          );

          // Write back to the same file
          fs.writeFileSync(templatePath, claudeContent);
          console.log(`📝 Updated CLAUDE.md with port: ${actualPort}`);
        }
      } catch (error) {
        console.error("❌ Failed to update CLAUDE.md at startup:", error);
      }

      // Handle all API routes using Hono
      server.middlewares.use("/api", async (req: any, res: any) => {
        try {
          // Create a proper Request object for Hono
          const url = new URL(req.url, `http://${req.headers.host}`);
          const path = url.pathname.replace("/api", "") || "/";

          // Collect request body for POST/PUT requests
          let body = null;
          if (
            req.method === "POST" ||
            req.method === "PUT" ||
            req.method === "PATCH"
          ) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks).toString();
          }

          // Create Hono-compatible request
          const honoRequest = new Request(
            `http://localhost${path}${url.search}`,
            {
              method: req.method,
              headers: req.headers,
              body: body,
            }
          );

          // Process request through Hono
          const honoResponse = await app.request(honoRequest);

          // Set response headers
          honoResponse.headers.forEach((value: any, key: any) => {
            res.setHeader(key, value);
          });

          // Set status code
          res.statusCode = honoResponse.status;

          // Send response body
          const responseText = await honoResponse.text();
          res.end(responseText);
        } catch (error) {
          console.error("❌ Hono API error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: Date.now(),
            })
          );
        }
      });

      // Handle CLAUDE.md updates (keep existing functionality)
      server.middlewares.use(
        "/api/update-claude-md",
        async (req: any, res: any, next: any) => {
          if (req.method !== "POST") {
            return next();
          }

          let body = "";
          req.on("data", (chunk: any) => {
            body += chunk.toString();
          });

          req.on("end", () => {
            try {
              const { cwd } = JSON.parse(body);
              if (cwd) {
                console.log("📍 Received CWD:", cwd);

                // Read the CLAUDE.md template
                const templatePath = path.join(__dirname, "CLAUDE.md");
                console.log("📄 Template path:", templatePath);
                console.log("✅ Template exists:", fs.existsSync(templatePath));

                if (!fs.existsSync(templatePath)) {
                  console.error("❌ Template file not found at:", templatePath);
                  res.writeHead(404, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ error: "Template file not found" }));
                  return;
                }

                let claudeContent = fs.readFileSync(templatePath, "utf-8");
                console.log(
                  "📖 Template content preview:",
                  claudeContent.substring(0, 100)
                );

                // Replace placeholders
                claudeContent = claudeContent.replace(/\{\{CWD\}\}/g, cwd);
                claudeContent = claudeContent.replace(
                  /\{\{DEV_SERVER_PORT\}\}/g,
                  actualPort.toString()
                );
                console.log(
                  "🔄 After replacement preview:",
                  claudeContent.substring(0, 100)
                );

                // Write to CLAUDE.md in the CWD
                const claudePath = path.join(cwd, "CLAUDE.md");
                console.log("💾 Writing to:", claudePath);
                fs.writeFileSync(claudePath, claudeContent);

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, path: claudePath }));
              } else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "CWD not provided" }));
              }
            } catch (error) {
              console.error("❌ Failed to update CLAUDE.md:", error);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Failed to update CLAUDE.md" }));
            }
          });
        }
      );
    },
  };
};

export default defineConfig(() => ({
  plugins: [
    react({
      // Simple React configuration without TypeScript processing
      jsxRuntime: "automatic",
    }),
    honoApiPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true, // Allow external connections
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  esbuild: {
    // Transpile only, no type checking
    target: "es2020",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
  build: {
    // Continue build even if there are TypeScript errors
    rollupOptions: {
      onwarn(warning: any, warn: any) {
        // Ignore TypeScript-related warnings
        if (warning.code === "UNRESOLVED_IMPORT") return;
        if (warning.code === "CIRCULAR_DEPENDENCY") return;
        if (warning.message.includes("TypeScript")) return;
        warn(warning);
      },
    },
    // Disable source maps which can fail on type errors
    sourcemap: false,
    // Use esbuild for minification to avoid TypeScript issues
    minify: "esbuild",
  },
}));
