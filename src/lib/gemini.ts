// Client-side library to call backend AI endpoints
// This keeps the API Key secure on the server

const CACHE_PREFIX = 'bsd_analysis_v3_';
const PREVIEW_CACHE_PREFIX = 'bsd_preview_v3_';

export async function generateMatchPreview(
  homeTeam: string,
  awayTeam: string,
  homeRecentForm: string[],
  awayRecentForm: string[],
  h2hSummary: string,
  matchId?: string | number
): Promise<string | null> {
  const cacheKey = `${PREVIEW_CACHE_PREFIX}${matchId || `${homeTeam}-${awayTeam}`}`;
  
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  try {
    const response = await fetch('/api/ai/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary, matchId })
    });
    
    if (!response.ok) throw new Error('AI request failed');
    const data = await response.json();
    const text = data.text;

    if (text) {
      try {
        localStorage.setItem(cacheKey, text);
      } catch (e) {}
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
}

export async function generatePredictionAnalysis(stats: AnalysisStats): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}${stats.matchId || `${stats.homeTeam}-${stats.awayTeam}`}`;
  
  // Try to load from localStorage
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (e) {
    console.warn('LocalStorage not available');
  }

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
      try {
        localStorage.setItem(cacheKey, text);
      } catch (e) {
        // Handle quota exceeded
      }
    }
    return text || null;
  } catch (error) {
    console.error('Error calling AI analysis backend:', error);
    return null;
  }
}
