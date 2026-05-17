import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// Initialize AI
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'undefined' && apiKey.length > 5) {
    return new GoogleGenAI({ apiKey });
  }
  return null;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // AI Endpoint: Match Preview
  app.post("/api/ai/preview", async (req, res) => {
    const { homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary } = req.body;
    const client = getGenAI();
    if (!client) return res.status(503).json({ error: "AI Service not configured" });

    try {
      const prompt = `
        Eres un analista deportivo experto. Genera un análisis narrativo breve (3-4 líneas) estrictamente en ESPAÑOL para el enfrentamiento: ${homeTeam} vs ${awayTeam}.
        Forma ${homeTeam}: ${homeRecentForm.join(', ')}
        Forma ${awayTeam}: ${awayRecentForm.join(', ')}
        H2H: ${h2hSummary}
        
        Responde DIRECTO, sin introducciones, estilo experto.
      `;
      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      res.json({ text: response.text?.trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Endpoint: Prediction Analysis
  app.post("/api/ai/analysis", async (req, res) => {
    const stats = req.body;
    const client = getGenAI();
    if (!client) return res.status(503).json({ error: "AI Service not configured" });

    try {
      const prompt = `
        Analiza por qué el ${stats.topMarket} tiene ${(stats.topProb * 100).toFixed(0)}% en ${stats.homeTeam} vs ${stats.awayTeam}.
        Forma: ${stats.homeForm.join(', ')} vs ${stats.awayForm.join(', ')}
        H2H: ${stats.h2h.map((h: any) => `${h.homeScore}-${h.awayScore}`).join(', ')}
        xG: ${stats.homeXG.toFixed(2)} vs ${stats.awayXG.toFixed(2)}
        Goles: ${stats.homeAvgGoals.toFixed(2)} vs ${stats.awayAvgGoals.toFixed(2)}
        
        Máximo 3 líneas, directo, en ESPAÑOL.
      `;
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ text: response.text?.trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Middleware to proxy /api/v2 traffic to the external BZZOIRO API
  app.all(["/api/v2", "/api/v2/*"], async (req, res) => {
    const apiKey = process.env.BZZOIRO_API_KEY || '';
    if (!apiKey) {
      console.warn('[BSD Proxy] BZZOIRO_API_KEY no configurada - las peticiones a la API fallarán');
    }
    
    // Log incoming proxy request (Disabled to reduce log volume)
    // console.log(`[Proxy Request] ${req.method} ${req.originalUrl}`);

    if (!process.env.GEMINI_API_KEY) {
      console.warn('[Gemini] GEMINI_API_KEY no detectada en server.ts - las funciones AI podrían no estar disponibles');
    }

    const endpoint = req.originalUrl.replace("/api/v2", "");
    // Ensure endpoint starts with a slash if it's not empty and doesn't have one
    const normalizedEndpoint = (endpoint.startsWith("/") || endpoint === "") ? endpoint : `/${endpoint}`;
    const targetUrl = `https://sports.bzzoiro.com/api/v2${normalizedEndpoint}`;

    const doProxy = async (retries: number): Promise<void> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout for server

        const authHeader = req.headers["authorization"] || (apiKey ? `Token ${apiKey}` : undefined);

        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            "Authorization": authHeader as string,
            "Content-Type": req.headers["content-type"] || "application/json",
            "Accept": "application/json",
          },
          body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status >= 500 && retries > 0) {
          // Silent retry
          return doProxy(retries - 1);
        }

        const contentType = response.headers.get("content-type");
        // console.log(`[Proxy Response] ${response.status} from ${targetUrl} (${contentType})`);

        res.status(response.status);
        response.headers.forEach((value, key) => {
          const lowerKey = key.toLowerCase();
          if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding', 'access-control-allow-origin', 'set-cookie'].includes(lowerKey)) {
            res.setHeader(key, value);
          }
        });

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      } catch (error: any) {
        if (retries > 0) {
          // Silent retry
          return doProxy(retries - 1);
        }
        // console.error(`[Proxy Final Error] ${targetUrl}:`, error.message || error);
        res.status(502).json({ 
          error: "Error de conexión con el proveedor externo",
          details: error.message 
        });
      }
    };

    doProxy(1);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production fallbacks
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
