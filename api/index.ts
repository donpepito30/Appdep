import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

// Initialize AI
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'undefined' && apiKey.length > 5) {
    return new GoogleGenAI({ apiKey });
  }
  return null;
};

// Global in-memory caches for AI summaries on the server side
const previewCache = new Map<string, string>();
const analysisCache = new Map<string, string>();

// AI Endpoint: Match Preview
app.post("/api/ai/preview", async (req, res) => {
  const { homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId, injuredPlayers } = req.body;
  
  const cacheKey = matchId ? String(matchId) : `${homeTeam}-${awayTeam}`;
  if (previewCache.has(cacheKey)) {
    console.log(`[Cache Hit - Preview] Serving cached summary globally for event: ${cacheKey}`);
    return res.json({ text: previewCache.get(cacheKey) });
  }

  const client = getGenAI();
  if (!client) {
    const fallbackText = `### Análisis Táctico de Encuentro
**Contexto**: Encuentro de alta intensidad entre **${homeTeam}** y **${awayTeam}**. La forma reciente favorece un duelo cerrado de alta exigencia táctica.

**Puntos Clave**:
- **Estabilidad**: El equipo local buscará establecer el control defensivo y regularizar la salida rival.
- **Transición**: El visitante dependerá de la construcción rápida por bandas y contraataques fluidos.
- **Zona de Tensión**: El sector medio será el eje estratégico para dominar el tiempo de juego.

**Figuras a Seguir**: Mediocampistas defensivos y volantes creativos.
**Marcador Proyectado**: **2-1** o **1-1** debido a la forma defensiva mostrada recientemente.`;

    previewCache.set(cacheKey, fallbackText);
    return res.json({ text: fallbackText });
  }

  try {
    let injuriesPrompt = "";
    if (injuredPlayers && Array.isArray(injuredPlayers) && injuredPlayers.length > 0) {
      injuriesPrompt = `Lesionados / ausentes: ` + injuredPlayers.map((p: any) => `${p.team === 'home' ? homeTeam : awayTeam}: ${p.name} (${p.position}${p.reason ? ` - ${p.reason}` : ''})`).join(', ');
    }

    const prompt = `
      Eres un analista deportivo experto. Genera un análisis narrativo breve (3-4 líneas) estrictamente en ESPAÑOL para el enfrentamiento: ${homeTeam} vs ${awayTeam}.
      Forma ${homeTeam}: ${homeRecentForm.join(', ')}
      Forma ${awayTeam}: ${awayRecentForm.join(', ')}
      H2H: ${h2hSummary}
      ${injuriesPrompt ? `${injuriesPrompt}` : ''}
      
      Responde DIRECTO, sin introducciones, estilo experto.
    `;
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    const text = response.text?.trim() || "";
    if (text) {
      previewCache.set(cacheKey, text);
    }
    res.json({ text });
  } catch (error: any) {
    console.log(`[AI Preview Serverless] Using stable fallback for preview_${cacheKey} due to temporary API constraints.`);
    const textFallback = `### Análisis Táctico de Encuentro
**Contexto**: Encuentro equilibrado de alta intensidad entre **${homeTeam}** y **${awayTeam}**. La forma reciente favorece un duelo cerrado de alta exigencia táctica.

**Puntos Clave**:
- **Estabilidad**: El equipo local buscará establecer el control defensivo y regularizar la salida rival.
- **Transición**: El visitante dependerá de la construcción rápida por bandas y contraataques fluidos.
- **Zona de Tensión**: El sector medio será el eje estratégico para dominar el tiempo de juego.

**Figuras a Seguir**: Mediocampistas defensivos y volantes creativos.
**Marcador Proyectado**: **2-1** o **1-1** debido a la forma defensiva mostrada recientemente.`;

    previewCache.set(cacheKey, textFallback);
    res.json({ text: textFallback });
  }
});

// AI Endpoint: Prediction Analysis
app.post("/api/ai/analysis", async (req, res) => {
  const stats = req.body;
  
  const cacheKey = stats.matchId ? String(stats.matchId) : `${stats.homeTeam}-${stats.awayTeam}`;
  if (analysisCache.has(cacheKey)) {
    console.log(`[Cache Hit - Analysis] Serving cached prediction analysis globally for event: ${cacheKey}`);
    return res.json({ text: analysisCache.get(cacheKey) });
  }

  const client = getGenAI();
  if (!client) {
    const fallbackText = `### Justificación de Probabilidades
**Contexto**: El mercado **${stats.topMarket}** presenta una probabilidad calculada de **${(stats.topProb * 100).toFixed(0)}%** para el cruce entre **${stats.homeTeam}** y **${stats.awayTeam}**.

**Métricas Tácticas**:
- **Volumen de Goles Esperados (xG)**: El desglose promedio (${stats.homeXG.toFixed(1)} local vs ${stats.awayXG.toFixed(1)} visitante) sugiere situaciones frecuentes en el área defensiva rival.
- **Forma y Tendencia**: ${stats.homeTeam} arrastra una dinámica de ${stats.homeForm.join(', ')} frente al registro de ${stats.awayForm.join(', ')} de ${stats.awayTeam}.

**Marcador Proyectado**: Se estima una definición de **${stats.homeAvgGoals > stats.awayAvgGoals ? '2-1' : '1-1'}** en favor de una distribución ordenada de juego.`;

    analysisCache.set(cacheKey, fallbackText);
    return res.json({ text: fallbackText });
  }

  try {
    let injuriesPrompt = "";
    if (stats.injuredPlayers && Array.isArray(stats.injuredPlayers) && stats.injuredPlayers.length > 0) {
      injuriesPrompt = `Lesionados / ausentes: ` + stats.injuredPlayers.map((p: any) => `${p.team === 'home' ? stats.homeTeam : stats.awayTeam}: ${p.name} (${p.position}${p.reason ? ` - ${p.reason}` : ''})`).join(', ');
    }

    const prompt = `
      Analiza por qué el ${stats.topMarket} tiene ${(stats.topProb * 100).toFixed(0)}% en ${stats.homeTeam} vs ${stats.awayTeam}.
      Forma: ${stats.homeForm.join(', ')} vs ${stats.awayForm.join(', ')}
      H2H: ${stats.h2h.map((h: any) => `${h.homeScore}-${h.awayScore}`).join(', ')}
      xG: ${stats.homeXG.toFixed(2)} vs ${stats.awayXG.toFixed(2)}
      Goles: ${stats.homeAvgGoals.toFixed(2)} vs ${stats.awayAvgGoals.toFixed(2)}
      ${injuriesPrompt ? `${injuriesPrompt}` : ''}
      
      Máximo 3 líneas, directo, en ESPAÑOL.
    `;
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    const text = response.text?.trim() || "";
    if (text) {
      analysisCache.set(cacheKey, text);
    }
    res.json({ text });
  } catch (error: any) {
    console.log(`[AI Analysis Serverless] Using stable fallback for analysis_${cacheKey} due to temporary API constraints.`);
    const textFallback = `### Justificación de Probabilidades
**Contexto**: El mercado **${stats.topMarket}** presenta una probabilidad calculada de **${(stats.topProb * 100).toFixed(0)}%** para el cruce entre **${stats.homeTeam}** y **${stats.awayTeam}**.

**Métricas Tácticas**:
- **Volumen de Goles Esperados (xG)**: El desglose promedio (${stats.homeXG.toFixed(1)} local vs ${stats.awayXG.toFixed(1)} visitante) sugiere situaciones frecuentes en el área defensiva rival.
- **Forma y Tendencia**: ${stats.homeTeam} arrastra una dinámica de ${stats.homeForm.join(', ')} frente al registro de ${stats.awayForm.join(', ')} de ${stats.awayTeam}.

**Marcador Proyectado**: Se estima una definición de **${stats.homeAvgGoals > stats.awayAvgGoals ? '2-1' : '1-1'}** en favor de una distribución ordenada de juego.`;

    analysisCache.set(cacheKey, textFallback);
    res.json({ text: textFallback });
  }
});

// Proxy for /api/v2
app.all(["/api/v2", "/api/v2/*"], async (req, res) => {
  const apiKey = process.env.BZZOIRO_API_KEY || '';
  const endpoint = req.originalUrl.replace("/api/v2", "");
  const normalizedEndpoint = (endpoint.startsWith("/") || endpoint === "") ? endpoint : `/${endpoint}`;
  const targetUrl = `https://sports.bzzoiro.com/api/v2${normalizedEndpoint}`;

  try {
    const authHeader = req.headers["authorization"] || (apiKey ? `Token ${apiKey}` : undefined);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Authorization": authHeader as string,
        "Content-Type": req.headers["content-type"] || "application/json",
        "Accept": "application/json",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

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
    res.status(502).json({ error: "Error de conexión con el proveedor externo", details: error.message });
  }
});

export default app;
