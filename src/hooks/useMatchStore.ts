import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

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
import { api } from '../services/api';
import { Event, Stats, Prediction, Odds, Incident, TeamForm, OddMarket, LineupData, EventMetadata, PlayerMatchStats } from '../types';
import { calculateHybridPrediction, calculateMomentum, calculatePoissonModel } from '../lib/prediction';

/**
 * Handles live updates via polling as specified.
 */
export function useMatchStore() {
  const [matches, setMatches] = useState<Event[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Event[]>([]);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('bsd_team_logos');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [teamNames, setTeamNames] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('bsd_team_names');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  
  const triedData = useRef<Set<string>>(new Set());

  // Initialize triedData from what we loaded from localStorage
  useEffect(() => {
    Object.keys(teamLogos).forEach(id => triedData.current.add(id));
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('bsd_team_logos', JSON.stringify(teamLogos));
  }, [teamLogos]);

  useEffect(() => {
    localStorage.setItem('bsd_team_names', JSON.stringify(teamNames));
  }, [teamNames]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<{
    stats: Stats | null;
    prediction: Prediction | null;
    odds: OddMarket | null;
    incidents: Incident[];
    momentum: number;
    forms: { home: TeamForm | null, away: TeamForm | null };
    metadata: EventMetadata | null;
    lineups: LineupData | null;
    playerStats: PlayerMatchStats[];
  }>({
    stats: null,
    prediction: null,
    odds: null,
    incidents: [],
    momentum: 0,
    forms: { home: null, away: null },
    metadata: null,
    lineups: null,
    playerStats: [],
  });

  const [lastStats, setLastStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Separate forms state to avoid recalculating unnecessarily within the main polling loop
  const [teamForms, setTeamForms] = useState<{ home: TeamForm | null, away: TeamForm | null }>({ home: null, away: null });
  const [slowData, setSlowData] = useState<{
    metadata: EventMetadata | null;
    lineups: LineupData | null;
    playerStats: PlayerMatchStats[];
  }>({
    metadata: null,
    lineups: null,
    playerStats: [],
  });

  // Logo and Name fetcher helper
  const fetchMissingData = useCallback(async (events: any[]) => {
    const missing = new Set<string>();
    events.forEach(e => {
      const hId = e.homeTeamId;
      const aId = e.awayTeamId;
      
      if (hId && !triedData.current.has(hId)) {
        if (!e.homeLogo || e.homeTeam === 'Unknown Home' || e.homeTeam.includes('Unknown')) {
          missing.add(hId);
        } else {
          // If we already have it from the event list, mark as tried to avoid future lookups
          triedData.current.add(hId);
        }
      }
      if (aId && !triedData.current.has(aId)) {
        if (!e.awayLogo || e.awayTeam === 'Unknown Away' || e.awayTeam.includes('Unknown')) {
          missing.add(aId);
        } else {
          triedData.current.add(aId);
        }
      }
    });

    if (missing.size === 0) return;

    // Mark as tried *now* so other calls don't start the same IDs
    missing.forEach(id => triedData.current.add(id));

    const newLogos: Record<string, string> = {};
    const newNames: Record<string, string> = {};

    // Limit the number of parallel fetches to avoid overwhelming the log/server
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
      // Small pause between batches if needed, but concurrency limit should be enough
    }

    if (Object.keys(newLogos).length > 0) {
      setTeamLogos(prev => ({ ...prev, ...newLogos }));
    }
    if (Object.keys(newNames).length > 0) {
      setTeamNames(prev => ({ ...prev, ...newNames }));
    }
  }, []);

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

  // Initial fetch
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        setLoading(true);
        setApiError(null);
        
        // Fetch Live and Upcoming concurrently
        const [events, upcoming] = await Promise.all([
          api.getLiveEvents(),
          api.getUpcomingEvents()
        ]);

        if (active) {
          const validEvents = events || [];
          setMatches(validEvents);
          setUpcomingMatches(upcoming || []);
          
          fetchMissingData(validEvents.concat(upcoming || []));
          
          if (validEvents.length > 0 && !selectedMatchId) {
            setSelectedMatchId(validEvents[0].id);
          } else if (upcoming && upcoming.length > 0 && !selectedMatchId) {
            setSelectedMatchId(upcoming[0].id);
          }
          console.info(`[App Init] Matches loaded: ${validEvents.length}`);
        }
      } catch (err: any) {
        if (active) {
          if (err.message && (err.message.includes('API Key no configurada') || err.message.includes('API Key inválida'))) {
            setApiError('API_KEY_MISSING');
          } else {
            setApiError(err.message || 'Error occurred');
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync triggered by components
  const lastSyncId = useRef<string | null>(null);
  
  const syncMatchDetail = useCallback(async (id: string, options: { stats?: boolean, slow?: boolean, forms?: boolean }) => {
    if (!id) return;
    
    try {
      const currentMatch = matches.find(m => m.id === id) || upcomingMatches.find(m => m.id === id);
      const updates: any = {};
      
      // Fetch data based on options
      const promises = [];
      
      if (options.stats) {
        promises.push(api.getStats(id).then(s => updates.stats = s));
        promises.push(api.getPredictions(id).then(p => updates.mlPrediction = p));
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
      
      // Update state
      if (updates.stats !== undefined) {
        // FIX: Calculate prediction only if it doesn't exist yet for this match to keep it FIXED/STATIC
        // as requested by user.
        let finalPrediction = liveData.prediction;
        
        if (!finalPrediction || lastSyncId.current !== id) {
          finalPrediction = calculateHybridPrediction(
            id, 
            updates.stats, 
            updates.mlPrediction, 
            updates.odds, 
            teamForms,
            0, // Fixed at minute 0 for baseline analytical model
            { home: 0, away: 0 } // Fixed baseline score
          );
          lastSyncId.current = id;
        }

        const momentum = updates.stats ? calculateMomentum(updates.stats) : 0;
        
        setLastStats(updates.stats);
        setLiveData(prev => ({
          ...prev,
          stats: updates.stats || prev.stats,
          prediction: finalPrediction,
          odds: updates.odds || prev.odds,
          incidents: updates.incidents || prev.incidents,
          momentum
        }));
      }
      
      if (updates.metadata !== undefined || updates.lineups !== undefined || updates.playerStats !== undefined) {
        setSlowData({
          metadata: updates.metadata || null,
          lineups: updates.lineups || null,
          playerStats: updates.playerStats || []
        });
      }
      
      if (updates.homeFixtures && currentMatch?.homeTeamId && updates.awayFixtures && currentMatch?.awayTeamId) {
        setTeamForms({
          home: transformToForm(updates.homeFixtures, currentMatch.homeTeamId),
          away: transformToForm(updates.awayFixtures, currentMatch.awayTeamId)
        });
      }
      
    } catch (err) {
      console.error("Sync error:", err);
    }
  }, [matches, upcomingMatches, teamForms]);

  // General polling for live events to keep left menu updated
  useEffect(() => {
    const pollEvents = async () => {
      try {
        const fresh = await api.getLiveEvents();
        
        // Filtrar eventos que realmente cambiaron usando last_updated
        const updatedEvents = fresh.filter(e => {
          const existing = matches.find(m => m.id === e.id);
          // Si no existe, no tiene last_updated o el nuevo es posterior, ha cambiado
          return !existing || !existing.last_updated || (e.last_updated && new Date(e.last_updated) > new Date(existing.last_updated));
        });

        if (updatedEvents.length > 0) {
          setMatches(fresh);
          fetchMissingData(fresh);
        }
      } catch(e) {}
    }
    // Polling cada 35s - la API cachea events/live en Redis por 30s (respetamos TTL + margen)
    const interval = setInterval(pollEvents, 35000);
    return () => clearInterval(interval);
  }, [fetchMissingData, matches]);

  const combinedLiveData = useMemo(() => {
    return {
      ...liveData,
      ...slowData,
      forms: teamForms
    };
  }, [liveData, slowData, teamForms]);

  /**
   * Calculates market probabilities for a match using Poisson or existing data.
   */
  const getMarketProbabilities = useCallback((match: Event) => {
    const m = match as any;
    let hProb = m.homeWinProb || 0;
    let dProb = m.drawProb || 0;
    let aProb = m.awayWinProb || 0;
    let bProb = m.bttsProb || 0;
    let oProb = m.over25Prob || 0;

    // Heuristic Poisson calculation if xG is available but probabilities are not
    if (hProb === 0) {
      if (match.id === selectedMatchId && teamForms.home && teamForms.away) {
        const pred = calculatePoissonModel(teamForms.home, teamForms.away);
        hProb = pred.homeWinProb;
        dProb = pred.drawProb;
        aProb = pred.awayWinProb;
        bProb = pred.bttsProb;
        oProb = pred.over25Prob;
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

        hProb = 0; dProb = 0; aProb = 0; bProb = 0; oProb = 0;
        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 7; j++) {
            const p = poisson(xgH, i) * poisson(xgA, j);
            if (i > j) hProb += p;
            else if (j > i) aProb += p;
            else dProb += p;
            if (i > 0 && j > 0) bProb += p;
            if (i + j > 2.5) oProb += p;
          }
        }
      } else {
        // Fallback for no data: Neutral distribution favoring 1X2 market as default
        hProb = 0.38; dProb = 0.28; aProb = 0.34; bProb = 0.48; oProb = 0.45;
      }
    }

    const win1X2 = Math.max(hProb, dProb, aProb);
    const label1X2 = hProb >= Math.max(dProb, aProb) ? 'Local' : (aProb >= dProb ? 'Visitante' : 'Empate');

    return [
      { market: 'BTTS', label: 'Ambos Marcan', prob: bProb },
      { market: 'OVER', label: 'Over 2.5', prob: oProb },
      { market: '1X2', label: label1X2, prob: win1X2 }
    ].sort((a, b) => b.prob - a.prob);
  }, [selectedMatchId, teamForms]);

  /**
   * Returns the top market if its probability exceeds 0.7.
   */
  const getTopMarket = useCallback((match: Event) => {
    const probs = getMarketProbabilities(match);
    const top = probs[0];
    return top.prob > 0.7 ? top : null;
  }, [getMarketProbabilities]);

  const matchesWithLogos = useMemo(() => {
    return matches.map(m => ({
      ...m,
      homeTeam: (m.homeTeamId ? teamNames[m.homeTeamId] : null) || m.homeTeam,
      awayTeam: (m.awayTeamId ? teamNames[m.awayTeamId] : null) || m.awayTeam,
      homeLogo: m.homeLogo || (m.homeTeamId ? teamLogos[m.homeTeamId] : undefined),
      awayLogo: m.awayLogo || (m.awayTeamId ? teamLogos[m.awayTeamId] : undefined),
    }));
  }, [matches, teamLogos, teamNames]);

  const upcomingMatchesWithLogos = useMemo(() => {
    return upcomingMatches.map(m => ({
      ...m,
      homeTeam: (m.homeTeamId ? teamNames[m.homeTeamId] : null) || m.homeTeam,
      awayTeam: (m.awayTeamId ? teamNames[m.awayTeamId] : null) || m.awayTeam,
      homeLogo: m.homeLogo || (m.homeTeamId ? teamLogos[m.homeTeamId] : undefined),
      awayLogo: m.awayLogo || (m.awayTeamId ? teamLogos[m.awayTeamId] : undefined),
    }));
  }, [upcomingMatches, teamLogos, teamNames]);

  /**
   * Group matches by their most probable market.
   */
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

  /**
   * Filter matches with high probability picks (>0.7).
   */
  const topPicks = useMemo(() => {
    const all = [...matchesWithLogos, ...upcomingMatchesWithLogos];
    return all.filter(m => getTopMarket(m) !== null);
  }, [matchesWithLogos, upcomingMatchesWithLogos, getTopMarket]);

  /**
   * Group matches by date (Today, Tomorrow, Day After, etc.)
   */
  const groupedByDay = useMemo(() => {
    const all = [...matchesWithLogos, ...upcomingMatchesWithLogos];
    // Filter duplicates by id
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
    
    // Sort each group by startTime
    Object.keys(groups).forEach(key => {
      groups[key as keyof typeof groups].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    
    return groups;
  }, [matchesWithLogos, upcomingMatchesWithLogos]);

  return {
    matches: matchesWithLogos,
    upcomingMatches: upcomingMatchesWithLogos,
    groupedByDay,
    dayLabels,
    selectedMatchId,
    setSelectedMatchId,
    liveData: combinedLiveData,
    teamForms,
    groupedByMarket,
    topPicks,
    getMarketProbabilities,
    getTopMarket,
    syncMatchDetail,
    lastStats,
    loading,
    apiError
  };
};
