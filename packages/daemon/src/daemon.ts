import { Data, identity, Effect } from "effect";

import * as util from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";

import { Option } from "effect";
import { Array as A } from "effect";
import { Hono } from "hono";

import { cors } from "hono/cors";

import { FileSystem } from "@effect/platform";
import { NodeContext, NodeFileSystem } from "@effect/platform-node";
import { spawn, exec } from "child_process";
import getPort from "get-port";
import { makeRedisClient, RedisContext } from "redis";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validator } from "hono/validator";
const __dirname = path.dirname(new URL(import.meta.url).pathname);
// import { injectWebSocket } from "./inject-websocket";

export const getCreatedAt = (name: string) =>
  Effect.gen(function* () {
    const { client } = yield* RedisContext;
    const res = yield* client.effect.get(`${name}_createdAt`);
    if (res.kind !== "createdAt") {
      return yield* new RedisValidationError({
        meta: "not created at, was:" + res.kind,
      });
    }
    return res.createdAt;
  });
const execPromise = util.promisify(exec);
// const getCommand = (port: number) =>
//   `bun install && bun run dev --port ${port}`.split(" ");
const ADJECTIVES = [
  "funny",
  "silly",
  "quick",
  "happy",
  "bright",
  "calm",
  "eager",
  "jolly",
  "kind",
  "lively",
  "zesty",
  "witty",
  "dandy",
  "groovy",
  "nimble",
  "brave",
  "clever",
  "dapper",
  "elegant",
  "fierce",
  "gentle",
  "humble",
  "iconic",
  "jazzy",
  "keen",
  "loyal",
  "mighty",
  "noble",
  "optimal",
  "peppy",
  "quirky",
  "radiant",
  "smooth",
  "tender",
  "unique",
  "vibrant",
  "wise",
  "xenial",
  "youthful",
  "zealous",
  "ancient",
  "bold",
  "cosmic",
  "dazzling",
  "enchanted",
  "fluffy",
  "glowing",
  "heroic",
  "intrepid",
  "jovial",
];
const NOUNS = [
  "penguin",
  "wall",
  "cat",
  "dog",
  "river",
  "cloud",
  "star",
  "moon",
  "apple",
  "banana",
  "robot",
  "puffin",
  "comet",
  "galaxy",
  "meerkat",
  "tiger",
  "unicorn",
  "volcano",
  "walrus",
  "xylophone",
  "yeti",
  "zebra",
  "asteroid",
  "bison",
  "cactus",
  "dolphin",
  "eagle",
  "falcon",
  "giraffe",
  "hedgehog",
  "iguana",
  "jaguar",
  "koala",
  "lemur",
  "mammoth",
  "narwhal",
  "octopus",
  "panther",
  "quokka",
  "raccoon",
  "squirrel",
  "toucan",
  "viper",
  "wombat",
  "phoenix",
  "dragon",
  "wizard",
  "ninja",
  "samurai",
  "pirate",
];

const getLines = Effect.gen(function* () {
  const command = `ps -o pid,command -ax | grep 'devtools-daemon:project=' | grep -v grep || true`;
  const execResult = yield* Effect.tryPromise(() => execPromise(command));
  return execResult;
});

export const getProjects = Effect.gen(function* () {
  const command = `ps -o pid,command -ax | grep 'devtools-daemon:project=' | grep -v grep || true`;
  const fs = yield* FileSystem.FileSystem;
  // okay so later we will make a dedicated devtools store in some custom dir, or .devtools, till then we hardcode the path
  // semantically the same thing so this impl won't have to change, just a common todo
  const projectNames = yield* fs.readDirectory(
    path.join(path.dirname(__dirname), "projects")
  );

  const execResult = yield* Effect.tryPromise(() => execPromise(command));
  const lines = execResult.stdout.trim().split("\n");

  const projectOptions = lines.map((line) =>
    Effect.gen(function* () {
      if (!line) {
        return Option.none();
      }

      const psPidMatch = line.trim().match(/^(\d+)\s+/);

      if (!psPidMatch) {
        console.log("no pid match");

        return Option.none();
      }

      const pid = parseInt(psPidMatch[1], 10);
      const markerIndex = line.indexOf("devtools-daemon:project=");

      if (markerIndex === -1) {
        console.log("no marker index");

        return Option.none();
      }

      const process = yield* parseProcessMarkerArgument(line).pipe(
        Effect.match({ onSuccess: (v) => v, onFailure: () => null })
      );
      if (!process) {
        console.log("no process");

        return Option.none();
      }
      const { createdAt, name, port } = process;

      // todo: don't hard code
      const projectPath = `projects/${name}`;
      // todo: return stdout

      console.log("RETURNING SOME SHOULD NOT BE DONE", name);

      return Option.some({
        name,
        port,
        cwd: projectPath,
        absolutePath: path.resolve(projectPath),
        pid,
        createdAt,
      });
    })
  );

  console.log("lines", lines);

  const projects = yield* Effect.all(projectOptions).pipe(
    Effect.map((opts) =>
      A.filterMap(opts, identity).map((value) => ({
        ...value,
        // I think it must be running if there exist something from the PS, it may also be paused I should check in on that and see how to query that
        status: "running" as const,
      }))
    )
  );

  const killedProjects = projectNames.filter(
    (projectName) =>
      !projects.some((runningProject) => runningProject.name === projectName)
  );

  const killedProjectsMetaEffects = killedProjects.map((name) =>
    Effect.gen(function* () {
      console.log("killing", name);

      const relativePath = `projects/${name}`;
      return {
        status: "killed" as const,
        // todo: don't hardcode here
        cwd: relativePath,
        absolutePath: path.resolve(relativePath),
        name,
        createdAt: yield* getCreatedAt(name),
      };
    })
  );

  const killedProjectsMeta = yield* Effect.all(killedProjectsMetaEffects);
  const allProjects: Array<Project> = [...projects, ...killedProjectsMeta];

  console.log(
    "all projects",
    allProjects.filter((p) => p.status === "running")
  );

  return allProjects;
});
const killAllProjects = Effect.gen(function* () {
  const projects = yield* getProjects;
  const runningProjects = projects.filter(
    (project) => project.status === "running"
  );

  const killEffects = runningProjects.map((project) =>
    Effect.gen(function* () {
      const { client } = yield* RedisContext;
      process.kill(project.pid);

      yield* client.effect.set(project.name, {
        kind: "status",
        status: "killed",
      });
    })
  );

  yield* Effect.all(killEffects);
});
export const nuke = Effect.gen(function* () {
  yield* killAllProjects;
  const { client } = yield* RedisContext;
  yield* Effect.tryPromise(() => client.flushdb());
  const fs = yield* FileSystem.FileSystem;
  yield* fs.remove("projects", { recursive: true });
  yield* fs.makeDirectory("projects");
});

export const createServer = async (
  redisClient: ReturnType<typeof makeRedisClient>
) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* restoreProjects;
    })
      .pipe(Effect.provide(NodeContext.layer))
      .pipe(Effect.provideService(RedisContext, { client: redisClient }))
  );
  const app = new Hono()
    .use("*", cors())
    .get("/", async (opts) => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const file = yield* fs.readFileString("index.html");
          return file;
        }).pipe(Effect.provide(NodeContext.layer))
      );

      switch (exit._tag) {
        case "Success": {
          return new Response(exit.value, {
            headers: {
              ["Content-type"]: "text/html",
              ["Origin-Agent-Cluster"]: "?1",
            },
          });
        }
        case "Failure": {
          return opts.json({ error: exit.cause.toJSON() });
        }
      }
    })
    .post(
      "/start-project",
      zValidator(
        "json",
        z.object({
          name: z.string(),
        })
      ),
      async (opts) => {
        const { name } = opts.req.valid("json");
        console.log("start project request", name);
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            // this will probably throw a nasty error if you use this incorrectly
            console.log(
              "projects before",
              (yield* getProjects).filter((p) => p.status === "running")
            );
            const createdAt = yield* getCreatedAt(name);
            const project = yield* runProject({ name, createdAt });
            console.log("running", project);

            yield* redisClient.effect.set(name, {
              kind: "status",
              status: "running",
            });

            console.log(
              "projects now",
              (yield* getProjects).filter((p) => p.status === "running")
            );

            return project;
          })
            .pipe(Effect.provide(NodeContext.layer))
            .pipe(Effect.provideService(RedisContext, { client: redisClient }))
        );

        switch (exit._tag) {
          case "Success": {
            return opts.json({ success: true, project: exit.value });
          }
          case "Failure": {
            const error = exit.cause.toJSON();
            return opts.json({ error });
          }
        }
      }
    )
    .post(
      "/kill-project",
      zValidator(
        "json",
        z.object({
          name: z.string(),
        })
      ),
      async (opts) => {
        const { name } = opts.req.valid("json");
        const exit = await Effect.runPromiseExit(
          killProject(name)
            .pipe(Effect.provide(NodeContext.layer))
            .pipe(Effect.provideService(RedisContext, { client: redisClient }))
        );

        switch (exit._tag) {
          case "Success": {
            return opts.json({ success: true });
          }
          case "Failure": {
            const error = exit.cause.toJSON();
            return opts.json({ error });
          }
        }
      }
    )
    .post(
      "/delete-project",
      zValidator(
        "json",
        z.object({
          name: z.string(),
        })
      ),
      async (opts) => {
        const { name } = opts.req.valid("json");
        const exit = await Effect.runPromiseExit(
          deleteProject(name)
            .pipe(Effect.provide(NodeContext.layer))
            .pipe(Effect.provideService(RedisContext, { client: redisClient }))
        );

        switch (exit._tag) {
          case "Success": {
            return opts.json({ success: true });
          }
          case "Failure": {
            const error = exit.cause.toJSON();
            return opts.json({ error });
          }
        }
      }
    )
    .post("/nuke", async (opts) => {
      const exit = await Effect.runPromiseExit(
        nuke
          .pipe(Effect.provide(NodeContext.layer))
          .pipe(Effect.provideService(RedisContext, { client: redisClient }))
      );

      return opts.json({ exit: exit.toJSON() });
    })
    .post("/get-projects", async (opts) => {
      const exit = await Effect.runPromiseExit(
        getProjects
          .pipe(Effect.provide(NodeContext.layer))
          .pipe(Effect.provideService(RedisContext, { client: redisClient }))
      );

      switch (exit._tag) {
        case "Success": {
          const projects = exit.value;

          // Enhance projects with deployment URLs, GitHub URLs, and display names from Redis
          const enhancedProjects = await Promise.all(
            projects.map(async (project) => {
              const deploymentUrl = await redisClient.get(
                `${project.name}_deploymentUrl`
              );
              const githubUrl = await redisClient.get(`github:${project.name}`);
              const displayName = await redisClient.get(
                `displayName:${project.name}`
              );
              return {
                ...project,
                deploymentUrl: deploymentUrl || undefined,
                githubUrl: githubUrl || undefined,
                displayName: displayName || undefined,
              };
            })
          );

          return opts.json({ projects: enhancedProjects });
        }
        case "Failure": {
          const error = exit.cause.toJSON();
          return opts.json({ error });
        }
      }
    })
    .post("/create-project", async (opts) => {
      console.log("gonna create");

      const exit = await Effect.runPromiseExit(
        spawnProject({
          pathToSymlinkAt: undefined,
        })
          .pipe(Effect.provide(NodeContext.layer))
          .pipe(Effect.provideService(RedisContext, { client: redisClient }))
      );

      switch (exit._tag) {
        case "Success": {
          const project = exit.value;

          // Asynchronously create GitHub repo without blocking the response
          (async () => {
            try {
              console.log(`Creating GitHub repo for ${project.name}...`);
              const projectPath = path.join(
                process.cwd(),
                "projects",
                project.name
              );

              // Initialize git repo
              await execPromise("git init", { cwd: projectPath });

              // Add all files
              await execPromise("git add .", { cwd: projectPath });

              // Create initial commit
              await execPromise('git commit -m "Initial commit"', {
                cwd: projectPath,
              });

              // Create GitHub repo using gh CLI
              const createOutput = await execPromise(
                `gh repo create ${project.name} --private --source=. --remote=origin --push`,
                { cwd: projectPath }
              );

              // Extract the repo URL
              const urlMatch = createOutput.stdout.match(
                /https:\/\/github\.com\/[^\s]+/
              );
              const githubUrl = urlMatch
                ? urlMatch[0]
                : `https://github.com/${project.name}`;

              // Save the GitHub URL
              await redisClient.set(`github:${project.name}`, githubUrl);

              console.log(
                `GitHub repo created for ${project.name}: ${githubUrl}`
              );
            } catch (error) {
              console.error(
                `Failed to create GitHub repo for ${project.name}:`,
                error
              );
              // Don't throw - this is a non-blocking operation
            }
          })();

          return opts.json({ project });
        }
        case "Failure": {
          const error = exit.cause.toJSON();
          console.log("error poopy", error);

          return opts.json({ error });
        }
      }
    })
    .post("/deploy-project", async (opts) => {
      const body = await opts.req.json();
      const parsed = z.object({ name: z.string() }).safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { name } = parsed.data;

      // Get project details to find the project path
      const projectPath = path.join("projects", name);

      // Check if project exists
      if (!fs.existsSync(projectPath)) {
        return opts.json({ error: "Project not found" }, 404);
      }

      try {
        // Run vercel deploy command without authentication
        const deployProcess = spawn("npx", ["vercel", "--yes", "--prod"], {
          cwd: projectPath,
          env: {
            ...process.env,
            VERCEL_TOKEN: process.env.VERCEL_ACCESS_TOKEN, // Token should be set in environment
          },
        });

        let deployUrl = "";
        let errorOutput = "";

        deployProcess.stdout.on("data", (data) => {
          const output = data.toString();
          console.log("Deploy output:", output);

          // Vercel outputs the URL in the last line
          const urlMatch = output.match(/https:\/\/[^\s]+/);
          if (urlMatch) {
            deployUrl = urlMatch[0];
          }
        });

        deployProcess.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        await new Promise((resolve, reject) => {
          deployProcess.on("close", (code) => {
            if (code === 0) {
              resolve(void 0);
            } else {
              reject(
                new Error(`Deploy failed with code ${code}: ${errorOutput}`)
              );
            }
          });

          deployProcess.on("error", reject);
        });

        if (!deployUrl) {
          throw new Error("Failed to extract deployment URL");
        }

        // Extract project name from deployment URL
        // Vercel URLs can be in different formats:
        // - https://project-name.vercel.app (production)
        // - https://project-name-git-branch-username.vercel.app (preview)
        // - https://project-name-randomstring.vercel.app (preview)
        let vercelProjectId = name;

        // Try to extract from the deployment URL
        const urlParts = deployUrl
          .replace("https://", "")
          .replace(".vercel.app", "")
          .split("-");
        if (urlParts.length > 0) {
          // The project name is usually the first part before any hyphens
          vercelProjectId = urlParts[0];
        }

        console.log(
          `Extracted project ID: ${vercelProjectId} from URL: ${deployUrl}`
        );

        // Disable deployment protection via Vercel API
        try {
          // First, try to get the project to ensure we have the right ID
          console.log(`Looking up project with name: ${vercelProjectId}`);
          const projectResponse = await fetch(
            `https://api.vercel.com/v9/projects/${vercelProjectId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${process.env.VERCEL_ACCESS_TOKEN}`,
              },
            }
          );

          if (!projectResponse.ok) {
            console.warn(
              `Project not found with ID ${vercelProjectId}, trying with full project name ${name}`
            );
            // Try with the full project name
            vercelProjectId = name;
          }

          console.log(
            `Disabling deployment protection for project: ${vercelProjectId}`
          );
          const disableProtectionResponse = await fetch(
            `https://api.vercel.com/v9/projects/${vercelProjectId}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${process.env.VERCEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                passwordProtection: null,
                ssoProtection: null,
              }),
            }
          );

          if (disableProtectionResponse.ok) {
            console.log("Successfully disabled deployment protection");
          } else {
            const errorText = await disableProtectionResponse.text();
            console.warn(
              "Failed to disable deployment protection:",
              disableProtectionResponse.status,
              errorText
            );
          }
        } catch (err) {
          console.warn("Error disabling deployment protection:", err);
        }

        // Save deployment URL to Redis
        await redisClient.set(`${name}_deploymentUrl`, deployUrl);

        // Get GitHub URL if it exists
        const githubUrl = await redisClient.get(`github:${name}`);

        // Automatically publish to hub with screenshot URL
        const hubKey = `hub:${name}`;
        const hubData = {
          name,
          deploymentUrl: deployUrl,
          projectName: name,
          description: `Deployed from ${name}`,
          publishedAt: Date.now(),
          screenshotUrl: `http://localhost:40000/screenshot/${name}`,
          githubUrl: githubUrl || undefined,
        };

        await redisClient.set(hubKey, JSON.stringify(hubData));
        await redisClient.sadd("hub:projects", name);

        return opts.json({
          success: true,
          url: deployUrl,
          project: name,
        });
      } catch (error) {
        console.error("Deploy error:", error);
        return opts.json(
          {
            error: error instanceof Error ? error.message : "Deploy failed",
          },
          500
        );
      }
    })
    .post("/hub/publish", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          name: z.string(),
          deploymentUrl: z.string(),
          projectName: z.string(),
          description: z.string().optional(),
          githubUrl: z.string().optional(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { name, deploymentUrl, projectName, description, githubUrl } =
        parsed.data;

      try {
        // Save to Redis with hub: prefix
        const hubKey = `hub:${name}`;
        const hubData = {
          name,
          deploymentUrl,
          projectName,
          description,
          githubUrl,
          publishedAt: Date.now(),
          screenshotUrl: `http://localhost:40000/screenshot/${name}`,
        };

        // Store as JSON string
        await redisClient.set(hubKey, JSON.stringify(hubData));

        // Also maintain a list of all hub projects
        await redisClient.sadd("hub:projects", name);

        return opts.json({
          success: true,
          data: hubData,
        });
      } catch (error) {
        console.error("Hub publish error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to publish to hub",
          },
          500
        );
      }
    })
    .post("/save-screenshot", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          projectName: z.string(),
          screenshot: z.string(), // base64 encoded image
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { projectName, screenshot } = parsed.data;

      try {
        // Save screenshot to Redis
        await redisClient.set(`screenshot:${projectName}`, screenshot);

        return opts.json({
          success: true,
          message: "Screenshot saved",
        });
      } catch (error) {
        console.error("Screenshot save error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to save screenshot",
          },
          500
        );
      }
    })
    .get("/screenshot/:projectName", async (opts) => {
      const { projectName } = opts.req.param();

      try {
        const screenshot = await redisClient.get(`screenshot:${projectName}`);

        if (!screenshot) {
          return opts.json({ error: "Screenshot not found" }, 404);
        }

        // Extract base64 data from data URL
        const base64Data = screenshot.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        return new Response(buffer, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (error) {
        console.error("Screenshot fetch error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch screenshot",
          },
          500
        );
      }
    })
    .get("/get-github-url/:projectName", async (opts) => {
      const { projectName } = opts.req.param();

      try {
        const githubUrl = await redisClient.get(`github:${projectName}`);

        return opts.json({
          success: true,
          githubUrl: githubUrl || null,
        });
      } catch (error) {
        console.error("GitHub URL fetch error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch GitHub URL",
          },
          500
        );
      }
    })
    .post("/save-github-url", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          projectName: z.string(),
          githubUrl: z.string().url(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { projectName, githubUrl } = parsed.data;

      try {
        await redisClient.set(`github:${projectName}`, githubUrl);

        return opts.json({
          success: true,
          message: "GitHub URL saved",
        });
      } catch (error) {
        console.error("GitHub URL save error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to save GitHub URL",
          },
          500
        );
      }
    })
    .get("/instrumentation/:projectName", async (opts) => {
      const { projectName } = opts.req.param();

      try {
        const projectResult = await Effect.runPromise(
          getProject(projectName).pipe(
            Effect.provideService(RedisContext, { client: redisClient }),
            Effect.provide(NodeFileSystem.layer),
            Effect.provide(NodeContext.layer)
          )
        );

        if (!projectResult || projectResult.status !== "running") {
          return opts.json({ error: "Project not found or not running" }, 404);
        }

        const instrumentationPath = path.join(
          projectResult.cwd,
          "instrumentation.js"
        );

        if (!fs.existsSync(instrumentationPath)) {
          const templatePath = path.join(
            __dirname,
            "../templates/vite-template-v3/instrumentation.js"
          );
          const content = fs.readFileSync(templatePath, "utf-8");

          return new Response(content, {
            headers: {
              "Content-Type": "application/javascript",
              "Cache-Control": "no-cache",
            },
          });
        }

        const content = fs.readFileSync(instrumentationPath, "utf-8");

        return new Response(content, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      } catch (error) {
        console.error("Instrumentation fetch error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch instrumentation",
          },
          500
        );
      }
    })
    .post("/create-github-repo", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          projectName: z.string(),
          projectPath: z.string(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { projectName, projectPath } = parsed.data;

      try {
        const gitDir = path.join(projectPath, ".git");
        const gitExists = fs.existsSync(gitDir);

        if (!gitExists) {
          console.log(`Initializing git repository in ${projectPath}`);

          const gitInitProcess = spawn("git", ["init"], {
            cwd: projectPath,
            stdio: ["ignore", "pipe", "pipe"],
          });

          await new Promise((resolve, reject) => {
            let errorOutput = "";
            gitInitProcess.stderr.on("data", (data) => {
              errorOutput += data.toString();
            });

            gitInitProcess.on("close", (code) => {
              if (code === 0) {
                console.log("Git initialized successfully");
                resolve(void 0);
              } else {
                reject(
                  new Error(
                    `Failed to initialize git repository: ${errorOutput}`
                  )
                );
              }
            });
          });

          const gitConfigEmailProcess = spawn(
            "git",
            ["config", "user.email", "dev@localhost"],
            {
              cwd: projectPath,
              stdio: ["ignore", "pipe", "pipe"],
            }
          );

          await new Promise((resolve) => {
            gitConfigEmailProcess.on("close", () => resolve(void 0));
          });

          const gitConfigNameProcess = spawn(
            "git",
            ["config", "user.name", "Dev Zero"],
            {
              cwd: projectPath,
              stdio: ["ignore", "pipe", "pipe"],
            }
          );

          await new Promise((resolve) => {
            gitConfigNameProcess.on("close", () => resolve(void 0));
          });

          const gitAddProcess = spawn("git", ["add", "."], {
            cwd: projectPath,
            stdio: ["ignore", "pipe", "pipe"],
          });

          await new Promise((resolve, reject) => {
            let errorOutput = "";
            gitAddProcess.stderr.on("data", (data) => {
              errorOutput += data.toString();
            });

            gitAddProcess.on("close", (code) => {
              if (code === 0) {
                console.log("Files added to git successfully");
                resolve(void 0);
              } else {
                reject(new Error(`Failed to add files to git: ${errorOutput}`));
              }
            });
          });

          const gitCommitProcess = spawn(
            "git",
            ["commit", "-m", "Initial commit"],
            {
              cwd: projectPath,
              stdio: ["ignore", "pipe", "pipe"],
            }
          );

          await new Promise((resolve, reject) => {
            let errorOutput = "";
            gitCommitProcess.stderr.on("data", (data) => {
              errorOutput += data.toString();
            });

            gitCommitProcess.on("close", (code) => {
              if (code === 0) {
                console.log("Initial commit created successfully");
                resolve(void 0);
              } else {
                reject(new Error(`Failed to commit files: ${errorOutput}`));
              }
            });
          });
        } else {
          console.log("Git repository already exists");
        }

        const ghProcess = spawn(
          "gh",
          [
            "repo",
            "create",
            projectName,
            "--private",
            "--source=.",
            "--remote=origin",
            "--push",
          ],
          {
            cwd: projectPath,
          }
        );

        let output = "";
        let errorOutput = "";

        ghProcess.stdout.on("data", (data) => {
          output += data.toString();
        });

        ghProcess.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        await new Promise((resolve, reject) => {
          ghProcess.on("close", (code) => {
            if (code === 0) {
              resolve(void 0);
            } else {
              reject(new Error(`GitHub repo creation failed: ${errorOutput}`));
            }
          });
        });

        const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
        const githubUrl = urlMatch
          ? urlMatch[0]
          : `https://github.com/${projectName}`;

        await redisClient.set(`github:${projectName}`, githubUrl);

        return opts.json({
          success: true,
          githubUrl,
        });
      } catch (error) {
        console.error("GitHub repo creation error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to create GitHub repository",
          },
          500
        );
      }
    })
    .post("/clone-and-register", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          githubUrl: z.string().url(),
          projectName: z.string(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { githubUrl, projectName } = parsed.data;

      try {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const { name: newProjectName, createdAt } = yield* createProject;
            const projectPath = path.join("projects", newProjectName);

            const fs = yield* FileSystem.FileSystem;
            yield* fs.remove(projectPath, { recursive: true });

            yield* Effect.async<void, Error>((resume) => {
              const cloneProcess = spawn("git", [
                "clone",
                githubUrl,
                projectPath,
              ]);

              let errorOutput = "";
              cloneProcess.stderr.on("data", (data) => {
                errorOutput += data.toString();
              });

              cloneProcess.on("close", (code) => {
                if (code === 0) {
                  resume(Effect.void);
                } else {
                  resume(
                    Effect.fail(new Error(`Clone failed: ${errorOutput}`))
                  );
                }
              });
            });

            yield* Effect.async<void, Error>((resume) => {
              const installProcess = spawn("bun", ["install"], {
                cwd: projectPath,
              });

              installProcess.on("close", (code) => {
                if (code === 0) {
                  resume(Effect.void);
                } else {
                  resume(
                    Effect.fail(new Error("Failed to install dependencies"))
                  );
                }
              });
            });

            const project = yield* runProject({
              name: newProjectName,
              createdAt,
            });

            yield* publishStartedProject(newProjectName);

            const { client } = yield* RedisContext;
            yield* Effect.tryPromise(() =>
              client.set(`github:${newProjectName}`, githubUrl)
            );

            return {
              success: true,
              project: {
                ...project,
                githubUrl,
              },
            };
          }).pipe(
            Effect.provideService(RedisContext, { client: redisClient }),
            Effect.provide(NodeFileSystem.layer),
            Effect.provide(NodeContext.layer)
          )
        );

        return opts.json(result);
      } catch (error) {
        console.error("Clone and register error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to clone and register project",
          },
          500
        );
      }
    })
    .post("/get-display-names", async (opts) => {
      try {
        const keys = await redisClient.keys("displayName:*");
        const displayNames: Record<string, string> = {};

        for (const key of keys) {
          const projectName = key.replace("displayName:", "");
          const displayName = await redisClient.get(key);
          if (displayName) {
            displayNames[projectName] = displayName;
          }
        }

        return opts.json({
          success: true,
          displayNames,
        });
      } catch (error) {
        console.error("Get display names error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to get display names",
          },
          500
        );
      }
    })
    .post("/set-display-name", async (opts) => {
      const body = await opts.req.json();
      const parsed = z
        .object({
          projectName: z.string(),
          displayName: z.string(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return opts.json({ error: parsed.error }, 400);
      }

      const { projectName, displayName } = parsed.data;

      try {
        await redisClient.set(`displayName:${projectName}`, displayName);

        return opts.json({
          success: true,
          message: "Display name updated",
        });
      } catch (error) {
        console.error("Set display name error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to set display name",
          },
          500
        );
      }
    })
    .get("/hub/projects", async (opts) => {
      try {
        const projectNames = await redisClient.smembers("hub:projects");

        const projects = await Promise.all(
          projectNames.map(async (name) => {
            const dataStr = await redisClient.get(`hub:${name}`);
            return dataStr ? JSON.parse(dataStr) : null;
          })
        );

        const validProjects = projects
          .filter((p): p is any => p !== null)
          .sort((a, b) => b.publishedAt - a.publishedAt);

        return opts.json({
          success: true,
          projects: validProjects,
        });
      } catch (error) {
        console.error("Hub fetch error:", error);
        return opts.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch hub projects",
          },
          500
        );
      }
    })
    .get("/terminal", async (opts) => {
      // Serve terminal application - iframe to terminal app
      const terminalHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dev0 Terminal</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { height: 100vh; width: 100vw; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <iframe 
      src="http://localhost:4261" 
      style="width: 100%; height: 100%; border: none;"
      title="Terminal"
    ></iframe>
  </body>
</html>`;

      return new Response(terminalHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    });

  const port = 40_000;
  const host = "localhost";
  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      console.log(`Server is running on http://${host}:${info.port}`);
    }
  );

  return { app, server };
};

// todo: embed this logic so we never have collisions
// while (attempts < MAX_PROJECT_NAME_GENERATION_ATTEMPTS && !nameIsUnique) {
//   warmName = generateRandomName();
//   nameIsUnique =
//     !runningProjects.some((p) => p.name === warmName) &&
//     !activeProjectNames.has(warmName);
//   attempts++;
// }

const generateRandomName = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${suffix}`;
};

const createProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const name = generateRandomName();
  const projectPath = `projects/${name}`;
  yield* fs.makeDirectory(projectPath);
  yield* fs.copy("templates/vite-template-v3", projectPath);

  const existing = yield* fs.readFileString(`${projectPath}/index.html`);
  yield* fs.writeFileString(
    `${projectPath}/index.html`,
    existing.replace("REPLACE ME", name)
  );
  const createdAt = Date.now();
  yield* setCreatedAt(name, createdAt);

  return { name, projectPath, createdAt };
});

const runProject = ({ name, createdAt }: { name: string; createdAt: number }) =>
  Effect.gen(function* () {
    // todo: just a stub for now, impl later
    // need to make sure to give the process a title for metadata so we can search in the future
    const projects = yield* getProjects;
    const existing = projects.find(
      (project) => project.name === name && project.status === "running"
    ) as RunningProject | undefined;
    if (existing) {
      return existing;
    }

    const assignedPort = yield* Effect.tryPromise(() => getPort());

    // todo: don't hard code node-project, or forward slashes for directories
    const fs = yield* FileSystem.FileSystem;
    const actualCodePath = `projects/${name}`;

    const exists = yield* fs.exists(actualCodePath);
    // console.log("exists?", exists, actualCodePath);

    if (!exists) {
      return yield* new GenericError();
    }

    const title = yield* getProcessTitleMarker({
      name,
      port: assignedPort,
      createdAt,
    });
    console.log("projects before install", yield* getLines);

    const installChild = spawn("bun", ["install"], {
      cwd: actualCodePath,
      stdio: ["ignore", "pipe", "pipe"],
    });

    yield* Effect.async<void, ChildProcessError>((resume) => {
      installChild.stdout?.on("data", (data) => {
        console.log("Install stdout:", data.toString());
      });

      installChild.stderr?.on("data", (data) => {
        console.log("Install stderr:", data.toString());
      });

      installChild.on("close", (code) => {
        if (code === 0) {
          resume(Effect.void);
        } else {
          console.log("Install process failed with code:", code);
          resume(Effect.fail(new ChildProcessError()));
        }
      });

      installChild.on("error", (error) => {
        console.log("Install process error:", error);
        resume(Effect.fail(new ChildProcessError()));
      });
    });

    console.log("projects after install", yield* getLines);
    // console.log("spawning at", assignedPort);

    const wrapperPath = path.join(__dirname, "vite-wrapper.js");
    const child = spawn(
      "node",
      [wrapperPath, "--marker", title, "--port", assignedPort.toString()],
      {
        cwd: actualCodePath,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: {
          ...process.env,
        },
      }
    );

    yield* Effect.async<void, ChildProcessError>((resume) => {
      child.on("spawn", () => {
        if (child.pid) {
          child.pid;
          // process.title = title;
        }
        resume(Effect.void);
      });

      child.on("error", (error) => {
        resume(Effect.fail(new ChildProcessError()));
      });
    });

    /**
     * 
     * 
projects after install {
  stdout: '61040 devtools-daemon:project=clever-cloud-311:assigned_port=61935:created_at=1749167812963     \n',
  stderr: ''
}
projects after spawn {
  stdout: '61040 devtools-daemon:project=cosmic-dragon-668:assigned_port=62486:created_at=1749169741827     \n',
  stderr: ''
}


why the fuck is spawning another vite server killing the original???????


     */

    child.stdout?.on("data", (data) => {
      console.log(`Project ${name} stdout:`, data.toString());
    });

    child.stderr?.on("data", (data) => {
      console.log(`Project ${name} stderr:`, data.toString());
    });

    child.on("error", (error) => {
      console.log("Child process error:", error);
    });

    child.on("close", () => {
      console.log("closing", name);
    });

    const pid = child.pid;
    // child.
    // console.log("pid we got back", pid);

    if (!pid) {
      return yield* new ChildProcessError();
    }

    // const text = yield* Effect.tryPromise(() =>
    //   fetch(`http://localhost:${assignedPort}`)
    // );
    // console.log("fuck", text);

    const runningProject: RunningProject = {
      pid,
      cwd: actualCodePath,
      absolutePath: path.resolve(actualCodePath),
      name,
      port: assignedPort,
      status: "running",
      createdAt,
    };
    return runningProject;
  });

export type EffectReturnType<T> = T extends Effect.Effect<infer R, any, any>
  ? R
  : never;

export class GenericError extends Data.TaggedError("GenericError")<{}> {}
export class RedisValidationError extends Data.TaggedError(
  "RedisValidationError"
)<{ meta: unknown }> {}
export class ProjectNotFoundError extends Data.TaggedError(
  "ProjectNotFoundError"
)<{}> {}
export class ChildProcessError extends Data.TaggedError(
  "ChildProcessError"
)<{}> {}

const publishStartedProject = (name: string) =>
  Effect.gen(function* () {
    const { client } = yield* RedisContext;
    // this state is used so we know at startup how to restore state
    yield* client.effect.set(name, {
      kind: "status",
      status: "running",
    });
  });

const parseProcessMarkerArgument = (processTitle: string) =>
  Effect.gen(function* () {
    const match = processTitle.match(
      /devtools-daemon:project=(.+):assigned_port=(\d+):created_at=(\d+)/
    );
    if (!match) {
      return yield* new GenericError();
    }
    const port = parseInt(match[2], 10);
    const name = match[1];
    const createdAt = parseInt(match[3], 10);

    return { port, name, createdAt };
  });
export const setCreatedAt = (name: string, createdAt: number) =>
  Effect.gen(function* () {
    const { client } = yield* RedisContext;
    yield* client.effect.set(`${name}_createdAt`, {
      createdAt,
      kind: "createdAt",
    });
  });
const getProcessTitleMarker = ({
  createdAt,
  name,
  port,
}: {
  name: string;
  port: number;
  createdAt: number;
}) =>
  Effect.gen(function* () {
    return `devtools-daemon:project=${name}:assigned_port=${port}:created_at=${createdAt}`;
  });

const restoreProjects = Effect.gen(function* () {
  const projects = yield* getProjects;
  const { client } = yield* RedisContext;
  const startedProjects = projects.map((project) => {
    return Effect.gen(function* () {
      if (project.status !== "running") {
        return;
      }
      const createdAt = yield* getCreatedAt(project.name);
      yield* runProject({ name: project.name, createdAt });
      yield* client.effect.set(project.name, {
        kind: "status",
        status: "running",
      });
    });
  });

  yield* Effect.all(startedProjects);
});
export type RunningProject = {
  status: "running";
  name: string;
  port: number;
  cwd: string;
  absolutePath: string;
  pid: number;
  createdAt: number;
};

export type Project =
  | RunningProject
  | {
      status: "paused";
      name: string;
      port: number;
      cwd: string;
      absolutePath: string;
      pid: number;
      createdAt: number;
    }
  | {
      status: "killed";
      name: string;
      cwd: string;
      absolutePath: string;
      createdAt: number;
    };

// should be careful since its k:v can def have a memory leak if not paying attention/ tests

const spawnProject = ({ pathToSymlinkAt }: { pathToSymlinkAt?: string }) =>
  Effect.gen(function* () {
    console.log("projects a", yield* getProjects);

    const { name, createdAt } = yield* createProject;
    console.log("created", name);
    console.log("projects b", yield* getProjects);

    const project = yield* runProject({
      name,
      createdAt,
    });

    yield* publishStartedProject(name);
    console.log("projects c", yield* getProjects);
    const { client } = yield* RedisContext;

    if (pathToSymlinkAt) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(`${pathToSymlinkAt}/devtools-links`, {
        recursive: true,
      });
      const projectLinkDir = `${pathToSymlinkAt}/devtools-links/${project.name}`;

      const absoluteProjectPath = yield* fs.realPath(project.cwd);

      yield* fs.symlink(absoluteProjectPath, projectLinkDir).pipe(
        Effect.match({
          onFailure: (e) => {},
          onSuccess: (d) => {},
        })
      );
    }

    return project;
  });

//

export const getProject = (name: string) =>
  Effect.gen(function* () {
    const projects = yield* getProjects;

    const project = projects.find((project) => project.name === name);

    if (!project) {
      return yield* new ProjectNotFoundError();
    }
    return project;
  });

const killProject = (name: string) =>
  Effect.gen(function* () {
    console.log("killing", name);

    /**
     * technically doing a get projects then filtering is the same wrapper operation I can do
     */

    const project = yield* getProject(name);
    const { client } = yield* RedisContext;

    if (project.status !== "running") {
      return;
    }

    process.kill(project.pid);

    yield* client.effect.set(project.name, {
      kind: "status",
      status: "killed",
    });
  });

// todo: migrate to passing around id's this is easy
const deleteProject = (name: string) =>
  Effect.gen(function* () {
    yield* killProject(name);
    const fs = yield* FileSystem.FileSystem;
    const project = yield* getProject(name);
    const { client } = yield* RedisContext;

    const rmEffect = fs.remove(project.cwd, { recursive: true });
    const redisEffect = client.effect.del(project.name);

    const deleteDeploymentUrl = Effect.tryPromise(() =>
      client.del(`${name}_deploymentUrl`)
    );
    const deleteScreenshot = Effect.tryPromise(() =>
      client.del(`screenshot:${name}`)
    );
    const deleteGithubUrl = Effect.tryPromise(() =>
      client.del(`github:${name}`)
    );
    const deleteDisplayName = Effect.tryPromise(() =>
      client.del(`displayName:${name}`)
    );
    const deleteFromHub = Effect.tryPromise(async () => {
      await client.del(`hub:${name}`);
      await client.srem("hub:projects", name);
    });

    yield* Effect.all([
      rmEffect,
      redisEffect,
      deleteDeploymentUrl,
      deleteScreenshot,
      deleteGithubUrl,
      deleteDisplayName,
      deleteFromHub,
    ]);
  });

export type DaemonAppType = Awaited<ReturnType<typeof createServer>>["app"];
