import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// Initialize AI
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'undefined' && apiKey.length > 5) {
    return new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return null;
};

// Simple In-Memory Cache for AI results
const aiCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 2; // 2 hours

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // AI Endpoint: Match Preview
  app.post("/api/ai/preview", async (req, res) => {
    const { homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId } = req.body;
    
    // Check Cache
    if (matchId && aiCache.has(`preview_${matchId}`)) {
      const cached = aiCache.get(`preview_${matchId}`);
      if (Date.now() - cached!.timestamp < CACHE_TTL) {
        return res.json({ text: cached!.text });
      }
    }

    const client = getGenAI();
    
    if (!client) {
      return res.json({ 
        text: `### 🤖 PROYECCIÓN IA BSD (OFFLINE)

**Contexto Táctico y Momentum:** Duelo de alta intensidad entre **${homeTeam}** y **${awayTeam}**. La forma reciente indica una ligera ventaja para el local en la fase de construcción.

**Puntos Clave (Key Storylines):**
- **Presión en Bloque:** ${homeTeam} ejecutará una presión alta para forzar el error en salida.
- **Transiciones:** ${awayTeam} depende de su velocidad por bandas para romper el repliegue.
- **Duelos Individuales:** El mediocampo será una zona de fricción constante.

**Alineaciones Probables (Expected Lineups):**
- **Home**: Jugadores clave en dinámica 4-3-3.
- **Away**: Sistema reactivo compacto.

**Mejores Selecciones (Best Picks):**
- Market: Under 3.5 Goles (@1.42)
- Market: Local o Empate (@1.28)

**Veredicto Predicción BSD:** **1-0**. Momentum local decanta el resultado.` 
      });
    }

    try {
      const prompt = `
        Eres el motor "BSD AI Analyst Elite V3". Genera un ANÁLISIS TÁCTICO DE ULTRA-PROFUNDIDAD para el partido: ${homeTeam} vs ${awayTeam}.
        
        DATOS BSD CORE:
        - Forma ${homeTeam}: ${homeRecentForm.join(', ')}
        - Forma ${awayTeam}: ${awayRecentForm.join(', ')}
        - Historial H2H: ${h2hSummary}
        
        ESTRUCTURA OBLIGATORIA (Markdown):
        1. **Contexto Táctico y Momentum**: Analiza el momento de ambos equipos, rachas y necesidad de puntos con tono experto.
        
        2. **Puntos Clave (Key Storylines)**: 
           - Genera 3 bullet points detallados sobre tácticas específicas (presión, bloques, transiciones) o roles de jugadores.
        
        3. **Alineaciones Probables (Expected Lineups)**:
           - Proyecta una lista de jugadores clave para ${homeTeam} y ${awayTeam} basada en su importancia táctica.
        
        4. **Mejores Selecciones (Best Picks)**:
           - Proporciona mercados de alto valor basados en la estadística (p.ej. Under 3.5, Over 1.5).
        
        5. **Veredicto Predicción BSD**:
           - Escribe el marcador exacto proyectado en negrita (p.ej. **2-1**) y la razón definitiva del resultado.
        
        REGLAS:
        - Idioma: ESPAÑOL.
        - Tono: Profesional, periodístico de élite.
        - Sin introducciones genéricas.
      `;
      
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      
      const resultText = response.text;
      
      // Cache Result
      if (matchId) {
        aiCache.set(`preview_${matchId}`, { text: resultText, timestamp: Date.now() });
      }

      res.json({ text: resultText });
    } catch (error: any) {
      console.error('[AI Preview Error]:', error);
      
      // If we have a generic error but it's rate limit related, explain it nicely
      if (error?.message?.includes('429') || error?.status === 429) {
        return res.json({
          text: `### 🤖 SISTEMA IA OCUPADO (RATELIMIT)
          
**Nota del Analista:** El motor BSD está procesando un alto volumen de datos tácticos en este momento. 

**Veredicto Táctico:** Basado en patrones históricos para ${homeTeam} y ${awayTeam}, se proyecta un duelo estratégico intenso.

**Marcador Proyectado Estimado:** **1-0** (Local favors).`
        });
      }

      res.json({ 
        text: `### ⚠️ ERROR DE SINCRONIZACIÓN IA
        
**Veredicto Táctico:** El motor deductivo proyecta un encuentro cerrado basado en tendencias xG.

**Puntos Clave:**
- Estabilidad defensiva de ${awayTeam} vs Efectividad de ${homeTeam}.
- Probabilidad de empate técnico: 45%.

**Marcador Proyectado:** **1-1**.` 
      });
    }
  });

  // AI Endpoint: Prediction Analysis
  app.post("/api/ai/analysis", async (req, res) => {
    const stats = req.body;
    const matchId = stats.matchId;

    // Check Cache
    if (matchId && aiCache.has(`analysis_${matchId}`)) {
      const cached = aiCache.get(`analysis_${matchId}`);
      if (Date.now() - cached!.timestamp < CACHE_TTL) {
        return res.json({ text: cached!.text });
      }
    }

    const client = getGenAI();
    
    if (!client) {
      return res.json({
        text: `### 🤖 ANÁLISIS DE MERCADO BSD (OFFLINE)

**Justificación Estadística:** La probabilidad del ${(stats.topProb * 100).toFixed(0)}% para **${stats.topMarket}** se fundamenta en la convergencia de xG (${stats.homeXG.toFixed(1)}) y la eficiencia ofensiva local.

**Puntos Clave:**
- **[Ataque]**: Convergencia de volumen ofensivo superior al 2.5 xG.
- **[Defensa]**: Vulnerabilidad en transiciones del equipo visitante.

**Veredicto Final:** Marcador proyectable de **2-0** favor local.`
      });
    }

    try {
      const prompt = `
        Eres el motor "BSD Deep Intelligence Engine V3.0". Genera un ANÁLISIS DE ULTRA-PROFUNDIDAD para el partido ${stats.homeTeam} vs ${stats.awayTeam} justificando el mercado "${stats.topMarket}" (${(stats.topProb * 100).toFixed(0)}%).
        
        MÉTRICAS BSD:
        - Forma Reciente: ${stats.homeForm.join('')} vs ${stats.awayForm.join('')}
        - xG Proyectado: ${stats.homeXG.toFixed(2)} vs ${stats.awayXG.toFixed(2)}
        - Goles/Partido: ${stats.homeAvgGoals.toFixed(2)} vs ${stats.awayAvgGoals.toFixed(2)}
        - H2H: ${stats.h2h.map((h: any) => `${h.homeScore}-${h.awayScore}`).join(', ')}
        
        ESTRUCTURA OBLIGATORIA (Markdown):
        1. **Contexto Táctico y Momentum**: Analiza el momento de ambos equipos.
        2. **Puntos Clave (Key Storylines)**: 3 puntos tácticos específicos sobre jugadores o sistemas.
        3. **Alineaciones Probables (Expected Lineups)**: Proyecta jugadores clave para ambos equipos.
        4. **Mejores Selecciones (Best Picks)**: Mercados recomendados con lógica estadística.
        5. **Veredicto Predicción BSD**: Marcador exacto en negrita y conclusión técnica final.
        
        IDIOMA: ESPAÑOL.
        TONO: Experto, profesional, analítico.
      `;
      
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      
      const resultText = response.text;
      
      // Cache Result
      if (matchId) {
        aiCache.set(`analysis_${matchId}`, { text: resultText, timestamp: Date.now() });
      }

      res.json({ text: resultText });
    } catch (error: any) {
      console.error('[AI Analysis Error]:', error);

      if (error?.message?.includes('429') || error?.status === 429) {
        return res.json({
          text: `### 🤖 SISTEMA IA OCUPADO (RATELIMIT)
          
**Análisis de Mercado:** El motor de predicción está recalibrando modelos de alta densidad.

**Puntos Clave:**
- Volumen de apuestas concentrado en mercados de goles.
- Estabilidad de cuotas indica mercado eficiente.

**Veredicto Proyectado:** Superioridad táctica de ${stats.homeTeam} confirmada.`
        });
      }

      res.json({
        text: `### ⚠️ ERROR DE ANÁLISIS TÉCNICO
        
**Análisis Táctico:** La probabilidad para ${stats.topMarket} se basa en la superioridad estructural de ${stats.homeTeam}.

**Puntos Clave:**
- Tendencia H2H favorece el volumen de goles.
- Curva de xG ascendente en los últimos encuentros.`
      });
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
