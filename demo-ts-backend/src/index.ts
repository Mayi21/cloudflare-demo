import { Hono } from "hono";
import { cors } from 'hono/cors';
const cronParser = require('cron-parser');

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Apply CORS middleware to the entire application
app.use('*', cors({
  origin: 'https://cloudflare-demo-3py.pages.dev',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// Hono automatically handles OPTIONS requests for routes defined below.
// No need for a separate app.options handler.

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/cron/schedule", async (c) => {
  try {
    const { cron } = await c.req.json();
    if (!cron || typeof cron !== 'string') {
      return c.json({ error: 'Invalid cron expression provided.' }, 400);
    }

    const interval = cronParser.default.parse(cron);
    const nextTimes = [];
    for (let i = 0; i < 5; i++) {
      nextTimes.push(interval.next().toDate());
    }

    return c.json({ schedule: nextTimes });
  } catch (error) {
    console.error("Cron parsing error:", error);
    return c.json({ error: 'Failed to parse cron expression.' }, 500);
  }
});

export default app;