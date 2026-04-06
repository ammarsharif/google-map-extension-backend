import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ENV } from './env';
import { authMiddleware } from './middleware/auth.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import searchRoutes from './routes/search.routes';

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — must be wide-open so the Chrome extension can call from any origin
app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Rate limiting on scraping endpoint ───────────────────────────────────
app.use(
  '/api/search',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, slow down' },
  })
);

// ── Health check (no auth required) ──────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: ENV.NODE_ENV,
  });
});

// ── API routes (all require x-api-key) ───────────────────────────────────
app.use('/api', authMiddleware, searchRoutes);

// ── 404 catch-all ────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res
    .status(404)
    .json({ success: false, error: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
