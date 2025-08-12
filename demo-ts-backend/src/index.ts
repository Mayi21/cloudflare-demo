
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import { sha256 } from 'js-sha256';
const cronParser = require('cron-parser');

// Define the Cloudflare Bindings
interface CloudflareBindings {
    DB: D1Database;
    KV: KVNamespace;
    // Vars
    LOGGING_ENABLED?: string;
    IP_SALT?: string;
    METRICS_EXCLUDE_PREFIX?: string;
    SAMPLE_RATE?: string; // e.g. "1" or "0.2"
}

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Apply CORS middleware to the entire application
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// --- Request logging middleware ---
app.use('*', async (c, next) => {
  const startMs = Date.now();
  await next();

  const isEnabled = (c.env.LOGGING_ENABLED ?? 'true') === 'true';
  if (!isEnabled) return;

  try {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    const excludePrefix = c.env.METRICS_EXCLUDE_PREFIX ?? '/api/metrics';
    const isMetrics = pathname.startsWith(excludePrefix);
    const isStatic = /\.(css|js|png|jpg|jpeg|gif|svg|ico|map|txt|json)$/i.test(pathname);
    const isOptions = c.req.method === 'OPTIONS';
    if (isMetrics || isStatic || isOptions) return;

    // sampling
    const sampleRate = Number(c.env.SAMPLE_RATE ?? '1');
    if (sampleRate < 1) {
      if (Math.random() > sampleRate) return;
    }

    const durationMs = Date.now() - startMs; // reserved if we later need it
    const cf = (c.req.raw as any).cf || {};
    const country: string | null = cf.country || null;
    const colo: string | null = cf.colo || null;

    const ip = c.req.header('cf-connecting-ip') || '';
    const ipSalt = c.env.IP_SALT || 'salt';
    const ipHash = ip ? sha256(ip + ipSalt) : '';
    const ua = c.req.header('user-agent') || '';
    const referer = c.req.header('referer') || '';

    const deviceType = /bot|spider|crawl/i.test(ua)
      ? 'bot'
      : /Mobile|Android|iP(hone|od|ad)/i.test(ua)
        ? 'mobile'
        : 'desktop';

    const ts = Date.now();
    const method = c.req.method;
    const path = pathname;
    const status = c.res.status;

    await c.env.DB.prepare(
      `INSERT INTO request_logs (ts, method, path, status, referer, user_agent, country, colo, ip_hash, device_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(ts, method, path, status, referer, ua, country, colo, ipHash, deviceType)
      .run();
  } catch (err) {
    // swallow logging errors
  }
});

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

// --- Metrics APIs ---
function parseRangeToMs(range: string | undefined): number {
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return map[range ?? '24h'] ?? map['24h'];
}

app.get('/api/metrics/overview', async (c) => {
  const url = new URL(c.req.url);
  const range = url.searchParams.get('range') ?? '24h';
  const path = url.searchParams.get('path') || '';
  const sinceMs = Date.now() - parseRangeToMs(range);

  // total requests
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM request_logs WHERE ts >= ? AND (? = '' OR path = ?)`
  ).bind(sinceMs, path, path).first<{ cnt: number }>();

  // unique visitors (approx: distinct ip_hash)
  const uv = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT ip_hash) as cnt FROM request_logs WHERE ts >= ? AND (? = '' OR path = ?)`
  ).bind(sinceMs, path, path).first<{ cnt: number }>();

  // status distribution
  const statusRows = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM request_logs WHERE ts >= ? GROUP BY status ORDER BY cnt DESC`
  ).bind(sinceMs).all<{ status: number; cnt: number }>();

  // top paths
  const topPaths = await c.env.DB.prepare(
    `SELECT path, COUNT(*) as cnt FROM request_logs WHERE ts >= ? GROUP BY path ORDER BY cnt DESC LIMIT 10`
  ).bind(sinceMs).all<{ path: string; cnt: number }>();

  // top referrers
  const topReferrers = await c.env.DB.prepare(
    `SELECT COALESCE(referer,'') as referer, COUNT(*) as cnt FROM request_logs WHERE ts >= ? AND referer IS NOT NULL AND referer != '' GROUP BY referer ORDER BY cnt DESC LIMIT 10`
  ).bind(sinceMs).all<{ referer: string; cnt: number }>();

  return c.json({
    range,
    totalRequests: total?.cnt ?? 0,
    uniqueVisitors: uv?.cnt ?? 0,
    statusDistribution: statusRows?.results ?? statusRows,
    topPaths: topPaths?.results ?? topPaths,
    topReferrers: topReferrers?.results ?? topReferrers,
  });
});

app.get('/api/metrics/timeseries', async (c) => {
  const url = new URL(c.req.url);
  const range = url.searchParams.get('range') ?? '24h';
  const interval = url.searchParams.get('interval') ?? '1h';
  const path = url.searchParams.get('path') || '';
  const sinceMs = Date.now() - parseRangeToMs(range);

  if (interval === '1h' || range.endsWith('d')) {
    // use hourly aggregation for PV; UV computed from detail
    const pvRows = await c.env.DB.prepare(
      `SELECT hour_key as ts, SUM(pv) as pv
       FROM agg_metrics_hourly
       WHERE hour_key >= strftime('%Y-%m-%d %H:00:00', datetime('now', ?))
         AND country_key = '' AND status_key = -1
         AND path_key = CASE WHEN ? = '' THEN '' ELSE ? END
       GROUP BY hour_key
       ORDER BY hour_key`
    )
      .bind(`-${Math.ceil(parseRangeToMs(range) / (60 * 60 * 1000))} hours`, path, path)
      .all<{ ts: string; pv: number }>();

    const uvRows = await c.env.DB.prepare(
      `SELECT strftime('%Y-%m-%d %H:00:00', ts/1000, 'unixepoch') AS ts,
              COUNT(DISTINCT ip_hash) AS uv
       FROM request_logs
       WHERE ts >= ? AND (? = '' OR path = ?)
       GROUP BY ts
       ORDER BY ts`
    ).bind(sinceMs, path, path).all<{ ts: string; uv: number }>();

    const pvMap = new Map(pvRows.results?.map(r => [r.ts, r.pv]) ?? pvRows.map(r => [r.ts, r.pv]));
    const uvMap = new Map(uvRows.results?.map(r => [r.ts, r.uv]) ?? uvRows.map(r => [r.ts, r.uv]));
    const keys = Array.from(new Set([...pvMap.keys(), ...uvMap.keys()])).sort();
    const series = keys.map(k => ({ ts: k, pv: pvMap.get(k) ?? 0, uv: uvMap.get(k) ?? 0 }));
    return c.json({ range, interval: '1h', series });
  }

  // fallback: group by 5m on detail
  const bucket = interval === '5m' ? 5 : 15; // minutes
  const rows = await c.env.DB.prepare(
    `WITH buckets AS (
        SELECT strftime('%Y-%m-%d %H:', ts/1000, 'unixepoch') || substr('00:00', 1, 3) as hour -- placeholder
        FROM request_logs LIMIT 1
     )
     SELECT strftime('%Y-%m-%d %H:', ts/1000, 'unixepoch') || printf('%02d:00', (cast(strftime('%M', ts/1000, 'unixepoch') as integer)/?)*?) AS ts,
            COUNT(*) AS pv,
            COUNT(DISTINCT ip_hash) AS uv
     FROM request_logs
     WHERE ts >= ? AND (? = '' OR path = ?)
     GROUP BY ts
     ORDER BY ts`
  ).bind(bucket, bucket, sinceMs, path, path).all<{ ts: string; pv: number; uv: number }>();

  return c.json({ range, interval: `${bucket}m`, series: rows.results ?? rows });
});

app.get('/api/metrics/countries', async (c) => {
  const url = new URL(c.req.url);
  const range = url.searchParams.get('range') ?? '24h';
  const path = url.searchParams.get('path') || '';
  const sinceMs = Date.now() - parseRangeToMs(range);

  const rows = await c.env.DB.prepare(
    `SELECT COALESCE(country,'') as country, COUNT(*) as cnt
     FROM request_logs
     WHERE ts >= ? AND (? = '' OR path = ?)
     GROUP BY country
     ORDER BY cnt DESC
     LIMIT 250`
  ).bind(sinceMs, path, path).all<{ country: string; cnt: number }>();
  return c.json({ range, items: rows.results ?? rows });
});

app.get('/api/metrics/status', async (c) => {
  const url = new URL(c.req.url);
  const range = url.searchParams.get('range') ?? '24h';
  const path = url.searchParams.get('path') || '';
  const sinceMs = Date.now() - parseRangeToMs(range);

  const rows = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as cnt
     FROM request_logs
     WHERE ts >= ? AND (? = '' OR path = ?)
     GROUP BY status
     ORDER BY cnt DESC`
  ).bind(sinceMs, path, path).all<{ status: number; cnt: number }>();
  return c.json({ range, items: rows.results ?? rows });
});

export default app;
