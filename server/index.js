import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { purgeDemoUsers } from './demo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIAPIPE = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');

// Google's hosted MediaPipe Pose Landmarker (lite). Set POSE_MODEL_URL to use another
// copy, or POSE_MODEL_FILE to serve a local file (useful where Google is blocked).
export const DEFAULT_POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LOCAL_MODEL_PATH = '/vendor/pose_landmarker.task';

function buildCsp(poseModelUrl) {
  const connect = ["'self'"];
  if (/^https:\/\//.test(poseModelUrl)) connect.push(new URL(poseModelUrl).origin);
  return [
    "default-src 'self'",
    // MediaPipe compiles WebAssembly; 'wasm-unsafe-eval' allows that and nothing else
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function createApp(options = {}) {
  const env = process.env;
  const opts = {
    dbPath: options.dbPath ?? env.DB_PATH ?? path.join(ROOT, 'data', 'glidepath.db'),
    openaiKey: options.openaiKey !== undefined ? options.openaiKey : env.OPENAI_API_KEY || null,
    visionModel: options.visionModel ?? env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
    imageDetail: options.imageDetail ?? env.OPENAI_IMAGE_DETAIL ?? 'auto',
    recognizeDailyLimit: options.recognizeDailyLimit ?? Number(env.RECOGNIZE_DAILY_LIMIT || 30),
    demoUsesAi: options.demoUsesAi ?? env.DEMO_USES_AI === '1',
    trustProxy: options.trustProxy ?? env.TRUST_PROXY === '1',
    authLimit: options.authLimit,
    demoLimit: options.demoLimit,
    fetchImpl: options.fetchImpl,
    poseModelFile: options.poseModelFile ?? env.POSE_MODEL_FILE ?? null,
    poseModelUrl: options.poseModelUrl ?? env.POSE_MODEL_URL ?? DEFAULT_POSE_MODEL_URL,
    log: options.log ?? ((m) => console.error(m)),
  };
  if (opts.poseModelFile) opts.poseModelUrl = LOCAL_MODEL_PATH;
  const CSP = buildCsp(opts.poseModelUrl);

  const db = openDb(opts.dbPath);
  const app = express();
  app.disable('x-powered-by');
  if (opts.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    next();
  });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, createApi(db, opts));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // MediaPipe Tasks Vision (Apache-2.0), served unmodified from node_modules
  const week = { maxAge: '7d' };
  app.get('/vendor/mediapipe/vision_bundle.mjs', (req, res) => res.sendFile(path.join(MEDIAPIPE, 'vision_bundle.mjs'), week));
  app.use('/vendor/mediapipe/wasm', express.static(path.join(MEDIAPIPE, 'wasm'), week));
  if (opts.poseModelFile) {
    if (!fs.existsSync(opts.poseModelFile)) opts.log(`[pose] POSE_MODEL_FILE not found: ${opts.poseModelFile}`);
    app.get(LOCAL_MODEL_PATH, (req, res) => res.sendFile(path.resolve(opts.poseModelFile), week));
  }

  app.use(express.static(path.join(ROOT, 'public'), {
    setHeaders(res, file) {
      if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(file)) res.set('Cache-Control', 'no-cache');
    },
  }));

  purgeDemoUsers(db);
  const purge = setInterval(() => purgeDemoUsers(db), 3600 * 1000);
  purge.unref();

  return { app, db, opts, close: () => { clearInterval(purge); db.close(); } };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { app, opts } = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Glidepath running on http://localhost:${port}`);
    console.log(opts.openaiKey ? `Photo recognition: OpenAI (${opts.visionModel})` : 'Photo recognition: demo mode (no OPENAI_API_KEY)');
  });
}
