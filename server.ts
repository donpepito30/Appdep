import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { calculateHybridPrediction, transformToForm } from './src/lib/prediction';
import { getStats, getPrediction, getOdds, getFixtures } from './src/services/apiServer';

/**
 * MatchIntel Elite - Backend Architecture
 * Expertly crafted for sports analytics and AI-driven insights.
 */

// ── Rate Limiter Logic (10 requests per minute) ─────────────────────────
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

// ── Gemini AI Integration (Modern SDK) ──────────────────────────────────
const initGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'undefined' && apiKey.length > 5) {
    return new GoogleGenAI({ apiKey });
  }
  return null;
};

const ai = initGenAI();

// ── Network Resilience (Retries) ────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isTransient = error?.status === 429 || error?.status >= 500 || error?.message?.includes('high demand') || error?.message?.includes('503');
      if (!isTransient || i === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw lastError;
}

// ── Cache & Data Persistence ───────────────────────────────────────────
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const aiCache = new Map<string, { text: string; timestamp: number }>();

function cleanCache() {
  const now = Date.now();
  for (const [k, v] of aiCache.entries()) {
    if (now - v.timestamp >= CACHE_TTL) aiCache.delete(k);
  }
}

const frozenCache = new Map<string, any>();
const frozenTimestamps = new Map<string, number>();

// ── Core Server Initialization ──────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Route: Prediction Freeze (Statistical Baseline)
  app.post("/api/prediction/freeze", async (req, res) => {
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
        homeFixtures = await getFixtures(String(homeTeamId), apiKey, 180, 10);
        awayFixtures = await getFixtures(String(awayTeamId), apiKey, 180, 10);
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
      frozenTimestamps.set(String(eventId), Date.now());
      return res.json({ prediction: finalPrediction });
    } catch (error: any) {
      console.log(`[Freeze Fallback] Using baseline for ${eventId} due to data constraints.`);
      const fallback = {
        homeWinProb: 0.35, drawProb: 0.30, awayWinProb: 0.35,
        source: 'STATIC_FALLBACK', confidence: 0.4, scoreline: '1-1',
        btts: true, bttsProb: 0.52, over25Prob: 0.48
      };
      return res.json({ prediction: fallback });
    }
  });

  // API Route: AI Match Preview
  app.post("/api/ai/preview", async (req, res) => {
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) return res.status(429).json({ error: 'Rate limit exceeded (10/min)' });

    const { homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId, injuredPlayers, prediction } = req.body;
    const cacheKey = `preview_${matchId || `${homeTeam}-${awayTeam}`}`;

    if (aiCache.has(cacheKey)) {
      const cached = aiCache.get(cacheKey);
      if (Date.now() - cached!.timestamp < CACHE_TTL) return res.json({ text: cached!.text });
    }

    let targetScore = "1-1";
    if (prediction && prediction.scoreline && prediction.scoreline !== '?-?' && !prediction.scoreline.includes('?')) {
      targetScore = prediction.scoreline.replace(':', '-');
    }

    if (!ai) {
      const basicText = `### Análisis Táctico\n\nPartido de alto nivel entre **${homeTeam}** y **${awayTeam}**. Se espera un planteamiento equilibrado con énfasis en el control del mediocampo.\n\n**Marcador Proyectado**: **${targetScore}**.`;
      return res.json({ text: basicText });
    }

    try {
      const prompt = `
        Actúa como un analista experto de MatchIntel Elite. Genera un análisis táctico profesional.
        PARTIDO: ${homeTeam} vs ${awayTeam}
        FORMA: ${homeRecentForm?.join(', ')} (H) vs ${awayRecentForm?.join(', ')} (A)
        H2H: ${h2hSummary}
        PREDICCIÓN SISTEMA: ${targetScore}
        
        ESTRUCTURA:
        1. **Contexto**: Breve momento actual.
        2. **Claves Tácticas**: 3 puntos estratégicos.
        3. **Figuras a Seguir**: Jugadores determinantes.
        4. **Veredicto**: Justificar el marcador **${targetScore}**.
        
        IDIOMA: ESPAÑOL. Conciso, sin introducciones.
      `;

      const result: any = await withRetry(() => ai!.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      }));
      const text = result.text;
      
      aiCache.set(cacheKey, { text, timestamp: Date.now() });
      cleanCache();
      return res.json({ text });
    } catch (error) {
      console.log(`[AI Preview Fallback] Active for ${homeTeam} vs ${awayTeam} due to API quote/latency.`);
      const fallbackText = `### Análisis de MatchIntel\n\nEncuentro estratégico entre **${homeTeam}** y **${awayTeam}**. Los modelos de tendencia sugieren una batalla táctica intensa en transiciones.\n\n**Marcador Proyectado**: **${targetScore}**.`;
      return res.json({ text: fallbackText });
    }
  });

  // API Route: AI Deep Analysis
  app.post("/api/ai/analysis", async (req, res) => {
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) return res.status(429).json({ error: 'Rate limit exceeded' });

    const stats = req.body;
    const cacheKey = `analysis_${stats.matchId || stats.homeTeam}`;

    if (aiCache.has(cacheKey)) {
      const cached = aiCache.get(cacheKey);
      if (Date.now() - cached!.timestamp < CACHE_TTL) return res.json({ text: cached!.text });
    }

    let targetScore = stats.projectedScore || "1-1";
    if (targetScore && targetScore !== '?-?' && !targetScore.includes('?')) {
      targetScore = targetScore.replace(':', '-');
    } else {
      targetScore = "1-1";
    }

    if (!ai) {
      return res.json({ text: `### Justificación Estadística\n\nEl mercado **${stats.topMarket}** (${(stats.topProb * 100).toFixed(0)}%) se alinea con el volumen de xG proyectado.\n\n**Marcador**: **${targetScore}**.` });
    }

    try {
      const prompt = `
        Experto en Big Data Deportivo. Justifica el mercado "${stats.topMarket}" (${(stats.topProb * 100).toFixed(0)}%).
        EQUIPOS: ${stats.homeTeam} vs ${stats.awayTeam}
        MÉTRICAS: xG ${stats.homeXG.toFixed(2)} vs ${stats.awayXG.toFixed(2)}
        MARCADOR SISTEMA: ${targetScore}
        
        ESTRUCTURA:
        1. **Métricas Clave**: Basado en xG y posesión.
        2. **Selección**: Por qué el mercado "${stats.topMarket}" es valor.
        3. **Marcador Proyectado**: Confirmar el exacto **${targetScore}**.
        
        IDIOMA: ESPAÑOL. Directo al grano.
      `;

      const result: any = await withRetry(() => ai!.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      }));
      const text = result.text;
      
      aiCache.set(cacheKey, { text, timestamp: Date.now() });
      return res.json({ text });
    } catch (error) {
      console.log(`[AI Analysis Fallback] Applied for ${stats.homeTeam} analysis.`);
      const fallbackText = `### Resumen de Inteligencia\n\nEl análisis algorítmico respalda la selección de **${stats.topMarket}**. Las métricas de eficiencia ofensiva convergen en un resultado competitivo.\n\n**Marcador Proyectado**: **${targetScore}**.`;
      return res.json({ text: fallbackText });
    }
  });

  // Secured Sports API Proxy (Strictly GET)
  app.all(["/api/v2", "/api/v2/*"], async (req, res) => {
    if (req.method !== "GET") return res.status(403).json({ error: "Method Not Allowed. Only GET is permitted for external sports data." });

    const apiKey = process.env.BZZOIRO_API_KEY || '';
    const endpoint = req.originalUrl.replace("/api/v2", "");
    const normalizedEndpoint = (endpoint.startsWith("/") || endpoint === "") ? endpoint : `/${endpoint}`;

    // Security: Path Validation
    const endpointPath = normalizedEndpoint.split('?')[0];
    const isSafe = /^[a-zA-Z0-9_\-\/()%\s]+$/.test(decodeURIComponent(endpointPath));
    if (!isSafe) return res.status(403).json({ error: "Invalid path requested" });

    const targetUrl = `https://sports.bzzoiro.com/api/v2${normalizedEndpoint}`;

    const executeProxy = async (retries: number) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);

        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            ...(apiKey ? { "Authorization": `Token ${apiKey}` } : {}),
            "Accept": "application/json",
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status >= 500 && retries > 0) return executeProxy(retries - 1);

        res.status(response.status);
        response.headers.forEach((v, k) => {
          const key = k.toLowerCase();
          if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding', 'access-control-allow-origin', 'set-cookie'].includes(key)) {
            res.setHeader(k, v);
          }
        });

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      } catch (error: any) {
        if (retries > 0) return executeProxy(retries - 1);
        res.status(502).json({ error: "Sports API Connectivity Error", details: error.message });
      }
    };

    executeProxy(1);
  });

  // Vite & SPA Serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MatchIntel Elite] Production server operational on port ${PORT}`);
  });
}

startServer();
