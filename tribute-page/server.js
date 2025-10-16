import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Ensure directories
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load deceased config
const deceasedConfigPath = path.join(__dirname, 'config', 'deceased.json');
let deceasedConfig = {
  slug: 'honored-deceased',
  fullName: 'Honored Deceased',
  headline: 'A life of service and excellence.',
  coverImage: '/images/cover.jpg',
  gallery: [],
  autoApprove: true,
  sunrise: null,
  sunset: null
};
try {
  const raw = fs.readFileSync(deceasedConfigPath, 'utf8');
  deceasedConfig = JSON.parse(raw);
} catch (err) {
  // Keep defaults if file missing; will log below
}

// Initialize DB
const dbPath = path.join(dataDir, 'tributes.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS tributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deceased_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    organization TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tributes_deceased_created_at
    ON tributes(deceased_slug, created_at DESC);
`);

const insertTributeStmt = db.prepare(`
  INSERT INTO tributes (deceased_slug, name, title, organization, message, status)
  VALUES (@deceased_slug, @name, @title, @organization, @message, @status)
`);
const selectTributesStmt = db.prepare(`
  SELECT id, name, title, organization, message, created_at
  FROM tributes
  WHERE deceased_slug = @slug AND status = 'published'
  ORDER BY datetime(created_at) DESC
  LIMIT 200
`);

// Middlewares
app.use(morgan('tiny'));
app.use(compression());
app.use(express.json({ limit: '12kb' }));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        "font-src": ["'self'", 'https://fonts.gstatic.com'],
        "img-src": ["'self'", 'data:'],
        "connect-src": ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: '1h', etag: true }));

// API routes
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/deceased', (_req, res) => {
  res.json({
    slug: deceasedConfig.slug,
    fullName: deceasedConfig.fullName,
    headline: deceasedConfig.headline,
    coverImage: deceasedConfig.coverImage,
    gallery: Array.isArray(deceasedConfig.gallery) ? deceasedConfig.gallery : [],
    sunrise: deceasedConfig.sunrise || null,
    sunset: deceasedConfig.sunset || null
  });
});

app.get('/api/tributes', (_req, res) => {
  const items = selectTributesStmt.all({ slug: deceasedConfig.slug });
  res.json({ items });
});

const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

function sanitizeText(value, { min = 0, max = 2000 } = {}) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < min) return '';
  if (trimmed.length > max) return trimmed.slice(0, max);
  return trimmed;
}

app.post('/api/tributes', postLimiter, (req, res) => {
  const { name, title, organization, message } = req.body || {};

  const cleaned = {
    name: sanitizeText(name, { min: 2, max: 120 }),
    title: sanitizeText(title, { min: 0, max: 120 }),
    organization: sanitizeText(organization, { min: 0, max: 160 }),
    message: sanitizeText(message, { min: 2, max: 2000 })
  };

  if (!cleaned.name || !cleaned.message) {
    return res.status(400).json({ ok: false, error: 'Name and message are required.' });
  }

  const record = {
    deceased_slug: deceasedConfig.slug,
    name: cleaned.name,
    title: cleaned.title || null,
    organization: cleaned.organization || null,
    message: cleaned.message,
    status: deceasedConfig.autoApprove === false ? 'pending' : 'published'
  };

  try {
    insertTributeStmt.run(record);
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to save tribute.' });
  }
});

// Fallback to index.html for root
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Tribute page listening on http://localhost:${PORT}`);
  });
}

export default app;
