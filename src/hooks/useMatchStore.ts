import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Event, Stats, Prediction, Incident, TeamForm, OddMarket, LineupData, EventMetadata, PlayerMatchStats, EnrichedEventData } from '../types';
import { calculateHybridPrediction, calculateMomentum, calculatePoissonModel } from '../lib/prediction';

export const dayLabels = {
  today: '🔥 HOY',
  tomorrow: '📅 MAÑANA',
  dayAfter: '📆 PASADO MAÑANA',
  later: '📋 PRÓXIMOS'
};

const getDateCategory = (dateStr: string): 'today' | 'tomorrow' | 'dayAfter' | 'later' => {
  const date = new Date(dateStr);
  const now = new Date();
  
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);
  
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (target.getTime() === today.getTime()) return 'today';
  if (target.getTime() === tomorrow.getTime()) return 'tomorrow';
  if (target.getTime() === dayAfter.getTime()) return 'dayAfter';
  return 'later';
};

// --- SINGLETON STATE ---
let g_matches: Event[] = [];
let g_upcomingMatches: Event[] = [];
let g_teamLogos: Record<string, string> = (() => {
  try {
    const saved = localStorage.getItem('bsd_team_logos');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
})();
let g_teamNames: Record<string, string> = (() => {
  try {
    const saved = localStorage.getItem('bsd_team_names');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
})();
let g_selectedMatchId: string | null = null;
let g_liveData: any = {
  stats: null,
  prediction: null,
  odds: null,
  incidents: [],
  momentum: 0,
  forms: { home: null, away: null },
  metadata: null,
  lineups: null,
  playerStats: [],
};
let g_lastStats: Stats | null = null;
let g_loading = true;
let g_apiError: string | null = null;
let g_v2Predictions: { event: Event, prediction: Prediction }[] = [];
let g_enrichedData: Record<string, EnrichedEventData> = {};
let g_frozenPredictions: Record<string, Prediction> = {};
let g_teamForms: { home: TeamForm | null, away: TeamForm | null } = { home: null, away: null };
let g_slowData: any = {
  metadata: null,
  lineups: null,
  playerStats: [],
};

const triedData = new Set<string>();
Object.keys(g_teamLogos).forEach(id => triedData.add(id));
const requestedFrozen = new Set<string>();

// Suscriptores
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach(fn => fn());
}

// Transform raw fixtures to TeamForm
const transformToForm = (fixtures: any[], teamId: string): TeamForm => {
  const recent = (fixtures || []).slice(0, 10).map(f => {
    const isHome = String(f.homeTeamId || f.home_team_id) === String(teamId);
    const homeScore = f.homeScore ?? f.home_score ?? 0;
    const awayScore = f.awayScore ?? f.away_score ?? 0;
    const goalsFor = isHome ? homeScore : awayScore;
    const goalsAgainst = isHome ? awayScore : homeScore;
    
    // Try to find xG in various places
    let xgH = f.xgHome ?? f.xg_home;
    let xgA = f.xgAway ?? f.xg_away;
    
    // If xG is missing, try to find it in embedded stats if they exist
    if ((xgH === undefined || xgH === null) && f.stats) {
      const statsArr = Array.isArray(f.stats) ? f.stats : (f.stats.results || []);
      if (Array.isArray(statsArr)) {
        statsArr.forEach((s: any) => {
          const type = (s.type || s.name || '').toLowerCase();
          if (type === 'xg' || type.includes('expected goals')) {
            xgH = s.home ?? s.value_home;
            xgA = s.away ?? s.value_away;
          }
        });
      }
    }

    const xgFor = isHome ? (xgH ?? 0) : (xgA ?? 0);
    const xgAgainst = isHome ? (xgA ?? 0) : (xgH ?? 0);

    return {
      result: goalsFor > goalsAgainst ? 'W' as const : goalsFor === goalsAgainst ? 'D' as const : 'L' as const,
      score: `${homeScore}-${awayScore}`,
      opponent: isHome ? (f.awayTeamName || f.away_team_name || f.awayTeam) : (f.homeTeamName || f.home_team_name || f.homeTeam),
      xg: typeof xgFor === 'number' ? xgFor : (Number(xgFor) || 0),
      xgAgainst: typeof xgAgainst === 'number' ? xgAgainst : (Number(xgAgainst) || 0),
      date: f.date || f.event_date || f.startTime,
      goalsFor,
      goalsAgainst
    };
  });

  const totalMatches = recent.length || 1;
  const avgGoalsFor = recent.reduce((acc, r) => acc + r.goalsFor, 0) / totalMatches;
  const avgGoalsAgainst = recent.reduce((acc, r) => acc + r.goalsAgainst, 0) / totalMatches;
  const avgXGFor = recent.reduce((acc, r) => acc + r.xg, 0) / totalMatches;
  const avgXGAgainst = recent.reduce((acc, r) => acc + r.xgAgainst, 0) / totalMatches;

  return {
    recent,
    avgXGFor,
    avgXGAgainst,
    avgGoalsFor,
    avgGoalsAgainst
  };
};

const fetchMissingData = async (events: any[]) => {
  const missing = new Set<string>();
  events.forEach(e => {
    const hId = e.homeTeamId;
    const aId = e.awayTeamId;
    
    if (hId && !triedData.has(hId)) {
      if (!e.homeLogo || e.homeTeam === 'Unknown Home' || e.homeTeam.includes('Unknown')) {
        missing.add(hId);
      } else {
        triedData.add(hId);
      }
    }
    if (aId && !triedData.has(aId)) {
      if (!e.awayLogo || e.awayTeam === 'Unknown Away' || e.awayTeam.includes('Unknown')) {
        missing.add(aId);
      } else {
        triedData.add(aId);
      }
    }
  });

  if (missing.size === 0) return;

  missing.forEach(id => triedData.add(id));

  const newLogos: Record<string, string> = {};
  const newNames: Record<string, string> = {};

  const BATCH_SIZE = 5;
  const missingArray = Array.from(missing);
  
  for (let i = 0; i < missingArray.length; i += BATCH_SIZE) {
    const batch = missingArray.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (id) => {
      try {
        const team = await api.getTeam(id);
        if (team) {
          const logo = team.logo || team.logo_url || team.image_path;
          if (logo) newLogos[id] = logo;
          if (team.name) newNames[id] = team.name;
        }
      } catch(e) {}
    }));
  }

  let changed = false;
  if (Object.keys(newLogos).length > 0) {
    g_teamLogos = { ...g_teamLogos, ...newLogos };
    localStorage.setItem('bsd_team_logos', JSON.stringify(g_teamLogos));
    changed = true;
  }
  if (Object.keys(newNames).length > 0) {
    g_teamNames = { ...g_teamNames, ...newNames };
    localStorage.setItem('bsd_team_names', JSON.stringify(g_teamNames));
    changed = true;
  }
  if (changed) {
    emit();
  }
};

const enrichEventsInParallel = async (eventsList: Event[]) => {
  if (!eventsList || eventsList.length === 0) return;

  const BATCH_SIZE = 5;
  for (let i = 0; i < eventsList.length; i += BATCH_SIZE) {
    const batch = eventsList.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (m) => {
        try {
          const [predRes, oddsRes, compRes, standingsRes, h2hRes, lineupsRes] = await Promise.allSettled([
            api.getPredictionDetailed(m.id),
            api.getOdds(m.id),
            api.compareOdds(m.id),
            m.leagueId ? api.getStandings(m.leagueId) : Promise.resolve(null),
            api.getH2H(m.id),
            api.getEventLineups(m.id)
          ]);

          const prediction = predRes.status === 'fulfilled' ? predRes.value : null;
          const odds = oddsRes.status === 'fulfilled' ? oddsRes.value : null;
          const comparison = compRes.status === 'fulfilled' ? compRes.value : null;
          const standings = standingsRes.status === 'fulfilled' ? standingsRes.value : null;
          const h2h = h2hRes.status === 'fulfilled' ? h2hRes.value : null;
          const lineups = lineupsRes.status === 'fulfilled' ? lineupsRes.value : null;

          g_enrichedData = {
            ...g_enrichedData,
            [m.id]: {
              prediction,
              odds,
              comparison,
              standings,
              h2h,
              lineups
            }
          };
          emit();
        } catch (err) {
          console.error(`Error enriching match ${m.id}:`, err);
        }
      })
    );
  }
};

let isInitializing = false;
let isInitialized = false;

const initStore = async () => {
  if (isInitialized || isInitializing) return;
  isInitializing = true;
  
  try {
    g_loading = true;
    g_apiError = null;
    emit();
    
    const [events, upcoming, v2Preds] = await Promise.all([
      api.getLiveEvents(),
      api.getPredictionsPrimaryEvents(),
      api.getV2Predictions()
    ]);

    g_matches = events || [];
    g_upcomingMatches = upcoming || [];
    g_v2Predictions = v2Preds || [];
    
    fetchMissingData(g_matches.concat(g_upcomingMatches, (v2Preds || []).map(p => p.event)));
    
    if (g_matches.length > 0 && !g_selectedMatchId) {
      g_selectedMatchId = g_matches[0].id;
    } else if (g_upcomingMatches.length > 0 && !g_selectedMatchId) {
      g_selectedMatchId = g_upcomingMatches[0].id;
    }
    
    g_loading = false;
    isInitialized = true;
    isInitializing = false;
    emit();

    if (g_upcomingMatches.length > 0) {
      enrichEventsInParallel(g_upcomingMatches);
    }
  } catch (err: any) {
    g_loading = false;
    isInitializing = false;
    if (err.message && (err.message.includes('API Key no configurada') || err.message.includes('API Key inválida'))) {
      g_apiError = 'API_KEY_MISSING';
    } else {
      g_apiError = err.message || 'Error occurred';
    }
    emit();
  }
};

let pollIntervalId: any = null;

const startPolling = () => {
  if (pollIntervalId) return;
  
  const pollEvents = async () => {
    try {
      const [fresh, freshV2, freshUpcoming] = await Promise.all([
        api.getLiveEvents(),
        api.getV2Predictions(),
        api.getPredictionsPrimaryEvents()
      ]);
      
      const updatedEvents = fresh.filter(e => {
        const existing = g_matches.find(m => m.id === e.id);
        return !existing || !existing.last_updated || (e.last_updated && new Date(e.last_updated) > new Date(existing.last_updated));
      });

      let changed = false;
      if (updatedEvents.length > 0) {
        g_matches = fresh;
        fetchMissingData(fresh);
        changed = true;
      }

      if (freshV2 && freshV2.length > 0) {
        g_v2Predictions = freshV2;
        changed = true;
      }

      if (freshUpcoming && freshUpcoming.length > 0) {
        g_upcomingMatches = freshUpcoming;
        enrichEventsInParallel(freshUpcoming);
        changed = true;
      }
      
      if (changed) {
        emit();
      }
    } catch(e) {}
  };
  
  pollIntervalId = setInterval(pollEvents, 35000);
};

const syncMatchDetail = async (id: string, options: { stats?: boolean, slow?: boolean, forms?: boolean }) => {
  if (!id) return;
  
  try {
    const currentMatch = g_matches.find(m => m.id === id) || g_upcomingMatches.find(m => m.id === id);
    const updates: any = {};
    
    const promises = [];
    
    if (options.stats) {
      promises.push(api.getStats(id).then(s => updates.stats = s));
      promises.push(api.getPredictionDetailed(id).then(p => updates.mlPrediction = p));
      promises.push(api.getOdds(id).then(o => updates.odds = o));
      promises.push(api.getIncidents(id).then(inc => updates.incidents = inc));
    }
    
    if (options.slow) {
      promises.push(api.getEventMetadata(id).then(m => updates.metadata = m));
      promises.push(api.getEventLineups(id).then(l => updates.lineups = l));
      promises.push(api.getEventPlayerStats(id).then(ps => updates.playerStats = ps));
    }
    
    if (options.forms && currentMatch?.homeTeamId && currentMatch?.awayTeamId) {
      promises.push(api.getFixtures(currentMatch.homeTeamId, 180).then(f => updates.homeFixtures = f));
      promises.push(api.getFixtures(currentMatch.awayTeamId, 180).then(f => updates.awayFixtures = f));
    }
    
    await Promise.all(promises);
    
    if (updates.stats !== undefined) {
      let finalPrediction: Prediction | null = null;

      if (!requestedFrozen.has(id)) {
        requestedFrozen.add(id);
        try {
          const response = await fetch('/api/prediction/freeze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              eventId: id, 
              homeTeamId: currentMatch?.homeTeamId, 
              awayTeamId: currentMatch?.awayTeamId 
            })
          });
          if (response.ok) {
            const data = await response.json();
            finalPrediction = data.prediction;
            g_frozenPredictions = { ...g_frozenPredictions, [id]: data.prediction };
          } else {
            throw new Error('Frozen prediction request failed');
          }
        } catch (e) {
          console.warn('Falling back to local prediction for', id);
          finalPrediction = calculateHybridPrediction(
            id, 
            updates.stats, 
            updates.mlPrediction, 
            updates.odds, 
            g_teamForms,
            0,
            { home: 0, away: 0 }
          );
          g_frozenPredictions = { ...g_frozenPredictions, [id]: finalPrediction };
        }
      } else {
        finalPrediction = g_frozenPredictions[id] || null;
        if (!finalPrediction) {
          finalPrediction = calculateHybridPrediction(
            id, 
            updates.stats, 
            updates.mlPrediction, 
            updates.odds, 
            g_teamForms,
            0,
            { home: 0, away: 0 }
          );
        }
      }

      const momentum = updates.stats ? calculateMomentum(updates.stats) : 0;
      
      g_lastStats = updates.stats;
      g_liveData = {
        ...g_liveData,
        stats: updates.stats || g_liveData.stats,
        prediction: finalPrediction,
        odds: updates.odds || g_liveData.odds,
        incidents: updates.incidents || g_liveData.incidents,
        momentum
      };
    }
    
    if (updates.metadata !== undefined || updates.lineups !== undefined || updates.playerStats !== undefined) {
      g_slowData = {
        metadata: updates.metadata || null,
        lineups: updates.lineups || null,
        playerStats: updates.playerStats || []
      };
    }
    
    if (updates.homeFixtures && currentMatch?.homeTeamId && updates.awayFixtures && currentMatch?.awayTeamId) {
      g_teamForms = {
        home: transformToForm(updates.homeFixtures, currentMatch.homeTeamId),
        away: transformToForm(updates.awayFixtures, currentMatch.awayTeamId)
      };
    }
    
    emit();
  } catch (err) {
    console.error("Sync error:", err);
  }
};

export function useMatchStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => {
      setTick(t => t + 1);
    };
    listeners.add(handleUpdate);
    
    initStore();
    startPolling();
    
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const setSelectedMatchId = useCallback((id: string | null) => {
    g_selectedMatchId = id;
    emit();
  }, []);

  const combinedLiveData = useMemo(() => {
    return {
      ...g_liveData,
      ...g_slowData,
      forms: g_teamForms
    };
  }, [g_liveData, g_slowData, g_teamForms]);

  const matchesWithLogos = useMemo(() => {
    return g_matches.map(m => ({
      ...m,
      homeTeam: (m.homeTeamId ? g_teamNames[m.homeTeamId] : null) || m.homeTeam,
      awayTeam: (m.awayTeamId ? g_teamNames[m.awayTeamId] : null) || m.awayTeam,
      homeLogo: m.homeLogo || (m.homeTeamId ? g_teamLogos[m.homeTeamId] : undefined),
      awayLogo: m.awayLogo || (m.awayTeamId ? g_teamLogos[m.awayTeamId] : undefined),
    }));
  }, [g_matches, g_teamNames, g_teamLogos]);

  const upcomingMatchesWithLogos = useMemo(() => {
    return g_upcomingMatches.map(m => ({
      ...m,
      homeTeam: (m.homeTeamId ? g_teamNames[m.homeTeamId] : null) || m.homeTeam,
      awayTeam: (m.awayTeamId ? g_teamNames[m.awayTeamId] : null) || m.awayTeam,
      homeLogo: m.homeLogo || (m.homeTeamId ? g_teamLogos[m.homeTeamId] : undefined),
      awayLogo: m.awayLogo || (m.awayTeamId ? g_teamLogos[m.awayTeamId] : undefined),
    }));
  }, [g_upcomingMatches, g_teamNames, g_teamLogos]);

  const v2PredictionsWithLogos = useMemo(() => {
    return g_v2Predictions.map(p => ({
      event: {
        ...p.event,
        homeTeam: (p.event.homeTeamId ? g_teamNames[p.event.homeTeamId] : null) || p.event.homeTeam,
        awayTeam: (p.event.awayTeamId ? g_teamNames[p.event.awayTeamId] : null) || p.event.awayTeam,
        homeLogo: p.event.homeLogo || (p.event.homeTeamId ? g_teamLogos[p.event.homeTeamId] : undefined),
        awayLogo: p.event.awayLogo || (p.event.awayTeamId ? g_teamLogos[p.event.awayTeamId] : undefined),
      },
      prediction: p.prediction
    }));
  }, [g_v2Predictions, g_teamLogos, g_teamNames]);

  const getMarketProbabilities = useCallback((match: Event) => {
    const frozen = g_frozenPredictions[match.id];
    if (frozen) {
      const bProb = frozen.bttsProb || 0.5;
      const oProb = frozen.over25Prob || 0.5;
      const o15Prob = frozen.over15Prob || (oProb * 1.3);
      const o35Prob = frozen.over35Prob || (oProb * 0.6);
      const hProb = frozen.homeWinProb;
      const dProb = frozen.drawProb;
      const aProb = frozen.awayWinProb;
      
      const win1X2 = Math.max(hProb, dProb, aProb);
      const label1X2 = hProb >= Math.max(dProb, aProb) ? 'Local' : (aProb >= dProb ? 'Visitante' : 'Empate');
      
      return [
        { market: 'BTTS', label: 'Ambos Marcan', prob: bProb },
        { market: 'OVER', label: 'Over 2.5', prob: oProb },
        { market: 'OVER15', label: 'Over 1.5', prob: o15Prob },
        { market: 'OVER35', label: 'Over 3.5', prob: o35Prob },
        { market: '1X2', label: label1X2, prob: win1X2 }
      ].sort((a, b) => b.prob - a.prob);
    }

    const m = match as any;
    let hProb = m.homeWinProb || 0;
    let dProb = m.drawProb || 0;
    let aProb = m.awayWinProb || 0;
    let bProb = m.bttsProb || 0;
    let oProb = m.over25Prob || 0;
    let o15Prob = m.over15Prob || 0;
    let o35Prob = m.over35Prob || 0;

    if (hProb === 0) {
      const v2Match = g_v2Predictions.find(p => p.event.id === match.id);
      if (v2Match) {
         hProb = v2Match.prediction.homeWinProb || 0;
         dProb = v2Match.prediction.drawProb || 0;
         aProb = v2Match.prediction.awayWinProb || 0;
         bProb = v2Match.prediction.bttsProb || 0;
         oProb = v2Match.prediction.over25Prob || 0;
         o15Prob = v2Match.prediction.over15Prob || 0;
         o35Prob = v2Match.prediction.over35Prob || 0;
      }
    }

    if (hProb === 0) {
      const matchForms = match.id === g_selectedMatchId ? g_teamForms : { home: null, away: null };
      if (matchForms.home && matchForms.away) {
        const pred = calculatePoissonModel(matchForms.home, matchForms.away);
        hProb = pred.homeWinProb;
        dProb = pred.drawProb;
        aProb = pred.awayWinProb;
        bProb = pred.bttsProb;
        oProb = pred.over25Prob;
        o15Prob = pred.over15Prob || (oProb * 1.3);
        o35Prob = pred.over35Prob || (oProb * 0.6);
      } else if (match.xgHome || match.xgAway) {
        const xgH = match.xgHome || 0.8;
        const xgA = match.xgAway || 0.8;
        
        const poisson = (lambda: number, k: number) => {
          const exp = Math.exp(-lambda);
          const pow = Math.pow(lambda, k);
          let fact = 1;
          for (let i = 1; i <= k; i++) fact *= i;
          return (exp * pow) / fact;
        };

        hProb = 0; dProb = 0; aProb = 0; bProb = 0; oProb = 0; o15Prob = 0; o35Prob = 0;
        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 7; j++) {
            const p = poisson(xgH, i) * poisson(xgA, j);
            if (i > j) hProb += p;
            else if (j > i) aProb += p;
            else dProb += p;
            if (i > 0 && j > 0) bProb += p;
            if (i + j > 1.5) o15Prob += p;
            if (i + j > 2.5) oProb += p;
            if (i + j > 3.5) o35Prob += p;
          }
        }
      } else {
        hProb = 0.38; dProb = 0.28; aProb = 0.34; bProb = 0.48; oProb = 0.45; o15Prob = 0.72; o35Prob = 0.22;
      }
    }

    const win1X2 = Math.max(hProb, dProb, aProb);
    const label1X2 = hProb >= Math.max(dProb, aProb) ? 'Local' : (aProb >= dProb ? 'Visitante' : 'Empate');

    return [
      { market: 'BTTS', label: 'Ambos Marcan', prob: bProb },
      { market: 'OVER', label: 'Over 2.5', prob: oProb },
      { market: 'OVER15', label: 'Over 1.5', prob: o15Prob },
      { market: 'OVER35', label: 'Over 3.5', prob: o35Prob },
      { market: '1X2', label: label1X2, prob: win1X2 }
    ].sort((a, b) => b.prob - a.prob);
  }, [g_v2Predictions, g_selectedMatchId, g_teamForms, g_frozenPredictions]);

  const getMatchBadge = useCallback((match: Event) => {
    const probs = getMarketProbabilities(match);
    const top = probs[0];
    
    let confidence: 'alta' | 'media' | 'baja' = 'baja';
    let stars = '⭐';
    let bgClass = 'bg-slate-400';

    if (top.prob > 0.75) {
      confidence = 'alta';
      stars = '⭐⭐⭐';
      bgClass = 'bg-brand-green';
    } else if (top.prob > 0.6) {
      confidence = 'media';
      stars = '⭐⭐';
      bgClass = 'bg-brand-yellow';
    }

    return {
      label: top.label,
      prob: top.prob,
      confidence,
      stars,
      bgClass,
      market: top.market
    };
  }, [getMarketProbabilities]);

  const getTopMarket = useCallback((match: Event) => {
    const probs = getMarketProbabilities(match);
    const top = probs[0];
    return top.prob > 0.7 ? top : null;
  }, [getMarketProbabilities]);

  const groupedByMarket = useMemo(() => {
    const all = [...matchesWithLogos, ...upcomingMatchesWithLogos];
    const groups: Record<string, typeof all> = { 'BTTS': [], 'OVER': [], '1X2': [] };
    
    all.forEach(m => {
      const probs = getMarketProbabilities(m);
      if (probs.length > 0) {
        const top = probs[0].market;
        if (groups[top]) groups[top].push(m);
      }
    });
    return groups;
  }, [matchesWithLogos, upcomingMatchesWithLogos, getMarketProbabilities]);

  const topPicks = useMemo(() => {
    const all = [...matchesWithLogos, ...upcomingMatchesWithLogos];
    return all.filter(m => getTopMarket(m) !== null);
  }, [matchesWithLogos, upcomingMatchesWithLogos, getTopMarket]);

  const groupedByDay = useMemo(() => {
    const all = [...matchesWithLogos, ...upcomingMatchesWithLogos, ...v2PredictionsWithLogos.map(p => p.event)];
    const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
    
    const groups: Record<'today' | 'tomorrow' | 'dayAfter' | 'later', Event[]> = {
      today: [],
      tomorrow: [],
      dayAfter: [],
      later: []
    };
    
    unique.forEach(m => {
      const cat = getDateCategory(m.startTime);
      groups[cat].push(m);
    });
    
    Object.keys(groups).forEach(key => {
      groups[key as keyof typeof groups].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    
    return groups;
  }, [matchesWithLogos, upcomingMatchesWithLogos, v2PredictionsWithLogos]);

  return {
    matches: matchesWithLogos,
    upcomingMatches: upcomingMatchesWithLogos,
    groupedByDay,
    dayLabels,
    selectedMatchId: g_selectedMatchId,
    setSelectedMatchId,
    liveData: combinedLiveData,
    teamForms: g_teamForms,
    groupedByMarket,
    topPicks,
    getMarketProbabilities,
    getTopMarket,
    getMatchBadge,
    syncMatchDetail,
    v2Predictions: v2PredictionsWithLogos,
    enrichedData: g_enrichedData,
    frozenPredictions: g_frozenPredictions,
    lastStats: g_lastStats,
    loading: g_loading,
    apiError: g_apiError
  };
}
