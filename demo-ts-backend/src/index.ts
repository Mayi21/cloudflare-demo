
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
const cronParser = require('cron-parser');

// Define the Cloudflare Bindings
interface CloudflareBindings {
    DB: D1Database;
    KV: KVNamespace;
}

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Apply CORS middleware to the entire application
app.use('*', cors({
  origin: 'https://cloudflare-demo-3py.pages.dev',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// --- Existing Routes ---
app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/cron/schedule", async (c) => {
  try {
    const { cron } = await c.req.json();
    if (!cron || typeof cron !== 'string') {
      return c.json({ error: 'Invalid cron expression provided.' }, 400);
    }

    const interval = cronParser.parseExpression(cron);
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

// --- New Short Link Routes ---

// 1. Create a short link
app.post("/api/shorten", async (c) => {
  try {
    const { url } = await c.req.json();

    // Basic URL validation
    if (!url || !url.startsWith('http')) {
      return c.json({ error: 'Invalid URL provided.' }, 400);
    }

    // Generate a 7-character unique ID and store in KV
    let code = nanoid(7);
    // Avoid rare collisions by retrying a few times if key exists
    for (let i = 0; i < 3; i++) {
      const exists = await c.env.KV.get(code);
      if (!exists) break;
      code = nanoid(7);
    }
    await c.env.KV.put(code, url);

    const shortUrl = `${new URL(c.req.url).origin}/${code}`;
    return c.json({ shortUrl });

  } catch (error) {
    console.error("Shorten URL error:", error);
    return c.json({ error: 'Failed to create short link.' }, 500);
  }
});

// 2. Redirect a short link
app.get("/:code", async (c) => {
  try {
    const { code } = c.req.param();
    const url = await c.env.KV.get(code);
    if (url) return c.redirect(url, 301);

    return c.text('Short link not found', 404);

  } catch (error) {
    console.error("Redirect error:", error);
    return c.text('Error retrieving short link', 500);
  }
});

export default app;
