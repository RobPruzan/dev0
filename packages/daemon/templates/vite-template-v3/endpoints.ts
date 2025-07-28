// @ts-nocheck
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

app.get("/test", async (c: any) => {
  return c.json(
    {
      success: true,
    },
    201
  );
});

// 404 handler
app.notFound((c: any) => {
  return c.json(
    {
      error: "Route not found",
      path: c.req.path,
      method: c.req.method,
      timestamp: Date.now(),
    },
    404
  );
});

// Error handler
app.onError((err: any, c: any) => {
  console.error("API Error:", err);
  return c.json(
    {
      error: "Internal server error",
      message: err.message,
      timestamp: Date.now(),
    },
    500
  );
});

export { app };
