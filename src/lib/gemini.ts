// Client-side library to call backend AI endpoints
// This keeps the API Key secure on the server

export async function generateMatchPreview(
  homeTeam: string,
  awayTeam: string,
  homeRecentForm: string[],
  awayRecentForm: string[],
  h2hSummary: string
): Promise<string | null> {
  try {
    const response = await fetch('/api/ai/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTeam, awayTeam, homeRecentForm, awayRecentForm, h2hSummary })
    });
    
    if (!response.ok) throw new Error('AI request failed');
    const data = await response.json();
    return data.text || null;
  } catch (error) {
    console.error('Error calling AI backend:', error);
    return null;
  }
}

const analysisCache = new Map<string, string>();

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
}

export async function generatePredictionAnalysis(stats: AnalysisStats): Promise<string | null> {
  const cacheKey = `${stats.homeTeam}-${stats.awayTeam}-${stats.topMarket}`;
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey)!;
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
      analysisCache.set(cacheKey, text);
    }
    return text || null;
  } catch (error) {
    console.error('Error calling AI analysis backend:', error);
    return null;
  }
}
