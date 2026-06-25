// Client-side library to call backend AI endpoints
// This keeps the API Key secure on the server

const CACHE_PREFIX = 'bsd_analysis_v4_';
const PREVIEW_CACHE_PREFIX = 'bsd_preview_v4_';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  text: string;
  ts: number;
}

export function pruneExpiredAiCache(): void {
  try {
    const keysToRemove: string[] = [];
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(PREVIEW_CACHE_PREFIX))) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const entry = JSON.parse(raw) as CacheEntry;
            if (!entry.ts || now - entry.ts >= ONE_DAY_MS) {
              keysToRemove.push(key);
            }
          } else {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {}
}

function safeSetCache(key: string, text: string): void {
  const entry: CacheEntry = { text, ts: Date.now() };
  const serialized = JSON.stringify(entry);
  try {
    localStorage.setItem(key, serialized);
  } catch (err: any) {
    if (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      try {
        const entries: { key: string; ts: number }[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith(CACHE_PREFIX) || k.startsWith(PREVIEW_CACHE_PREFIX))) {
            try {
              const raw = localStorage.getItem(k);
              if (raw) {
                const parsed = JSON.parse(raw) as CacheEntry;
                entries.push({ key: k, ts: parsed.ts || 0 });
              } else {
                entries.push({ key: k, ts: 0 });
              }
            } catch {
              entries.push({ key: k, ts: 0 });
            }
          }
        }
        
        entries.sort((a, b) => a.ts - b.ts);
        const toDeleteCount = Math.ceil(entries.length / 2);
        for (let i = 0; i < toDeleteCount; i++) {
          localStorage.removeItem(entries[i].key);
        }
        
        localStorage.setItem(key, serialized);
      } catch (retryErr) {}
    }
  }
}

function loadFromCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry && entry.ts && Date.now() - entry.ts < ONE_DAY_MS) {
      return entry.text;
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {}
  return null;
}

export async function generateMatchPreview(
  homeTeam: string,
  awayTeam: string,
  homeRecentForm: string[],
  awayRecentForm: string[],
  h2hSummary: string,
  matchId?: string | number,
  injuredPlayers?: { name: string; position: string; reason?: string; team: string }[],
  prediction?: any
): Promise<string | null> {
  const cacheKey = `${PREVIEW_CACHE_PREFIX}${matchId || `${homeTeam}-${awayTeam}`}`;
  
  const cached = loadFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch('/api/ai/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId, injuredPlayers, prediction })
    });
    
    if (!response.ok) throw new Error('AI request failed');
    const data = await response.json();
    const text = data.text;

    if (text) {
      safeSetCache(cacheKey, text);
    }
    return text || null;
  } catch (error) {
    console.error('Error calling AI backend:', error);
    return null;
  }
}

interface AnalysisStats {
  homeTeam: string;
  awayTeam: string;
  homeForm: string[];
  awayForm: string[];
  h2h: { homeScore: number; awayScore: number }[];
  homeXG: number;
  awayXG: number;
  homeAvgGoals: number;
  awayAvgGoals: number;
  topMarket: string;
  topProb: number;
  bttsProb: number;
  over25Prob: number;
  matchId?: string | number;
  injuredPlayers?: { name: string; position: string; reason?: string; team: string }[];
  projectedScore?: string;
}

export async function generatePredictionAnalysis(stats: AnalysisStats): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}${stats.matchId || `${stats.homeTeam}-${stats.awayTeam}`}`;
  
  const cached = loadFromCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch('/api/ai/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats)
    });

    if (!response.ok) throw new Error('AI analysis failed');
    const data = await response.json();
    const text = data.text;

    if (text) {
      safeSetCache(cacheKey, text);
    }
    return text || null;
  } catch (error) {
    console.error('Error calling AI analysis backend:', error);
    return null;
  }
}
