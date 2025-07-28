// @ts-expect-error
import { $ } from "bun";
import { join } from "path";
import { existsSync } from "fs";

const packagesDir = join(__dirname, "packages");

async function startServices() {
  console.log("Starting all services...");

  const daemonProjectsPath = join(packagesDir, "daemon", "projects");
  if (!existsSync(daemonProjectsPath)) {
    console.log("Creating daemon projects directory...");
    await $`mkdir -p ${daemonProjectsPath}`;
  }

  const services = ["daemon", "redis", "terminal-v2"];
  const devProcesses = [];

  for (const service of services) {
    const servicePath = join(packagesDir, service);
    if (existsSync(servicePath)) {
      devProcesses.push($`cd ${servicePath} && bun run dev`);
    } else {
      console.warn(`Service directory not found: ${servicePath}`);
    }
  }

  devProcesses.forEach((proc) => {
    proc.catch((err) => console.error("Dev process error:", err));
  });

  const mcpServerPath = join(packagesDir, "mcp-server");
  if (existsSync(mcpServerPath)) {
    console.log("Building mcp-server...");
    await $`cd ${mcpServerPath} && bun run build`;

    console.log("Starting mcp-server ws:start...");
    $`cd ${mcpServerPath} && bun run ws:start`;
  } else {
    console.warn(`MCP server directory not found: ${mcpServerPath}`);
  }
}

startServices().catch(console.error);
