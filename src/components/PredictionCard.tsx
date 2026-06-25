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

  const probPercent = Math.round(finalTopProb * 100);
  const stars = getConfidenceStars(finalTopProb);
  const odds = (match as any).odds?.home_win || (finalTopProb > 0.8 ? 1.35 : finalTopProb > 0.6 ? 1.85 : 2.25);

  return (
    <motion.div
      ref={cardRef}
      layout
      id={`prediction-card-${match.id}`}
      onClick={() => onSelect?.(match.id)}
      className={cn(
        "bg-brand-bg-secondary/40 backdrop-blur-xl rounded-[2rem] border p-4 sm:p-6 hover:border-brand-green/30 transition-all group overflow-hidden relative flex flex-col cursor-pointer",
        featured ? "border-brand-yellow/40 ring-1 ring-brand-yellow/20" : "border-white/5"
      )}
    >
      {/* Background Glow */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 blur-3xl -mr-16 -mt-16 transition-colors",
        featured ? "bg-brand-yellow/10 group-hover:bg-brand-yellow/20" : "bg-brand-green/5 group-hover:bg-brand-green/10"
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 bg-brand-green/20 border-x border-b border-brand-green/30 rounded-b-2xl z-20 backdrop-blur-md">
           <div className="w-1.5 h-1.5 rounded-full bg-brand-green" />
           <span className="text-[7.5px] font-black text-brand-green uppercase tracking-[0.3em]">ANALIZADO POR IA</span>
        </div>
      )}

      <div className="flex flex-col relative z-10">
        {/* Top Row */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2 text-[10px] font-mono text-brand-text-muted bg-brand-bg-primary/50 px-3 py-1.5 rounded-full border border-white/5">
            <Clock className="w-4 h-4 text-brand-green" />
            <span>{formatearFechaHora(match.startTime)}</span>
          </div>
          <div className="flex space-x-0.5">
            {[...Array(3)].map((_, i) => (
              <Star 
                key={i} 
                className={cn(
                  "w-4 h-4 transition-all duration-500", 
                  i < stars ? "text-brand-yellow fill-brand-yellow scale-110" : "text-brand-bg-primary scale-90"
                )} 
              />
            ))}
          </div>
        </div>

        {/* Teams Row */}
        <div className="flex flex-col items-center justify-center mb-10 relative">
          <div className={cn(
            "flex items-center justify-between w-full relative",
            featured ? "max-w-xl mx-auto" : "gap-1.5 sm:gap-4"
          )}>
            <div className="flex flex-col items-center flex-1 max-w-[40%]">
              <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size={featured ? "xl" : "lg"} className="mb-2 sm:mb-4 ring-4 sm:ring-8 ring-white/[0.03] shadow-2xl group-hover:scale-105 transition-transform" />
              <span className={cn(
                "text-center line-clamp-1 uppercase tracking-tight font-black",
                featured ? "text-sm" : "text-xs"
              )}>{match.homeTeam}</span>
              {homeStreakEmojis && (
                <span className="text-[10px] mt-2 select-none font-mono opacity-80" title={`Racha: ${homeStandings?.form || ''}`}>
                  {homeStreakEmojis}
                </span>
              )}
            </div>
            
            <div className="flex flex-col items-center justify-center px-1 sm:px-4">
              <span className="text-[8px] sm:text-[9px] font-black uppercase text-brand-text-muted tracking-[0.1em] sm:tracking-[0.3em] mb-1 sm:mb-2 opacity-60 text-center">Score Proyectado</span>
              <div className={cn(
                "font-black font-display text-brand-text-white tracking-tighter mb-1 select-none leading-none",
                featured ? "text-4xl sm:text-5xl md:text-6xl drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]" : "text-2xl opacity-80"
              )}>
                {alignedUIScore}
              </div>
            </div>

            <div className="flex flex-col items-center flex-1 max-w-[40%] text-right">
              <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size={featured ? "xl" : "lg"} className="mb-2 sm:mb-4 ring-4 sm:ring-8 ring-white/[0.03] shadow-2xl group-hover:scale-105 transition-transform" />
              <span className={cn(
                "text-center line-clamp-1 uppercase tracking-tight font-black",
                featured ? "text-sm" : "text-xs"
              )}>{match.awayTeam}</span>
              {awayStreakEmojis && (
                <span className="text-[10px] mt-2 select-none font-mono opacity-80" title={`Racha: ${awayStandings?.form || ''}`}>
                  {awayStreakEmojis}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Integrated AI Logic Arguments (Mini summary) */}
        <div className={cn(
          "mb-6 flex items-start gap-3 p-4 rounded-2xl border transition-colors",
          featured 
            ? "bg-brand-green/[0.03] border-brand-green/20 ring-1 ring-brand-green/10" 
            : "bg-black/20 border-white/5 group-hover:border-brand-green/10"
        )}>
          <div className={cn(
            "p-1.5 rounded-lg shrink-0 mt-0.5",
            featured ? "bg-brand-green/20" : "bg-white/5"
          )}>
            <AlertCircle className={cn("w-3.5 h-3.5", featured ? "text-brand-green" : "text-brand-text-muted")} />
          </div>
          <div className={cn(
            "text-[11px] leading-relaxed italic line-clamp-2 font-medium tracking-tight",
            featured ? "text-brand-text-white" : "text-brand-text-muted"
          )}>
            {dataLoading || analyzing ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Optimizando argumentos tácticos profundos...
              </span>
            ) : getAiSummarySnippet()}
          </div>
        </div>

        {/* Confianza Híbrida Badge */}
        <div className="mb-4 flex items-center justify-between bg-brand-green/5 border border-brand-green/10 px-4 py-2.5 rounded-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-green animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-brand-text-white">Confianza Híbrida</span>
          </div>
          <span className="text-sm font-mono font-black text-brand-green">{displayConfidence}%</span>
        </div>

        {/* Custom Live Markets Grid */}
        <div className="grid grid-cols-1 gap-2 bg-black/25 p-4 rounded-3xl border border-white/5 mb-4 text-[11px]">
          <div className="grid grid-cols-5 text-[8px] font-black uppercase text-brand-text-muted tracking-widest border-b border-white/5 pb-2">
            <span className="col-span-2">Mercado</span>
            <span className="text-center">Prob</span>
            <span className="text-center">Value</span>
            <span className="text-right">Cuota (Mejor)</span>
          </div>
          
          {/* Over 2.5 Row */}
          <div className="grid grid-cols-5 items-center py-0.5">
            <span className="col-span-2 font-bold text-white/90">Over 2.5 Goles</span>
            <span className="text-center font-mono font-black text-brand-green">{Math.round(displayOverProb * 100)}%</span>
            <span className={cn("text-center font-mono font-bold", overValueEdge > 0.02 ? "text-brand-yellow font-black" : "text-brand-text-muted")}>
              {displayOverValue}
            </span>
            <span className="text-right font-mono text-white/90">
              {displayOverOdds.toFixed(2)} <span className="text-brand-green font-bold">({displayBestOverOdds.toFixed(2)})</span>
            </span>
          </div>

          {/* BTTS Row */}
          <div className="grid grid-cols-5 items-center py-0.5 border-t border-white/5">
            <span className="col-span-2 font-bold text-white/90">Ambos Marcan (BTTS)</span>
            <span className="text-center font-mono font-black text-brand-green">{Math.round(displayBttsProb * 100)}%</span>
            <span className={cn("text-center font-mono font-bold", bttsValueEdge > 0.02 ? "text-brand-yellow font-black" : "text-brand-text-muted")}>
              {displayBttsValue}
            </span>
            <span className="text-right font-mono text-white/90">
              {displayBttsOdds.toFixed(2)}
            </span>
          </div>

          {/* BTTS Propio Row */}
          <div className="grid grid-cols-5 items-center py-1 border-t border-white/5 bg-brand-yellow/5 px-2 rounded-2xl">
            <span className="col-span-2 font-black text-brand-yellow flex items-center gap-1">
              BTTS Propio 🧪
            </span>
            <span className="text-center font-mono font-black text-brand-yellow">{customBttsPercent}%</span>
            <span className={cn("text-center font-mono font-bold", customBttsValueEdge > 0.02 ? "text-brand-yellow font-black" : "text-brand-text-muted")}>
              {displayCustomBttsValue}
            </span>
            <span className="text-right font-mono text-brand-yellow font-semibold">
              {displayBttsOdds.toFixed(2)}
            </span>
          </div>

          {/* Ganador Local Row */}
          <div className="grid grid-cols-5 items-center py-0.5 border-t border-white/5">
            <span className="col-span-2 font-bold text-white/90">Ganador Local (1)</span>
            <span className="text-center font-mono font-black text-brand-green">{Math.round(displayLocalProb * 100)}%</span>
            <span className={cn("text-center font-mono font-bold", localValueEdge > 0.02 ? "text-brand-yellow font-black" : "text-brand-text-muted")}>
              {displayLocalValue}
            </span>
            <span className="text-right font-mono text-white/90">
              {displayLocalOdds.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Injuries section */}
        {injuredPlayers.length > 0 && (
          <div className="mb-4 p-3 bg-red-950/10 border border-brand-red/10 rounded-2xl space-y-1">
            <div className="flex items-center gap-1.5 text-[8.5px] font-black tracking-widest text-[#E11D48] uppercase">
              <span className="inline-block w-1.5 h-1.5 bg-[#E11D48] rounded-full" />
              <span>Parte de Lesiones ({injuredPlayers.length})</span>
            </div>
            <div className="text-[9.5px] text-brand-text-muted divide-y divide-white/5 max-h-[70px] overflow-y-auto pr-1">
              {injuredPlayers.map((p, idx) => (
                <div key={idx} className="py-1 flex justify-between">
                  <span className="font-semibold text-white/90">{p.name} <span className="text-[8.5px] font-mono text-brand-text-muted lowercase">({p.position})</span></span>
                  <span className="text-[7.5px] uppercase font-black tracking-wider text-brand-text-muted">{p.team === 'home' ? 'Local' : 'Visitante'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest",
              isExpanded 
                ? "bg-brand-green/20 border-brand-green text-brand-green" 
                : "bg-brand-bg-primary border-white/5 text-brand-text-muted hover:border-brand-green/30 hover:text-brand-text-white"
            )}
          >
            <Sparkles className="w-4 h-4" />
            {isExpanded ? 'Cerrar Detalles' : 'Ver Detalles'}
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {onSelect && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onSelect(match.id);
              }}
              className="w-12 h-11 flex items-center justify-center bg-brand-bg-primary border border-white/5 rounded-xl text-brand-text-muted hover:border-brand-blue/30 hover:text-brand-blue transition-all"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* AI Analysis Section (Expandable - Deep Mode) */}
        <AnimatePresence mode="wait">
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-8 space-y-6 pt-6 border-t border-white/5">
                {/* Visual Header */}
                <div className="space-y-1 text-center flex flex-col items-center justify-center">
                  <h3 className="text-3xl font-display font-black text-brand-text-white uppercase leading-none tracking-tighter">
                    Análisis
                  </h3>
                  <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.4em] text-center w-full">Basado en rendimiento e historial</p>
                </div>

                <div className="flex items-center justify-center gap-4 text-brand-green mb-4">
                  <div className="w-10 h-10 rounded-full border-2 border-brand-green/30 flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-[0.3em] text-center">Análisis Técnico</span>
                </div>
                
                {analyzing || dataLoading ? (
                  <div className="space-y-4 animate-pulse p-8 bg-brand-bg-primary/30 rounded-[2.5rem] border border-white/5">
                    <div className="h-2 w-full bg-white/10 rounded-full" />
                    <div className="h-2 w-full bg-white/10 rounded-full" />
                    <div className="h-2 w-full bg-white/10 rounded-full" />
                    <div className="h-2 w-3/4 bg-white/10 rounded-full" />
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="relative p-8 bg-gradient-to-br from-brand-bg-secondary to-brand-bg-primary rounded-[2.5rem] border border-brand-green/10 shadow-2xl overflow-hidden group/modal-analysis text-center flex flex-col items-center justify-center">
                       {/* Symmetrical Top Accent Line */}
                       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-brand-green rounded-b-full opacity-60 shadow-[0_0_15px_rgba(34,197,94,0.5)]" />
                       
                       <div className="markdown-body prose prose-invert max-w-none prose-sm md:prose-base analysis-markdown text-center w-full px-4">
                          <ReactMarkdown>
                            {analysisText || "**Análisis BSD:** Cargando parámetros de profundidad estadística..."}
                          </ReactMarkdown>
                       </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                       {[
                         { label: 'Expectativa Goles', val: alignedUIScore, icon: Target, color: 'text-brand-green' },
                         { label: 'Volumen Ataque', val: (homeAvgGoals + awayAvgGoals).toFixed(1), icon: Activity, color: 'text-brand-blue' },
                         { label: 'H2H Trend', val: h2h.length > 0 ? `${h2h[0].homeScore}-${h2h[0].awayScore}` : 'N/A', icon: History, color: 'text-brand-yellow' }
                       ].map((stat, i) => (
                         <div key={i} className="flex flex-col items-center p-4 bg-white/[0.02] rounded-3xl border border-white/5 hover:border-white/10 transition-colors">
                           <stat.icon className={cn("w-5 h-5 mb-2", stat.color)} />
                           <span className="text-[8px] font-black uppercase text-brand-text-muted mb-1 tracking-widest">{stat.label}</span>
                           <span className="text-sm font-mono font-black text-brand-text-white">{stat.val}</span>
                         </div>
                       ))}
                    </div>

                    {/* Estadísticas Históricas Promedio (v2 API & AI Analytics) */}
                    <div className="mt-6 space-y-4 p-6 bg-brand-bg-primary/40 rounded-3xl border border-brand-border text-brand-text-white">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-brand-yellow animate-pulse" />
                        <h4 className="text-xs font-black uppercase text-brand-text-white tracking-widest font-display">Estadísticas Promedio por Partido (v2 API & IA)</h4>
                      </div>
                      
                      <div className="space-y-4 text-xs font-sans">
                        {/* Average Goals bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                            <span>{homeAvgGoalsVal.toFixed(2)} Goles</span>
                            <span>Promedio Histórico Goles</span>
                            <span>{awayAvgGoalsVal.toFixed(2)} Goles</span>
                          </div>
                          <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                            <div className="bg-brand-green" style={{ width: `${(homeAvgGoalsVal / (homeAvgGoalsVal + awayAvgGoalsVal || 1)) * 100}%` }}></div>
                            <div className="bg-brand-blue" style={{ width: `${(awayAvgGoalsVal / (homeAvgGoalsVal + awayAvgGoalsVal || 1)) * 100}%` }}></div>
                          </div>
                        </div>

                        {/* Average Corners bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                            <span>{homeAvgCornersVal.toFixed(1)} Corners</span>
                            <span>Promedio Córneres Estimado</span>
                            <span>{awayAvgCornersVal.toFixed(1)} Corners</span>
                          </div>
                          <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                            <div className="bg-brand-green" style={{ width: `${(homeAvgCornersVal / (homeAvgCornersVal + awayAvgCornersVal || 1)) * 100}%` }}></div>
                            <div className="bg-brand-blue" style={{ width: `${(awayAvgCornersVal / (homeAvgCornersVal + awayAvgCornersVal || 1)) * 100}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Estadísticas Reales del Encuentro (v2 API Integration) */}
                    {(matchStats || loadingStats) && (
                      <div className="mt-8 space-y-4 p-6 bg-brand-bg-primary/40 rounded-3xl border border-brand-border animate-fade-in text-brand-text-white">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-brand-green" />
                          <h4 className="text-xs font-black uppercase text-brand-text-white tracking-widest font-display">Estadísticas de Rendimiento (v2 API)</h4>
                        </div>
                        {loadingStats ? (
                          <div className="space-y-3 py-4 animate-pulse">
                            <div className="h-2.5 bg-brand-text-muted/10 rounded w-2/3 mx-auto"></div>
                            <div className="h-2.5 bg-brand-text-muted/10 rounded w-1/2 mx-auto"></div>
                            <div className="h-2.5 bg-brand-text-muted/10 rounded w-3/4 mx-auto"></div>
                          </div>
                        ) : hasRealStats ? (
                          <div className="space-y-4 text-xs font-sans">
                            {/* Possession bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                                <span>{matchStats.possessionHome}% {match.homeTeam}</span>
                                <span>Posesión de Balón</span>
                                <span>{match.awayTeam} {matchStats.possessionAway}%</span>
                              </div>
                              <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                                <div className="bg-brand-green rounded-l-full" style={{ width: `${matchStats.possessionHome}%` }}></div>
                                <div className="bg-brand-blue rounded-r-full" style={{ width: `${matchStats.possessionAway}%` }}></div>
                              </div>
                            </div>

                            {/* Total Shots bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                                <span>{matchStats.shotsHome} Remates</span>
                                <span>Remates Totales</span>
                                <span>Remates {matchStats.shotsAway}</span>
                              </div>
                              <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                                {Number(matchStats.shotsHome) + Number(matchStats.shotsAway) > 0 ? (
                                  <>
                                    <div className="bg-brand-green" style={{ width: `${(Number(matchStats.shotsHome) / (Number(matchStats.shotsHome) + Number(matchStats.shotsAway))) * 100}%` }}></div>
                                    <div className="bg-brand-blue" style={{ width: `${(Number(matchStats.shotsAway) / (Number(matchStats.shotsHome) + Number(matchStats.shotsAway))) * 100}%` }}></div>
                                  </>
                                ) : (
                                  <div className="w-full bg-brand-border"></div>
                                )}
                              </div>
                            </div>

                            {/* Shots on target */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                                <span>{matchStats.shotsOnTargetHome} Remates arco</span>
                                <span>Remates al Arco</span>
                                <span>Remates arco {matchStats.shotsOnTargetAway}</span>
                              </div>
                              <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                                {Number(matchStats.shotsOnTargetHome) + Number(matchStats.shotsOnTargetAway) > 0 ? (
                                  <>
                                    <div className="bg-brand-green" style={{ width: `${(Number(matchStats.shotsOnTargetHome) / (Number(matchStats.shotsOnTargetHome) + Number(matchStats.shotsOnTargetAway))) * 100}%` }}></div>
                                    <div className="bg-brand-blue" style={{ width: `${(Number(matchStats.shotsOnTargetAway) / (Number(matchStats.shotsOnTargetHome) + Number(matchStats.shotsOnTargetAway))) * 100}%` }}></div>
                                  </>
                                ) : (
                                  <div className="w-full bg-brand-border"></div>
                                )}
                              </div>
                            </div>

                            {/* Corners */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                                <span>{matchStats.cornersHome} Corners</span>
                                <span>Córneres</span>
                                <span>Corners {matchStats.cornersAway}</span>
                              </div>
                              <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                                {Number(matchStats.cornersHome) + Number(matchStats.cornersAway) > 0 ? (
                                  <>
                                    <div className="bg-brand-green" style={{ width: `${(Number(matchStats.cornersHome) / (Number(matchStats.cornersHome) + Number(matchStats.cornersAway))) * 100}%` }}></div>
                                    <div className="bg-brand-blue" style={{ width: `${(Number(matchStats.cornersAway) / (Number(matchStats.cornersHome) + Number(matchStats.cornersAway))) * 100}%` }}></div>
                                  </>
                                ) : (
                                  <div className="w-full bg-brand-border"></div>
                                )}
                              </div>
                            </div>

                            {/* Fouls */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono font-black text-[10px] text-brand-text-muted uppercase">
                                <span>{matchStats.foulsHome} Faltas</span>
                                <span>Faltas Cometidas</span>
                                <span>Faltas {matchStats.foulsAway}</span>
                              </div>
                              <div className="h-2 bg-brand-bg-secondary rounded-full overflow-hidden flex">
                                {Number(matchStats.foulsHome) + Number(matchStats.foulsAway) > 0 ? (
                                  <>
                                    <div className="bg-brand-green" style={{ width: `${(Number(matchStats.foulsHome) / (Number(matchStats.foulsHome) + Number(matchStats.foulsAway))) * 100}%` }}></div>
                                    <div className="bg-brand-blue" style={{ width: `${(Number(matchStats.foulsAway) / (Number(matchStats.foulsHome) + Number(matchStats.foulsAway))) * 100}%` }}></div>
                                  </>
                                ) : (
                                  <div className="w-full bg-brand-border"></div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 px-4 bg-brand-bg-secondary/40 rounded-2xl border border-brand-border/40 text-brand-text-muted text-xs font-sans">
                            <p>El encuentro aún no ha comenzado o no hay estadísticas en tiempo real disponibles en este momento.</p>
                            <p className="mt-1 font-mono text-[10px] text-brand-text-muted/65 uppercase tracking-wider">Las estadísticas en vivo se activarán una vez inicie el partido.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Post-Match Refinement Section */}
                    {match.status === 'FINISHED' && (
                      <div className="mt-8 p-6 bg-brand-green/5 border border-brand-green/20 rounded-3xl">
                        <div className="flex items-center gap-3 mb-4">
                          <ShieldCheck className="w-5 h-5 text-brand-green" />
                          <h4 className="text-xs font-black uppercase text-white tracking-widest">Resumen de Seguimiento</h4>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                            <span>Resultado Real</span>
                            <span className="text-brand-green font-mono">{match.homeScore} - {match.awayScore}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                            <span>Estado</span>
                            <span className="text-brand-green font-mono">FINALIZADO</span>
                          </div>
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
