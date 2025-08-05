
import { Hono } from "hono";
import { cors } from 'hono/cors';
const cronParser = require('cron-parser');

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Add CORS middleware
// For production, you should restrict the origin to your frontend's domain
// for better security, e.g., cors({ origin: 'https://your.frontend.com' })
app.use('/api/*', cors());

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
