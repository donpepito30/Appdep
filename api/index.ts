import express, { Request, Response, NextFunction } from "express";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import { calculateHybridPrediction, transformToForm } from '../src/lib/prediction';
import { getStats, getPrediction, getOdds, getFixtures } from '../src/services/apiServer';

/**
 * MatchIntel Elite - Serverless Backend (Vercel)
 * Architecture: TypeScript / Express / Google Gen AI
 */

const app = express();

// ── Rate Limiter (In-memory for Lambda context) ─────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Dynamic CORS Configuration ──────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  "https://ais-dev-icl7susd67gcpapakzyupo-34447954721.us-west2.run.app",
  "https://ais-pre-icl7susd67gcpapakzyupo-34447954721.us-west2.run.app"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.includes(".run.app") || origin.includes(".vercel.app")) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-forwarded-for"]
}));

app.use(express.json());

// ── Gemini AI Initialization ────────────────────────────────────────────
const initGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  return (apiKey && apiKey.length > 5) ? new GoogleGenAI({ apiKey }) : null;
};
const ai = initGenAI();

// ── Utilities ───────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isTransient = error?.status === 429 || error?.status >= 500 || error?.message?.includes('503');
      if (!isTransient || i === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw lastError;
}

const aiCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const frozenCache = new Map<string, any>();

// ── Endpoints ───────────────────────────────────────────────────────────

// [POST] /api/prediction/freeze
app.post("/api/prediction/freeze", async (req: Request, res: Response) => {
  const { eventId, homeTeamId, awayTeamId } = req.body;
  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  const apiKey = process.env.BZZOIRO_API_KEY || '';
  if (frozenCache.has(String(eventId))) return res.json({ prediction: frozenCache.get(String(eventId)) });

  try {
    const statsPromise = apiKey ? getStats(eventId, apiKey) : Promise.resolve(null);
    const predictionPromise = apiKey ? getPrediction(eventId, apiKey) : Promise.resolve(null);
    const oddsPromise = apiKey ? getOdds(eventId, apiKey) : Promise.resolve(null);

    let homeFixtures: any[] = [];
    let awayFixtures: any[] = [];
    if (apiKey && homeTeamId && awayTeamId) {
      [homeFixtures, awayFixtures] = await Promise.all([
        getFixtures(String(homeTeamId), apiKey, 180, 10),
        getFixtures(String(awayTeamId), apiKey, 180, 10)
      ]);
    }

    const [stats, mlPrediction, odds] = await Promise.all([statsPromise, predictionPromise, oddsPromise]);
    const teamForms = {
      home: homeTeamId ? transformToForm(homeFixtures, String(homeTeamId)) : null,
      away: awayTeamId ? transformToForm(awayFixtures, String(awayTeamId)) : null
    };

    const finalPrediction = calculateHybridPrediction(
      String(eventId), stats, mlPrediction?.prediction || mlPrediction, odds, teamForms, 0, { home: 0, away: 0 }
    );

    frozenCache.set(String(eventId), finalPrediction);
    return res.json({ prediction: finalPrediction });
  } catch (error) {
    console.log(`[Freeze Fallback] Triggered for ${eventId}`);
    return res.json({
      prediction: {
        homeWinProb: 0.35, drawProb: 0.30, awayWinProb: 0.35,
        source: 'STATIC_FALLBACK', confidence: 0.4, scoreline: '1-1',
        btts: true, bttsProb: 0.52, over25Prob: 0.48
      }
    });
  }
});

// [POST] /api/ai/preview
app.post("/api/ai/preview", async (req: Request, res: Response) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit (10/min)' });

  const { homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId, prediction } = req.body;
  const cacheKey = `preview_${matchId || `${homeTeam}-${awayTeam}`}`;

  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    if (Date.now() - cached!.timestamp < CACHE_TTL) return res.json({ text: cached!.text });
  }

  let targetScore = "1-1";
  if (prediction?.scoreline && prediction.scoreline !== '?-?' && !prediction.scoreline.includes('?')) {
    targetScore = prediction.scoreline.replace(':', '-');
  }

  if (!ai) {
    return res.json({ text: `### Análisis Táctico\n\nPartido entre **${homeTeam}** y **${awayTeam}**. Se espera un duelo táctico cerrado.\n\n**Marcador Proyectado**: **${targetScore}**.` });
  }

  try {
    const prompt = `Analista experto de MatchIntel Elite. PARTIDO: ${homeTeam} vs ${awayTeam}. FORMA: ${homeRecentForm?.join(', ')} vs ${awayRecentForm?.join(', ')}. H2H: ${h2hSummary}. PREDICCIÓN: ${targetScore}. Genera contexto, 3 claves tácticas y veredicto que justifique el ${targetScore}. Idioma: ESPAÑOL. Sin introducciones.`;
    const result: any = await withRetry(() => ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    }));
    const text = result.text;
    aiCache.set(cacheKey, { text, timestamp: Date.now() });
    return res.json({ text });
  } catch (error) {
    console.log(`[AI Preview Fallback] Active for ${homeTeam}`);
    return res.json({ text: `### Análisis de MatchIntel\n\nEncuentro competitivo entre **${homeTeam}** y **${awayTeam}**. La tendencia favorece un juego de alta intensidad.\n\n**Marcador Proyectado**: **${targetScore}**.` });
  }
});

// [POST] /api/ai/analysis
app.post("/api/ai/analysis", async (req: Request, res: Response) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const stats = req.body;
  const cacheKey = `analysis_${stats.matchId || stats.homeTeam}`;

  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    if (Date.now() - cached!.timestamp < CACHE_TTL) return res.json({ text: cached!.text });
  }

  let targetScore = stats.projectedScore?.replace(':', '-') || "1-1";
  if (targetScore === '?-?' || targetScore.includes('?')) targetScore = "1-1";

  if (!ai) {
    return res.json({ text: `### Justificación Estadística\n\nEl mercado **${stats.topMarket}** se fundamenta en las métricas de xG proyectadas.\n\n**Marcador**: **${targetScore}**.` });
  }

  try {
    const prompt = `Experto en Big Data. Justifica el mercado "${stats.topMarket}" (${(stats.topProb * 100).toFixed(0)}%) para ${stats.homeTeam} vs ${stats.awayTeam}. xG: ${stats.homeXG?.toFixed(2)} vs ${stats.awayXG?.toFixed(2)}. MARCADOR: ${targetScore}. Estructura: Métricas, Selección, Marcador. ESPAÑOL.`;
    const result: any = await withRetry(() => ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    }));
    const text = result.text;
    aiCache.set(cacheKey, { text, timestamp: Date.now() });
    return res.json({ text });
  } catch (error) {
    console.log(`[AI Analysis Fallback] Applied for ${stats.homeTeam}`);
    return res.json({ text: `### Resumen de Inteligencia\n\nAnálisis algorítmico respalda la selección de **${stats.topMarket}** basado en eficiencia ofensiva.\n\n**Marcador Proyectado**: **${targetScore}**.` });
  }
});

// [GET] /api/v2 Proxy (Sports Data)
app.get("/api/v2/*", async (req: Request, res: Response) => {
  const apiKey = process.env.BZZOIRO_API_KEY || '';
  const endpoint = req.originalUrl.replace("/api/v2", "");
  const targetUrl = `https://sports.bzzoiro.com/api/v2${endpoint}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { ...(apiKey ? { "Authorization": `Token ${apiKey}` } : {}), "Accept": "application/json" }
    });
    const buffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(buffer));
  } catch (error: any) {
    res.status(502).json({ error: "Sports API Error", details: error.message });
  }
});

export default app;
