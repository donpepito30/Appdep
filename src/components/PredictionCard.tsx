import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Star, Sparkles, AlertCircle, ChevronDown, ChevronUp, TrendingUp, History, Activity, ExternalLink, Target, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Event, Prediction, EnrichedEventData, Stats, cn } from '../types';
import { usePredictionData } from '../hooks/usePredictionData';
import { generatePredictionAnalysis } from '../lib/gemini';
import { TeamLogo } from './TeamLogo';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { calcularBTTSPropio, alignScorelineWithProbabilities } from '../lib/prediction';
import { api } from '../services/api';

export function extractBestOdds(comp: any) {
  const result = {
    home_win: null as number | null,
    draw: null as number | null,
    away_win: null as number | null,
    over_25: null as number | null,
    btts_yes: null as number | null
  };

  if (!comp || !comp.markets) return result;

  const markets = comp.markets;
  
  const winMarketKey = Object.keys(markets).find(k => 
    k.toLowerCase().includes('1x2') || 
    k.toLowerCase().includes('winner') || 
    k.toLowerCase().includes('resultado') || 
    k.toLowerCase().includes('fulltime_result')
  );

  if (winMarketKey && markets[winMarketKey]) {
    const bookmakers = markets[winMarketKey].bookmakers || [];
    let maxH = 0, maxD = 0, maxA = 0;
    bookmakers.forEach((bk: any) => {
      const odds = bk.odds || {};
      const oH = Number(odds.home_win || odds.local || odds['1'] || odds.home || 0);
      const oD = Number(odds.draw || odds.empate || odds.X || odds.x || 0);
      const oA = Number(odds.away_win || odds.visitante || odds['2'] || odds.away || 0);
      if (oH > maxH) maxH = oH;
      if (oD > maxD) maxD = oD;
      if (oA > maxA) maxA = oA;
    });
    if (maxH > 0) result.home_win = maxH;
    if (maxD > 0) result.draw = maxD;
    if (maxA > 0) result.away_win = maxA;
  }

  const ouMarketKey = Object.keys(markets).find(k => 
    k.toLowerCase().includes('over_under') || 
    k.toLowerCase().includes('totals') || 
    k.toLowerCase().includes('goles') || 
    k.toLowerCase().includes('mas_menos')
  );

  if (ouMarketKey && markets[ouMarketKey]) {
    const bookmakers = markets[ouMarketKey].bookmakers || [];
    let maxOver25 = 0;
    bookmakers.forEach((bk: any) => {
      const odds = bk.odds || {};
      const oO = Number(odds.over_25 || odds.over_25_goals || odds['over_2.5'] || odds['over_2_5'] || odds.over25 || 0);
      if (oO > maxOver25) {
        maxOver25 = oO;
      } else {
        const lines = bk.lines || bk.values || {};
        const line25 = lines['2.5'] || lines['2_5'] || {};
        const oLine = Number(line25.over || line25.over_25 || 0);
        if (oLine > maxOver25) maxOver25 = oLine;
      }
    });
    if (maxOver25 > 0) result.over_25 = maxOver25;
  }

  const bttsMarketKey = Object.keys(markets).find(k => 
    k.toLowerCase().includes('btts') || 
    k.toLowerCase().includes('both_teams') || 
    k.toLowerCase().includes('ambos_marcan') || 
    k.toLowerCase().includes('ambos')
  );

  if (bttsMarketKey && markets[bttsMarketKey]) {
    const bookmakers = markets[bttsMarketKey].bookmakers || [];
    let maxBttsYes = 0;
    bookmakers.forEach((bk: any) => {
      const odds = bk.odds || {};
      const oB = Number(odds.yes || odds.btts_yes || odds.si || odds['sí'] || odds.both_teams_to_score_yes || 0);
      if (oB > maxBttsYes) maxBttsYes = oB;
    });
    if (maxBttsYes > 0) result.btts_yes = maxBttsYes;
  }

  return result;
}

interface PredictionCardProps {
  match: Event;
  prediction?: Prediction;
  enriched?: EnrichedEventData;
  topMarket: string;
  topProb: number;
  bttsProb: number;
  over25Prob: number;
  onSelect?: (id: string) => void;
  featured?: boolean;
}

export function PredictionCard({ match, prediction, enriched, topMarket, topProb, bttsProb, over25Prob, onSelect, featured = false }: PredictionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const entry = useIntersectionObserver(cardRef, { threshold: 0.1 });
  const isVisible = !!entry?.isIntersecting;

  const { homeForm, awayForm, h2h, homeXG, awayXG, homeAvgGoals, awayAvgGoals, projectedScore, probLocal, probBTTS, probOver25, loading: dataLoading } = usePredictionData(match, isVisible || featured);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(featured);
  const [matchStats, setMatchStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (!isVisible || !isExpanded) return;
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const res = await api.getStats(match.id);
        if (res) {
          setMatchStats(res);
        }
      } catch (err) {
        console.error("Error loading stats in PredictionCard:", err);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [isVisible, isExpanded, match.id]);

  const hasRealStats = !!matchStats && (
    Number(matchStats.shotsHome || 0) + Number(matchStats.shotsAway || 0) > 0 ||
    Number(matchStats.cornersHome || 0) + Number(matchStats.cornersAway || 0) > 0 ||
    Number(matchStats.foulsHome || 0) + Number(matchStats.foulsAway || 0) > 0 ||
    matchStats.possessionHome !== 50 ||
    match.status === 'LIVE' ||
    match.status === 'FINISHED'
  );

  // Display probabilities prioritizing Bzzoiro ML then pre-calculated then hook fallbacks
  const isLocalMarket = topMarket?.toLowerCase().includes('local') || topMarket?.toLowerCase().includes('1') || topMarket?.toLowerCase().includes('home');
  const isBttsMarket = topMarket?.toLowerCase().includes('btts') || topMarket?.toLowerCase().includes('ambos') || topMarket?.toLowerCase().includes('marcan');
  const isOverMarket = topMarket?.toLowerCase().includes('over') || topMarket?.toLowerCase().includes('más') || topMarket?.toLowerCase().includes('mas');

  const displayLocalProb = enriched?.prediction?.homeWinProb ?? prediction?.homeWinProb ?? (isLocalMarket && topProb > 0.1 ? topProb : probLocal);
  const displayBttsProb = enriched?.prediction?.bttsProb ?? prediction?.bttsProb ?? (isBttsMarket && bttsProb > 0 ? bttsProb : probBTTS);
  const displayOverProb = enriched?.prediction?.over25Prob ?? prediction?.over25Prob ?? (isOverMarket && over25Prob > 0 ? over25Prob : probOver25);

  const displayLocalOdds = enriched?.odds?.home_win ?? (match as any).odds?.home_win ?? 1.85;
  const displayBttsOdds = enriched?.odds?.btts_yes ?? 1.70;
  const displayOverOdds = enriched?.odds?.over_25_goals ?? 1.80;

  // Best Over 2.5 odds from comparison
  const compBest = extractBestOdds(enriched?.comparison);
  const displayBestOverOdds = compBest.over_25 ?? displayOverOdds;

  // Custom BTTS Calculation using user's formula
  const h2hList = enriched?.h2h || h2h || [];
  const bttsCountInH2H = h2hList.filter((h: any) => Number(h.homeScore) > 0 && Number(h.awayScore) > 0).length;
  const bttsPorcentaje = h2hList.length > 0 ? (bttsCountInH2H / h2hList.length) * 100 : 50;

  const customBttsPercent = calcularBTTSPropio(
    homeXG > 0 ? homeXG : (match.xgHome || 1.35),
    awayXG > 0 ? awayXG : (match.xgAway || 1.25),
    displayOverProb * 100,
    { bttsPorcentaje }
  );
  const customBttsProb = customBttsPercent / 100;

  // Value edge calculations
  const overValueEdge = displayOverProb * displayOverOdds - 1;
  const bttsValueEdge = displayBttsProb * displayBttsOdds - 1;
  const customBttsValueEdge = customBttsProb * displayBttsOdds - 1;
  const localValueEdge = displayLocalProb * displayLocalOdds - 1;

  const displayOverValue = overValueEdge > 0.02 ? `+${Math.round(overValueEdge * 100)}%` : '—';
  const displayBttsValue = bttsValueEdge > 0.02 ? `+${Math.round(bttsValueEdge * 100)}%` : '—';
  const displayCustomBttsValue = customBttsValueEdge > 0.02 ? `+${Math.round(customBttsValueEdge * 100)}%` : '—';
  const displayLocalValue = localValueEdge > 0.02 ? `+${Math.round(localValueEdge * 100)}%` : '—';

  // Hybrid confidence calculations (20% - 92%)
  const rawConf = (enriched?.prediction?.confidence ?? prediction?.confidence ?? 60);
  const displayConfidence = Math.min(92, Math.max(20, Math.round(rawConf)));

  // Streak form with emojis from standings
  const getStandingsTeam = (teamId?: string, teamName?: string) => {
    if (!enriched?.standings) return null;
    const list = Array.isArray(enriched.standings) 
      ? enriched.standings 
      : (enriched.standings.standings || []);
    
    if (teamId) {
      const found = list.find((t: any) => String(t.team_id || t.id || t.team?.id) === String(teamId));
      if (found) return found;
    }
    if (teamName) {
      const lowerName = teamName.toLowerCase();
      const found = list.find((t: any) => 
        (t.team_name || t.name || t.team?.name || '').toLowerCase() === lowerName
      );
      if (found) return found;
    }
    return null;
  };

  const mapStreakEmojis = (streak: string) => {
    if (!streak) return '';
    return streak.slice(-5).split('').map(char => {
      if (char === 'W' || char === 'G') return '🟢';
      if (char === 'L' || char === 'P') return '🔴';
      return '🟡';
    }).join('');
  };

  const homeStandings = getStandingsTeam(match.homeTeamId, match.homeTeam);
  const awayStandings = getStandingsTeam(match.awayTeamId, match.awayTeam);
  const homeStreakEmojis = homeStandings?.form ? mapStreakEmojis(homeStandings.form) : '';
  const awayStreakEmojis = awayStandings?.form ? mapStreakEmojis(awayStandings.form) : '';

  // Injury details (name & position) from lineups
  const injuredPlayers: { name: string; position: string; team: string }[] = [];
  if (enriched?.lineups?.unavailable_players) {
    const unHome = enriched.lineups.unavailable_players.home || [];
    unHome.forEach((p: any) => {
      injuredPlayers.push({ name: p.name, position: p.position || p.status || 'Lesionado', team: 'home' });
    });
    const unAway = enriched.lineups.unavailable_players.away || [];
    unAway.forEach((p: any) => {
      injuredPlayers.push({ name: p.name, position: p.position || p.status || 'Lesionado', team: 'away' });
    });
  }

  // Prioritize passed props (V2/ML) over heuristic calculations from usePredictionData
  const finalTopProb = displayLocalProb;
  const finalBTTSProb = displayBttsProb;
  const finalOverProb = displayOverProb;
  const finalMarket = finalTopProb > 0.5 ? 'Local' : finalBTTSProb > 0.6 ? 'Ambos Marcan' : topMarket;

  const approxAwayProb = enriched?.prediction?.awayWinProb ?? prediction?.awayWinProb ?? Math.max(0.05, 1 - displayLocalProb - 0.25);
  const approxDrawProb = enriched?.prediction?.drawProb ?? prediction?.drawProb ?? 0.25;
  const rawUIModelScore = prediction?.scoreline || (projectedScore !== '?-?' ? projectedScore : "1-1");
  const alignedUIScore = alignScorelineWithProbabilities(rawUIModelScore, displayLocalProb, approxDrawProb, approxAwayProb);

  const formatearFechaHora = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + 
           date.toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase();
  };

  useEffect(() => {
    // Solo fetch si es visible, está expandido y no tenemos texto aún
    if (!isVisible || !isExpanded || analysisText || dataLoading) return;

    const fetchAnalysis = async () => {
      setAnalyzing(true);
      try {
        const text = await generatePredictionAnalysis({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeForm,
          awayForm,
          h2h,
          homeXG: homeXG || 1.1,
          awayXG: awayXG || 1.0,
          homeAvgGoals: homeAvgGoals || 1.2,
          awayAvgGoals: awayAvgGoals || 1.1,
          topMarket: finalMarket,
          topProb: finalTopProb,
          bttsProb: finalBTTSProb,
          over25Prob: finalOverProb,
          matchId: match.id,
          injuredPlayers: injuredPlayers,
          projectedScore: alignedUIScore
        });
        
        setAnalysisText(text);
      } catch (err) {
        setAnalysisText(`### Resumen de Rendimiento
**Análisis:** Basado en la forma reciente, se espera que el equipo local tome la iniciativa desde el inicio.`);
      } finally {
        setAnalyzing(false);
      }
    };

    fetchAnalysis();
  }, [isVisible, isExpanded, dataLoading, match.id, finalMarket]);

  const isFrozen = !!match.id && !!localStorage.getItem(`bsd_analysis_v4_${match.id}`);

  const getConfidenceStars = (prob: number) => {
    if (prob > 0.8) return 3;
    if (prob > 0.65) return 2;
    return 1;
  };

  const getAiSummarySnippet = () => {
    if (!analysisText) return "Consultando datos del encuentro...";
    
    // Clean up markdown
    let clean = analysisText
      .replace(/#/g, '')
      .replace(/\*\*/g, '')
      .replace(/⚠️/g, '')
      .replace(/\n/g, ' ')
      .trim();

    // Remove common headers if they exist at the start
    const headers = [
      'Análisis Táctico y Momentum',
      'Contexto Táctico y Momentum',
      'Veredicto Táctico',
      'ERROR DE ANÁLISIS TÉCNICO',
      'ERROR DE SINCRONIZACIÓN IA',
      'Análisis Táctico'
    ];
    
    for (const h of headers) {
      if (clean.toLowerCase().startsWith(h.toLowerCase())) {
        clean = clean.substring(h.length).trim();
        // Remove trailing colon if it exists
        if (clean.startsWith(':')) clean = clean.substring(1).trim();
      }
    }

    // Limit length and ensure it's not empty
    if (clean.length < 5) return "Modelo predictivo BSD: Analizando formación y momentum de los equipos...";
    
    return clean;
  };

  // Averages for Goals and Corners (v2 API & calculations)
  const homeAvgGoalsVal = enriched?.prediction?.expectedHomeGoals ?? prediction?.expectedHomeGoals ?? (homeAvgGoals > 0 ? homeAvgGoals : 1.25);
  const awayAvgGoalsVal = enriched?.prediction?.expectedAwayGoals ?? prediction?.expectedAwayGoals ?? (awayAvgGoals > 0 ? awayAvgGoals : 1.15);

  const homeAvgCornersVal = Number((4.6 + (homeAvgGoalsVal * 0.4) + (homeXG > 0 ? homeXG * 0.3 : 0.3)));
  const awayAvgCornersVal = Number((4.0 + (awayAvgGoalsVal * 0.3) + (awayXG > 0 ? awayXG * 0.2 : 0.2)));

  const sum = (displayLocalProb || 0) + (approxDrawProb || 0) + (approxAwayProb || 0) || 1;
  const homePct = Math.round((displayLocalProb / sum) * 100);
  const drawPct = Math.round((approxDrawProb / sum) * 100);
  const awayPct = 100 - homePct - drawPct;
  const stars = getConfidenceStars(finalTopProb);

  // Determine Favorite and Aligned Scoreline
  const isHomeFavorite = displayLocalProb > approxAwayProb;
  const isAwayFavorite = approxAwayProb > displayLocalProb;
  const parsedScores = alignedUIScore.split('-');

  // Determine Main Prediction
  let mainPredictionText = "Victoria Local";
  let mainPredictionProb = displayLocalProb;

  if (approxAwayProb > displayLocalProb && approxAwayProb > approxDrawProb) {
    mainPredictionText = "Victoria Visitante";
    mainPredictionProb = approxAwayProb;
  } else if (approxDrawProb > displayLocalProb && approxDrawProb > approxAwayProb) {
    mainPredictionText = "Empate";
    mainPredictionProb = approxDrawProb;
  }

  // If BTTS has very high probability and is higher than the main 1X2 prediction
  if (displayBttsProb > mainPredictionProb && displayBttsProb > 0.65) {
    mainPredictionText = "Ambos Marcan";
    mainPredictionProb = displayBttsProb;
  }
  // If Over 2.5 has very high probability and is higher than the rest
  if (displayOverProb > mainPredictionProb && displayOverProb > 0.65) {
    mainPredictionText = "Over 2.5 Goles";
    mainPredictionProb = displayOverProb;
  }

  // Filtered badges for probabilities exceeding 65% (Nivel 2)
  const badges: React.ReactNode[] = [];
  if (localValueEdge > 0.05 && displayLocalProb > 0.55) {
    badges.push(
      <span key="val" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-yellow/10 border border-brand-yellow/30 text-[9px] font-black text-brand-yellow uppercase tracking-wider select-none shrink-0">
        <TrendingUp className="w-2.5 h-2.5" /> VALOR DETECTADO
      </span>
    );
  }
  if (displayBttsProb > 0.65) {
    badges.push(
      <span key="btts" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 text-[9px] font-black text-[#00ff88] uppercase tracking-wider select-none shrink-0">
        <Sparkles className="w-2.5 h-2.5" /> BTTS Sí
      </span>
    );
  }
  if (displayOverProb > 0.65) {
    badges.push(
      <span key="over" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[9px] font-black text-[#00d4ff] uppercase tracking-wider select-none shrink-0">
        <Activity className="w-2.5 h-2.5" /> Over 2.5
      </span>
    );
  }

  // Helper for rendering form dots in Spanish
  const renderFormDots = (formString?: string) => {
    if (!formString) return <span className="text-[10px] text-brand-text-muted/40">Sin racha</span>;
    const lastFive = formString.replace(/[^WDLGP]/gi, '').slice(-5).split('');
    return (
      <div className="flex items-center gap-1 shrink-0 select-none">
        {lastFive.map((char, idx) => {
          let bgClass = 'bg-[#2a2a2a] text-white/50';
          let label = 'E';
          if (char === 'W' || char === 'G') {
            bgClass = 'bg-[#00ff88]/20 border border-[#00ff88]/30 text-[#00ff88] font-black';
            label = 'V';
          } else if (char === 'L' || char === 'P') {
            bgClass = 'bg-[#ff3344]/20 border border-[#ff3344]/30 text-[#ff3344] font-black';
            label = 'D';
          }
          return (
            <span 
              key={idx} 
              className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] tracking-tighter leading-none select-none", bgClass)}
              title={char === 'W' ? 'Victoria' : char === 'L' ? 'Derrota' : 'Empate'}
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      id={`prediction-card-${match.id}`}
      onClick={() => setIsExpanded(!isExpanded)}
      className={cn(
        "bg-[#0f0f0f] rounded-[2rem] border p-5 sm:p-6 hover:border-[#00ff88]/30 transition-all duration-300 group overflow-hidden relative flex flex-col cursor-pointer select-none",
        featured ? "border-brand-yellow/40 ring-1 ring-brand-yellow/20" : "border-white/5"
      )}
    >
      {/* Background Glow */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 blur-3xl -mr-16 -mt-16 transition-colors duration-500",
        featured ? "bg-brand-yellow/10 group-hover:bg-brand-yellow/20" : "bg-[#00ff88]/5 group-hover:bg-[#00ff88]/10"
      )} />

      {/* Featured Badge */}
      {featured && (
        <div className="absolute top-0 right-0 px-4 py-1.5 bg-brand-yellow/20 border-l border-b border-brand-yellow/30 rounded-bl-2xl z-20 backdrop-blur-md">
           <div className="flex items-center gap-1.5">
             <Sparkles className="w-3 h-3 text-brand-yellow fill-brand-yellow" />
             <span className="text-[7.5px] font-black text-brand-yellow uppercase tracking-[0.3em]">SELECCIÓN DESTACADA</span>
           </div>
        </div>
      )}

      {/* Freeze Indicator Badge */}
      {isFrozen && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 bg-[#00ff88]/20 border-x border-b border-[#00ff88]/30 rounded-b-2xl z-20 backdrop-blur-md">
           <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
           <span className="text-[7.5px] font-black text-[#00ff88] uppercase tracking-[0.3em]">ANALIZADO POR IA</span>
        </div>
      )}

      <div className="flex flex-col relative z-10">
        {/* Top Header Row */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center space-x-2 text-[10px] font-mono text-brand-text-muted bg-black/50 px-3 py-1.5 rounded-full border border-white/5">
            <Clock className="w-3.5 h-3.5 text-[#00ff88]" />
            <span>{formatearFechaHora(match.startTime)}</span>
          </div>
          <div className="flex space-x-0.5">
            {[...Array(3)].map((_, i) => (
              <Star 
                key={i} 
                className={cn(
                  "w-3.5 h-3.5 transition-all duration-500", 
                  i < stars ? "text-brand-yellow fill-brand-yellow scale-110" : "text-white/10 scale-90"
                )} 
              />
            ))}
          </div>
        </div>

        {/* ========================================================= */}
        {/* NIVEL 1 (PRIMARIO): SCORE PROYECTADO Y EQUIPOS CENTRADOS   */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between w-full gap-4 relative mb-6">
          {/* Home Team Column */}
          <div className="flex flex-col items-center flex-1 text-center">
            <TeamLogo 
              name={match.homeTeam} 
              logoUrl={match.homeLogo} 
              size="lg" 
              className="mb-2 ring-4 ring-white/[0.02] shadow-xl group-hover:scale-105 transition-transform" 
            />
            <span className="text-xs font-display font-black text-white uppercase tracking-tight line-clamp-1 max-w-[120px]">
              {match.homeTeam}
            </span>
          </div>
          
          {/* Main Score & Selection Highlight */}
          <div className="flex flex-col items-center justify-center shrink-0 min-w-[140px]">
            <div className="flex items-center justify-center gap-1">
              <span className={cn(
                "font-mono text-5xl sm:text-6xl font-black tracking-tighter leading-none select-none drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]", 
                isHomeFavorite ? "text-[#00ff88]" : "text-white/95"
              )}>
                {parsedScores[0] || '1'}
              </span>
              <span className="text-white/30 font-mono text-4xl font-light select-none">-</span>
              <span className={cn(
                "font-mono text-5xl sm:text-6xl font-black tracking-tighter leading-none select-none drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]", 
                isAwayFavorite ? "text-[#00ff88]" : "text-white/95"
              )}>
                {parsedScores[1] || '1'}
              </span>
            </div>
            
            <div className="mt-2 text-xs font-display font-bold text-[#00ff88] tracking-wide text-center">
              {Math.round(mainPredictionProb * 100)}% {mainPredictionText}
            </div>
          </div>

          {/* Away Team Column */}
          <div className="flex flex-col items-center flex-1 text-center">
            <TeamLogo 
              name={match.awayTeam} 
              logoUrl={match.awayLogo} 
              size="lg" 
              className="mb-2 ring-4 ring-white/[0.02] shadow-xl group-hover:scale-105 transition-transform" 
            />
            <span className="text-xs font-display font-black text-white uppercase tracking-tight line-clamp-1 max-w-[120px]">
              {match.awayTeam}
            </span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* NIVEL 2 (SECUNDARIO): BARRA DE PROBABILIDADES 1X2 & BADGES*/}
        {/* ========================================================= */}
        <div className="space-y-2.5 bg-black/40 p-4 rounded-2xl border border-white/[0.03]">
          {/* Split horizontal 3-way progress bar */}
          <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden flex select-none">
            <div 
              className="bg-[#00ff88] transition-all duration-500 relative" 
              style={{ width: `${homePct}%` }}
              title={`Victoria Local: ${homePct}%`}
            />
            <div 
              className="bg-[#4a4a4a] transition-all duration-500 relative border-x border-black/30" 
              style={{ width: `${drawPct}%` }}
              title={`Empate: ${drawPct}%`}
            />
            <div 
              className="bg-[#00d4ff] transition-all duration-500 relative" 
              style={{ width: `${awayPct}%` }}
              title={`Victoria Visitante: ${awayPct}%`}
            />
          </div>

          {/* Probability Values & Detected Value Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[10px] font-mono text-brand-text-muted">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> L {homePct}%
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4a4a4a]" /> E {drawPct}%
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" /> V {awayPct}%
              </span>
            </div>

            {/* Badges shown only if probability threshold is met */}
            {badges.length > 0 && (
              <div className="flex items-center gap-1">
                {badges}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* NIVEL 3 (DETALLE): FORMA RECIENTE, CONFIANZA & xG          */}
        {/* ========================================================= */}
        <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-2 gap-4 text-xs">
          {/* Dynamic Recent Form (W/D/L dots mapped to Spanish V/E/D) */}
          <div className="space-y-2">
            <span className="text-[9px] font-display font-black uppercase text-brand-text-muted tracking-wider block">
              Forma Reciente
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-white/80 line-clamp-1 max-w-[70px]">{match.homeTeam}</span>
                {renderFormDots(homeStandings?.form)}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-white/80 line-clamp-1 max-w-[70px]">{match.awayTeam}</span>
                {renderFormDots(awayStandings?.form)}
              </div>
            </div>
          </div>

          {/* Model parameters detail */}
          <div className="space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-display font-black uppercase text-brand-text-muted tracking-wider block">
                Métricas BSD
              </span>
              <div className="mt-1.5 flex flex-col gap-1.5 font-mono text-[10px]">
                <div className="flex justify-between items-center">
                  <span className="text-brand-text-muted">Confianza:</span>
                  <span className="font-bold text-[#00ff88] bg-[#00ff88]/10 px-1.5 py-0.5 rounded">
                    {displayConfidence}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-brand-text-muted">xG Estimado:</span>
                  <span className="font-bold text-[#00d4ff]">
                    {(homeXG || 1.3).toFixed(1)} - {(awayXG || 1.1).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mini AI Summary Insight */}
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-brand-text-muted italic">
          <AlertCircle className="w-3.5 h-3.5 text-[#00ff88] shrink-0 mt-0.5" />
          <div className="line-clamp-2 leading-normal">
            {dataLoading || analyzing ? (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-[#00ff88]" />
                Sincronizando modelo táctico...
              </span>
            ) : getAiSummarySnippet()}
          </div>
        </div>

        {/* Action Buttons with event stopPropagation to prevent parent click trigger */}
        <div className="mt-4 flex gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all duration-300 text-[9px] font-black uppercase tracking-widest",
              isExpanded 
                ? "bg-[#00ff88]/15 border-[#00ff88] text-[#00ff88]" 
                : "bg-[#141414] border-white/5 text-brand-text-muted hover:border-[#00ff88]/30 hover:text-white"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isExpanded ? 'Cerrar Detalles' : 'Ver Detalles'}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          {onSelect && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onSelect(match.id);
              }}
              className="px-3.5 h-10 flex items-center justify-center gap-1.5 bg-[#141414] border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-brand-text-muted hover:border-[#00d4ff]/30 hover:text-[#00d4ff] transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
          )}
        </div>

        {/* Deep Expandable Section with motion/react heights */}
        <AnimatePresence mode="wait">
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()} // Stop propagation so clicking inside the analysis doesn't toggle
            >
              <div className="mt-6 space-y-5 pt-5 border-t border-white/5">
                {/* Visual Header */}
                <div className="space-y-1 text-center flex flex-col items-center">
                  <h3 className="text-xl font-display font-black text-white uppercase tracking-tighter">
                    ANÁLISIS DE RENDIMIENTO
                  </h3>
                  <p className="text-[8px] font-black text-brand-text-muted uppercase tracking-[0.3em]">
                    Inteligencia artificial BSD Predictiva
                  </p>
                </div>

                {analyzing || dataLoading ? (
                  <div className="space-y-3 animate-pulse p-6 bg-[#121212] rounded-2xl border border-white/5">
                    <div className="h-2 w-full bg-white/5 rounded-full" />
                    <div className="h-2 w-full bg-white/5 rounded-full" />
                    <div className="h-2 w-4/5 bg-white/5 rounded-full" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Render AI Analysis Markdown */}
                    <div className="relative p-6 bg-black/60 rounded-2xl border border-[#00ff88]/10 shadow-xl text-left">
                       <div className="absolute top-0 left-0 w-16 h-0.5 bg-[#00ff88]/50" />
                       <div className="markdown-body prose prose-invert max-w-none text-xs text-white/90 leading-relaxed font-normal">
                          <ReactMarkdown>
                            {analysisText || "**Análisis BSD:** Cargando parámetros estadísticas..."}
                          </ReactMarkdown>
                       </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2">
                       {[
                         { label: 'Marcador Proyectado', val: alignedUIScore, icon: Target, color: 'text-[#00ff88]' },
                         { label: 'Volumen Goles', val: (homeAvgGoals + awayAvgGoals).toFixed(1), icon: Activity, color: 'text-[#00d4ff]' },
                         { label: 'H2H Histórico', val: h2h.length > 0 ? `${h2h[0].homeScore}-${h2h[0].awayScore}` : 'N/A', icon: History, color: 'text-brand-yellow' }
                       ].map((stat, i) => (
                         <div key={i} className="flex flex-col items-center p-3 bg-white/[0.01] rounded-xl border border-white/5">
                           <stat.icon className={cn("w-4 h-4 mb-1.5", stat.color)} />
                           <span className="text-[8px] text-center font-black uppercase text-brand-text-muted mb-0.5 tracking-wider leading-none">
                             {stat.label}
                           </span>
                           <span className="text-xs font-mono font-black text-white">{stat.val}</span>
                         </div>
                       ))}
                    </div>

                    {/* Expected Averages */}
                    <div className="p-4 bg-white/[0.01] rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
                        <h4 className="text-[10px] font-black uppercase text-white tracking-wider">
                          Métricas e Historial de Equipo (v2)
                        </h4>
                      </div>
                      
                      <div className="space-y-3.5 text-[11px]">
                        {/* Expected Goals */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-mono text-[9px] text-brand-text-muted">
                            <span>{homeAvgGoalsVal.toFixed(2)} Goles</span>
                            <span>Promedio de Goles</span>
                            <span>{awayAvgGoalsVal.toFixed(2)} Goles</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                            <div className="bg-[#00ff88]" style={{ width: `${(homeAvgGoalsVal / (homeAvgGoalsVal + awayAvgGoalsVal || 1)) * 100}%` }} />
                            <div className="bg-[#00d4ff]" style={{ width: `${(awayAvgGoalsVal / (homeAvgGoalsVal + awayAvgGoalsVal || 1)) * 100}%` }} />
                          </div>
                        </div>

                        {/* Corners */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-mono text-[9px] text-brand-text-muted">
                            <span>{homeAvgCornersVal.toFixed(1)} Corners</span>
                            <span>Córneres Estimados</span>
                            <span>{awayAvgCornersVal.toFixed(1)} Corners</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                            <div className="bg-[#00ff88]" style={{ width: `${(homeAvgCornersVal / (homeAvgCornersVal + awayAvgCornersVal || 1)) * 100}%` }} />
                            <div className="bg-[#00d4ff]" style={{ width: `${(awayAvgCornersVal / (homeAvgCornersVal + awayAvgCornersVal || 1)) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live Match Stats Integration (v2 API) */}
                    {(matchStats || loadingStats) && (
                      <div className="p-4 bg-[#121212]/40 rounded-2xl border border-white/5 space-y-3 animate-fade-in">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-[#00ff88]" />
                          <h4 className="text-[10px] font-black uppercase text-white tracking-wider">
                            Rendimiento en Vivo (v2 API)
                          </h4>
                        </div>
                        {loadingStats ? (
                          <div className="space-y-2 animate-pulse py-2">
                            <div className="h-2 bg-white/5 rounded w-1/2 mx-auto" />
                            <div className="h-2 bg-white/5 rounded w-2/3 mx-auto" />
                          </div>
                        ) : hasRealStats ? (
                          <div className="space-y-3 text-[11px]">
                            {/* Possession */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono text-[9px] text-brand-text-muted">
                                <span>{matchStats.possessionHome}% {match.homeTeam}</span>
                                <span>Posesión</span>
                                <span>{matchStats.possessionAway}% {match.awayTeam}</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                                <div className="bg-[#00ff88]" style={{ width: `${matchStats.possessionHome}%` }} />
                                <div className="bg-[#00d4ff]" style={{ width: `${matchStats.possessionAway}%` }} />
                              </div>
                            </div>

                            {/* Shots */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono text-[9px] text-brand-text-muted">
                                <span>{matchStats.shotsHome} Remates</span>
                                <span>Remates Totales</span>
                                <span>{matchStats.shotsAway} Remates</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                                {Number(matchStats.shotsHome) + Number(matchStats.shotsAway) > 0 ? (
                                  <>
                                    <div className="bg-[#00ff88]" style={{ width: `${(Number(matchStats.shotsHome) / (Number(matchStats.shotsHome) + Number(matchStats.shotsAway))) * 100}%` }} />
                                    <div className="bg-[#00d4ff]" style={{ width: `${(Number(matchStats.shotsAway) / (Number(matchStats.shotsHome) + Number(matchStats.shotsAway))) * 100}%` }} />
                                  </>
                                ) : (
                                  <div className="w-full bg-white/10" />
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-black/20 rounded-xl text-brand-text-muted text-[10px]">
                            Las estadísticas en vivo se activarán una vez inicie el partido.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Injuries Section */}
                    {injuredPlayers.length > 0 && (
                      <div className="p-3 bg-[#ff3344]/5 border border-[#ff3344]/15 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[8.5px] font-black text-[#ff3344] uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 bg-[#ff3344] rounded-full" />
                          <span>Parte de Lesiones ({injuredPlayers.length})</span>
                        </div>
                        <div className="text-[10px] divide-y divide-white/5 max-h-[75px] overflow-y-auto pr-1">
                          {injuredPlayers.map((p, idx) => (
                            <div key={idx} className="py-1 flex justify-between text-white/80">
                              <span>{p.name} <span className="text-[8.5px] font-mono text-brand-text-muted lowercase">({p.position})</span></span>
                              <span className="text-[7.5px] uppercase font-black text-brand-text-muted">{p.team === 'home' ? 'Local' : 'Visitante'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Finished Game Summary */}
                    {match.status === 'FINISHED' && (
                      <div className="p-3 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl text-[10px]">
                        <div className="flex justify-between items-center text-brand-text-muted">
                          <span>Resultado Real:</span>
                          <span className="text-[#00ff88] font-mono font-bold">{match.homeScore} - {match.awayScore}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
