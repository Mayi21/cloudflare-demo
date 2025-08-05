import { Hono } from "hono";
const parser = require('cron-parser');

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/cron/schedule", async (c) => {
  try {
    const { cron } = await c.req.json();
    if (!cron || typeof cron !== 'string') {
      return c.json({ error: 'Invalid cron expression provided.' }, 400);
    }

    const interval = parser.default.parse(cron);
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