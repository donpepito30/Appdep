import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Stats, Prediction, OddMarket, Incident, H2HHistory, EventMetadata, LineupData, PlayerMatchStats } from '../types';
import { XGEvolutionChart } from './Charts';
import { TeamLogo } from './TeamLogo';
import { Activity, Target, Zap, ShieldAlert, BarChart3, TrendingUp, ChevronUp, History, Info, HelpCircle, Swords, RefreshCw, ShieldCheck, Users, Shirt, Sparkles, AlertCircle, MessageSquare, Tv, Crosshair } from 'lucide-react';
import { SocialTab, BroadcastsTab, ShotmapTab } from './ExtendedTabs';
import { cn } from '../types';
import { api, getImgUrl } from '../services/api';
import { generateMatchPreview } from '../lib/gemini';
import { Footer } from './Footer';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useTeamModal } from '../contexts/TeamModalContext';

interface DashboardProps {
  match: { 
    id: string; 
    homeTeam: string; 
    awayTeam: string; 
    homeScore: number; 
    awayScore: number;
    homeLogo?: string;
    awayLogo?: string;
    currentMinute?: number;
    addedTime?: number;
    liveWebsocket?: boolean;
    status: 'LIVE' | 'FINISHED' | 'SCHEDULED';
    homeTeamId?: string;
    awayTeamId?: string;
    leagueName?: string;
    leagueId?: string;
    xgHome?: number;
    xgAway?: number;
  };
  stats: Stats | null;
  prediction: Prediction | null;
  odds: OddMarket | null;
  incidents: Incident[];
  momentum: number;
  lastStats: Stats | null;
  metadata: EventMetadata | null;
  lineups: LineupData | null;
  playerStats: PlayerMatchStats[];
  syncMatchDetail?: (id: string, options: { stats?: boolean; slow?: boolean; forms?: boolean }) => Promise<void>;
}

interface AdvancedStats {
  goalsPerMatch: number;
  shotsPerMatch: number;
  sotPerMatch: number;
  xgPerMatch: number;
  gaPerMatch: number;
  shotsAgainstPerMatch: number;
  foulsPerMatch: number;
  cleanSheetsPercent: number;
  possessionAvg: number;
  passAccuracyAvg: number;
  keyPassesPerMatch: number;
  duelsWonPercent: number;
}

type DashboardTab = 'summary' | 'predictions' | 'stats' | 'h2h' | 'lineups' | 'shotmap';

export function MatchDashboard({ match, stats, prediction, odds, incidents, momentum, lastStats, metadata, lineups, playerStats, syncMatchDetail }: DashboardProps) {
  const [activeTab, setActiveTab] = React.useState<DashboardTab>('summary');
  
  const dashboardRef = useRef<HTMLDivElement>(null);
  const entry = useIntersectionObserver(dashboardRef, { threshold: 0.1 });
  const isVisible = entry?.isIntersecting ?? true;

  const { openTeamModal } = useTeamModal();

  // Optimized Sync Loop
  useEffect(() => {
    if (!isVisible || !match.id || !syncMatchDetail) return;

    const performSync = () => {
      syncMatchDetail(match.id, {
        stats: true, // Siempre sincronizamos stats si estamos viendo el panel
        slow: activeTab === 'summary' || activeTab === 'lineups' || activeTab === 'stats',
        forms: activeTab === 'predictions' || activeTab === 'h2h'
      });
    };

    // Initial sync
    performSync();

    const interval = setInterval(performSync, 35000);
    return () => clearInterval(interval);
  }, [match.id, isVisible, activeTab, syncMatchDetail]);

  const [h2hHistory, setH2HHistory] = useState<H2HHistory[]>([]);
  const [loadingH2H, setLoadingH2H] = useState(false);
  
  const [homeAdvancedStats, setHomeAdvancedStats] = useState<AdvancedStats | null>(null);
  const [awayAdvancedStats, setAwayAdvancedStats] = useState<AdvancedStats | null>(null);
  const [loadingAdvanced, setLoadingAdvanced] = useState(false);

  const [aiPreview, setAIPreview] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const strategyData = homeAdvancedStats && awayAdvancedStats ? {
    homeStats: { avgGoals: homeAdvancedStats.goalsPerMatch, avgAgainst: homeAdvancedStats.gaPerMatch },
    awayStats: { avgGoals: awayAdvancedStats.goalsPerMatch, avgAgainst: awayAdvancedStats.gaPerMatch },
    h2h: h2hHistory.slice(0, 5)
  } : null;

  useEffect(() => {
    // Load H2H if we are on H2H history or Strategy tab
    if (activeTab === 'h2h' && h2hHistory.length === 0 && !loadingH2H) {
      setLoadingH2H(true);
      const h2hId1 = match.homeTeamId || match.homeTeam;
      const h2hId2 = match.awayTeamId || match.awayTeam;
      api.getH2H(h2hId1, h2hId2).then(data => {
        setH2HHistory(data);
        setLoadingH2H(false);
      }).catch(err => {
        console.error("Error loading H2H:", err);
        setLoadingH2H(false);
      });
    }

    // Load Advanced Stats if we are on Analysis tab
    if (activeTab === 'stats' && !homeAdvancedStats && match.homeTeamId && match.awayTeamId && !loadingAdvanced) {
      setLoadingAdvanced(true);
      
      const calculateStats = (fixtures: any[], teamId: string): AdvancedStats => {
        const count = fixtures.length || 1;
        let tGoals = 0, tGA = 0, tShots = 0, tSOT = 0, tXG = 0, tShotsAgainst = 0, tFouls = 0, cleanSheets = 0;
        let tPoss = 0, tPassAcc = 0, tKeyPasses = 0, tDuels = 0;

        fixtures.forEach(f => {
          const isHome = String(f.homeTeamId) === teamId;
          const gf = isHome ? f.homeScore : f.awayScore;
          const ga = isHome ? f.awayScore : f.homeScore;
          tGoals += gf;
          tGA += ga;
          if (ga === 0) cleanSheets++;

          // Attempt to extract from embedded stats if present
          const s = f.stats || {};
          const xg = isHome ? (f.xgHome || s.xgHome) : (f.xgAway || s.xgAway);
          const xga = isHome ? (f.xgAway || s.xgAway) : (f.xgHome || s.xgHome);
          tXG += xg || (gf * 0.85); // Fallback if no xG
          
          const shots = isHome ? (s.shotsHome) : (s.shotsAway);
          tShots += shots || 12; // Fallback
          
          const sot = isHome ? (s.shotsOnTargetHome) : (s.shotsOnTargetAway);
          tSOT += sot || 4.5;
          
          const sa = isHome ? (s.shotsAway) : (s.shotsHome);
          tShotsAgainst += sa || 10;
          
          const fouls = isHome ? (s.foulsHome) : (s.foulsAway);
          tFouls += fouls || 11;
          
          const poss = isHome ? (s.possessionHome) : (s.possessionAway);
          tPoss += poss || 50;

          // Advanced metrics using realistic deterministic calculation based on scores/xg if missing
          tPassAcc += s.passAccuracy || (80 + ((poss || 50) > 50 ? 5 : 0) + (gf * 1.5));
          tKeyPasses += s.keyPasses || (tSOT / count * 1.5);
          tDuels += s.duelsWon || (50 + (gf > ga ? 3 : -1));
        });

        return {
          goalsPerMatch: tGoals / count,
          shotsPerMatch: tShots / count,
          sotPerMatch: tSOT / count,
          xgPerMatch: tXG / count,
          gaPerMatch: tGA / count,
          shotsAgainstPerMatch: tShotsAgainst / count,
          foulsPerMatch: tFouls / count,
          cleanSheetsPercent: (cleanSheets / count) * 100,
          possessionAvg: tPoss / count,
          passAccuracyAvg: tPassAcc / count,
          keyPassesPerMatch: tKeyPasses / count,
          duelsWonPercent: tDuels / count
        };
      };

      Promise.all([
        api.getFixtures(match.homeTeamId, 10),
        api.getFixtures(match.awayTeamId, 10)
      ]).then(([homeFix, awayFix]) => {
        const hStats = calculateStats(homeFix, match.homeTeamId!);
        const aStats = calculateStats(awayFix, match.awayTeamId!);
        setHomeAdvancedStats(hStats);
        setAwayAdvancedStats(aStats);
        setLoadingAdvanced(false);
      });
    }

    // Independent AI Preview generation ONLY when Summary tab is selected (if meta preview is missing)
    if (activeTab === 'summary' && !metadata?.ai_preview && !aiPreview && !isGeneratingAI && match.homeTeamId && match.awayTeamId) {
       setIsGeneratingAI(true);
       
       Promise.all([
         api.getFixtures(match.homeTeamId, 5),
         api.getFixtures(match.awayTeamId, 5)
       ]).then(([homeFix, awayFix]) => {
          const homeForm = homeFix.map(f => {
            const isHome = String(f.homeTeamId) === match.homeTeamId;
            const gf = isHome ? f.homeScore : f.awayScore;
            const ga = isHome ? f.awayScore : f.homeScore;
            if (gf > ga) return 'W';
            if (gf < ga) return 'L';
            return 'D';
          });

          const awayForm = awayFix.map(f => {
            const isHome = String(f.homeTeamId) === match.awayTeamId;
            const gf = isHome ? f.homeScore : f.awayScore;
            const ga = isHome ? f.awayScore : f.homeScore;
            if (gf > ga) return 'W';
            if (gf < ga) return 'L';
            return 'D';
          });

          generateMatchPreview(
            match.homeTeam,
            match.awayTeam,
            homeForm,
            awayForm,
            'Historial reciente sincronizado.',
            match.id
          ).then(text => {
            setAIPreview(text);
            setIsGeneratingAI(false);
          }).catch(() => setIsGeneratingAI(false));
       }).catch(() => setIsGeneratingAI(false));
    }
  }, [activeTab, match.homeTeam, match.awayTeam, match.homeTeamId, match.awayTeamId]);

  const getDiff = (current: number, last: number | undefined) => {
    if (last === undefined) return null;
    const diff = current - last;
    if (diff === 0) return null;
    return (
      <span className={cn("text-[10px] ml-1 font-mono", diff > 0 ? "text-brand-green" : "text-brand-red")}>
        {diff > 0 ? '+' : ''}{(diff || 0).toFixed(2)}
      </span>
    );
  };

  return (
    <div ref={dashboardRef} className="flex-1 flex flex-col bg-brand-bg-primary min-h-0 min-w-0 w-full overflow-hidden font-sans">
      {/* Persistent Match Header */}
      <div className="bg-brand-bg-card/80 backdrop-blur-md border-b border-white/5 px-4 md:px-6 py-4 md:py-8 relative z-50 shrink-0 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center justify-between max-w-6xl mx-auto gap-3 md:gap-8 relative z-10 w-full">
          {/* Team Home */}
          <div className="w-full md:flex-1 flex items-center md:space-x-4 lg:space-x-6 min-w-0 order-2 md:order-1">
            <div className="shrink-0 group cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: match.homeLogo, leagueId: match.leagueId }); }}>
              <div className="w-16 h-16 xs:w-20 xs:h-20 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-black/40 rounded-xl md:rounded-[2rem] p-1.5 md:p-3 border border-white/5 group-hover:scale-105 group-hover:border-brand-green/30 transition-all duration-500 shadow-2xl">
                <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="lg" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="flex flex-col min-w-0 ml-2.5 md:ml-0 notranslate" translate="no">
              <h2 className="text-xs xs:text-base md:text-xl lg:text-3xl font-display font-black tracking-tighter text-brand-text-white truncate uppercase leading-none mb-1 md:mb-2">{match.homeTeam}</h2>
              <div className="flex items-center gap-1.5 md:gap-2">
                 <div className="h-2.5 md:h-3 w-[2px] bg-brand-green" />
                 <span className="text-[7px] xs:text-[8px] md:text-[10px] lg:text-[11px] text-brand-text-muted uppercase font-black tracking-[0.2em] truncate">{match.leagueName || 'Match Intel'}</span>
              </div>
            </div>
          </div>

          {/* Score & Meta */}
          <div className="flex flex-col items-center shrink-0 order-1 md:order-2 mb-1 md:mb-0">
            <div className="flex items-center gap-4 md:gap-6 lg:gap-10">
              <div className="text-2xl xs:text-4xl md:text-6xl lg:text-7xl font-black font-display font-tabular tracking-tighter text-brand-text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                {match.homeScore} <span className="text-white/10 mx-[-4px]">:</span> {match.awayScore}
              </div>
            </div>
            {match.status === 'LIVE' && (
              <div className="flex items-center mt-1 md:mt-3 px-2 md:px-3 py-0.5 md:py-1 bg-brand-red/10 rounded-full border border-brand-red/20">
                <span className="relative flex h-1 w-1 md:h-2 md:w-2 mr-1 md:mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-full w-full bg-brand-red"></span>
                </span>
                <span className="text-[7px] xs:text-[8px] md:text-[10px] lg:text-[11px] font-mono font-black text-brand-red uppercase tracking-widest">{match.currentMinute}' <span className="hidden sm:inline">EN VIVO</span></span>
              </div>
            )}
            {match.status === 'FINISHED' && (
              <div className="mt-1 md:mt-3 px-2 md:px-3 py-0.5 md:py-1 bg-white/5 rounded-full border border-white/10">
                <span className="text-[7px] xs:text-[8px] md:text-[10px] uppercase font-black text-brand-text-muted tracking-[0.2em]">Finalizado</span>
              </div>
            )}
          </div>

          {/* Team Away */}
          <div className="w-full md:flex-1 flex items-center justify-end md:space-x-4 lg:space-x-6 min-w-0 order-3">
            <div className="flex flex-col items-end min-w-0 mr-2.5 md:mr-0 notranslate" translate="no">
              <h2 className="text-xs xs:text-base md:text-xl lg:text-3xl font-display font-black tracking-tighter text-brand-text-white text-right truncate uppercase leading-none mb-1 md:mb-2">{match.awayTeam}</h2>
              <div className="flex items-center gap-1.5 md:gap-2">
                 <span className="text-[7px] xs:text-[8px] md:text-[10px] lg:text-[11px] text-brand-text-muted uppercase font-black tracking-[0.2em] truncate">Visita</span>
                 <div className="h-2.5 md:h-3 w-[2px] bg-brand-text-muted/30" />
              </div>
            </div>
            <div className="shrink-0 group cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: match.awayLogo, leagueId: match.leagueId }); }}>
              <div className="w-16 h-16 xs:w-20 xs:h-20 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-black/40 rounded-xl md:rounded-[2rem] p-1.5 md:p-3 border border-white/5 group-hover:scale-105 group-hover:border-brand-green/30 transition-all duration-500 shadow-2xl">
                <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="lg" className="w-full h-full object-contain" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div 
        role="tablist"
        aria-label="Match analysis navigation"
        className="flex w-full bg-brand-bg-card/30 border-b border-white/5 shrink-0 touch-scroll-x scrollbar-hide overflow-x-auto"
      >
        <div className="flex flex-nowrap min-w-max md:min-w-0 md:justify-center w-full px-4">
          {[
            { id: 'summary', label: 'Dashboard', icon: Activity },
            { id: 'predictions', label: 'Predictions', icon: Zap },
            { id: 'h2h', label: 'History', icon: Swords },
            { id: 'stats', label: 'Analytical', icon: BarChart3 },
            { id: 'lineups', label: 'Lineups', icon: Users },
            { id: 'shotmap', label: 'Shot Map', icon: Crosshair }
          ].map(t => (
              <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id as DashboardTab)}
              className={cn(
                "shrink-0 flex items-center justify-center space-x-1.5 md:space-x-3 py-3 md:py-6 px-3.5 md:px-8 text-[8px] md:text-[11px] font-black uppercase tracking-[0.05em] md:tracking-[0.2em] transition-all relative border-b-2",
                activeTab === t.id 
                  ? "border-brand-green text-white bg-brand-green/5" 
                  : "border-transparent text-brand-text-muted hover:text-brand-text-white hover:bg-white/5"
              )}
            >
              <div className={cn(
                "custom-icon-wrapper scale-[0.65] md:scale-90",
                activeTab === t.id ? "bg-brand-green/20 border-brand-green/30 shadow-[0_0_15px_rgba(0,255,136,0.2)]" : ""
              )}>
                <t.icon className={cn("w-3 md:w-4 h-3 md:h-4", activeTab === t.id ? "text-brand-green" : "text-brand-text-muted")} />
              </div>
              <span className="whitespace-nowrap">{t.label}</span>
              {activeTab === t.id && (
                 <motion.div layoutId="activeTabGlow" className="absolute inset-0 bg-brand-green/10 blur-xl -z-10" />
              )}
            </button>
          ))}
        </div>
      </div>


      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-24 md:pb-12 scroll-smooth touch-scroll">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6 pb-20 md:pb-12"
          >
            {activeTab === 'shotmap' && (
              <ShotmapTab eventId={match.id} />
            )}
            {activeTab === 'h2h' && (
              <div className="space-y-6">
                {loadingH2H ? (
                  <div className="bg-brand-bg-card p-10 md:p-12 rounded-[2rem] border border-brand-border/40 text-center space-y-6 shadow-xl">
                    <RefreshCw className="w-12 h-12 text-brand-green animate-spin mx-auto" />
                    <p className="text-brand-text-muted uppercase text-[10px] font-black tracking-widest">Cargando Historial...</p>
                  </div>
                ) : h2hHistory.length === 0 ? (
                  <div className="bg-brand-bg-card p-10 md:p-12 rounded-[2rem] border border-brand-border/40 text-center space-y-4 shadow-xl">
                    <History className="w-12 h-12 text-brand-text-muted mx-auto opacity-20" />
                    <p className="text-brand-text-muted uppercase text-[10px] font-black tracking-widest">Sin enfrentamientos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* H2H Summary Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                       {/* W/D/L Ratio */}
                       {(() => {
                         const h2hStats = h2hHistory.reduce((acc, curr) => {
                           const currentHomeId = match.homeTeamId || match.homeTeam;
                           const isHomeActualHome = curr.homeTeamId === currentHomeId || curr.homeTeam === match.homeTeam;
                           
                           if (isHomeActualHome) {
                             acc.homeGoals += curr.homeScore;
                             acc.awayGoals += curr.awayScore;
                             if (curr.homeScore > curr.awayScore) acc.homeWins++;
                             else if (curr.homeScore < curr.awayScore) acc.awayWins++;
                             else acc.draws++;
                           } else {
                             acc.homeGoals += curr.awayScore;
                             acc.awayGoals += curr.homeScore;
                             if (curr.awayScore > curr.homeScore) acc.homeWins++;
                             else if (curr.awayScore < curr.homeScore) acc.awayWins++;
                             else acc.draws++;
                           }
                           return acc;
                         }, { homeWins: 0, awayWins: 0, draws: 0, homeGoals: 0, awayGoals: 0 });
                         
                         const total = h2hHistory.length || 1;
                         
                         return (
                           <>
                             <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl space-y-4">
                               <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                 <div className="custom-icon-wrapper w-8 h-8 scale-75">
                                   <Target className="w-4 h-4 text-brand-green" />
                                 </div>
                                 Distribución Geográfica
                               </h4>
                               <div className="flex justify-between items-end h-24 gap-2">
                                 <div className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-mono font-bold text-brand-green">{h2hStats.homeWins}</span>
                                    <div className="w-full bg-brand-green rounded-t-lg transition-all duration-1000" style={{ height: `${(h2hStats.homeWins/total)*100}%` }} />
                                    <span className="text-[8px] font-black text-brand-text-muted uppercase text-center">{match.homeTeam.substring(0, 3)}</span>
                                 </div>
                                 <div className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-mono font-bold text-brand-yellow">{h2hStats.draws}</span>
                                    <div className="w-full bg-brand-yellow rounded-t-lg transition-all duration-1000" style={{ height: `${(h2hStats.draws/total)*100}%` }} />
                                    <span className="text-[8px] font-black text-brand-text-muted uppercase">Emp.</span>
                                 </div>
                                 <div className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-mono font-bold text-brand-red">{h2hStats.awayWins}</span>
                                    <div className="w-full bg-brand-red rounded-t-lg transition-all duration-1000" style={{ height: `${(h2hStats.awayWins/total)*100}%` }} />
                                    <span className="text-[8px] font-black text-brand-text-muted uppercase text-center">{match.awayTeam.substring(0, 3)}</span>
                                 </div>
                               </div>
                             </div>

                             <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl space-y-4">
                                <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                  <div className="custom-icon-wrapper w-8 h-8 scale-75">
                                    <Zap className="w-4 h-4 text-brand-yellow" />
                                  </div>
                                  Promedio de Goles
                                </h4>
                                <div className="space-y-4 py-2">
                                   <div className="flex justify-between items-center text-center">
                                      <div className="flex-1">
                                         <span className="text-[8px] text-brand-text-muted uppercase font-bold tracking-widest block mb-1">Local</span>
                                         <span className="text-xl font-mono font-black text-brand-text-white">{(h2hStats.homeGoals / total).toFixed(2)}</span>
                                      </div>
                                      <div className="w-px h-8 bg-brand-border/30 mx-2" />
                                      <div className="flex-1">
                                         <span className="text-[8px] text-brand-text-muted uppercase font-bold tracking-widest block mb-1">Visita</span>
                                         <span className="text-xl font-mono font-black text-brand-text-white">{(h2hStats.awayGoals / total).toFixed(2)}</span>
                                      </div>
                                   </div>
                                   <div className="bg-brand-bg-primary/50 py-2.5 rounded-2xl border border-white/5 text-center">
                                      <span className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest block mb-0.5">Total Media de Goles</span>
                                      <span className="text-lg font-mono font-black text-brand-green">{((h2hStats.homeGoals + h2hStats.awayGoals) / total).toFixed(2)}</span>
                                   </div>
                                </div>
                             </div>

                             <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl flex flex-col justify-between">
                                <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                  <div className="custom-icon-wrapper w-8 h-8 scale-75">
                                    <Activity className="w-4 h-4 text-brand-blue" />
                                  </div>
                                  Estado de Forma Mutual
                                </h4>
                                <div className="flex justify-center items-center py-4">
                                   <div className="flex gap-2">
                                      {h2hHistory.slice(0, 5).map((h, i) => {
                                        const currentHomeId = match.homeTeamId || match.homeTeam;
                                        const isHomeActualHome = h.homeTeamId === currentHomeId || h.homeTeam === match.homeTeam;
                                        
                                        let result = 'D';
                                        if (isHomeActualHome) {
                                          if (h.homeScore > h.awayScore) result = 'W';
                                          else if (h.homeScore < h.awayScore) result = 'L';
                                        } else {
                                          if (h.awayScore > h.homeScore) result = 'W';
                                          else if (h.awayScore < h.homeScore) result = 'L';
                                        }
                                        
                                        return (
                                          <div key={i} className={cn(
                                            "w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm",
                                            result === 'W' ? "bg-brand-green/20 text-brand-green border border-brand-green/30" :
                                            result === 'L' ? "bg-brand-red/20 text-brand-red border border-brand-red/30" :
                                            "bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30"
                                          )}>
                                            {result}
                                          </div>
                                        );
                                      })}
                                   </div>
                                </div>
                                <p className="text-[9px] text-brand-text-muted text-center italic tracking-tight">Visto desde la perspectiva del Local</p>
                             </div>
                           </>
                         );
                       })()}
                    </div>

                    {/* H2H List */}
                    <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl">
                      <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest mb-6 flex items-center space-x-2">
                        <History className="w-3.5 h-3.5 text-brand-yellow" />
                        <span>Cruces Históricos Completos</span>
                      </h4>
                      <div className="space-y-4">
                        {h2hHistory.map((h, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-brand-bg-primary/50 border border-brand-border/30 rounded-[1.5rem] hover:bg-white/5 transition-all group overflow-hidden">
                            <div className="flex flex-col shrink-0 min-w-[70px]">
                               <span className="text-[10px] font-mono font-bold text-brand-text-white">{new Date(h.date).toLocaleDateString()}</span>
                               <span className="text-[8px] text-brand-text-muted uppercase font-black tracking-tighter mt-1">{h.league || 'Liga'}</span>
                            </div>
                            <div className="flex-1 flex justify-center items-center space-x-4 md:space-x-8 px-2">
                              <span className="text-[11px] font-bold w-20 md:w-40 text-right truncate text-brand-text-light">{h.homeTeam}</span>
                              <div className="flex items-center bg-brand-bg-primary/80 px-4 py-2.5 rounded-2xl border border-white/5 font-mono font-black text-sm shadow-inner group-hover:scale-105 transition-transform min-w-[80px] justify-center">
                                <span className={h.homeScore > h.awayScore ? "text-brand-green" : "text-brand-text-white"}>{h.homeScore}</span>
                                <span className="mx-2 text-brand-text-muted opacity-30">-</span>
                                <span className={h.awayScore > h.homeScore ? "text-brand-green" : "text-brand-text-white"}>{h.awayScore}</span>
                              </div>
                              <span className="text-[11px] font-bold w-20 md:w-40 text-left truncate text-brand-text-light">{h.awayTeam}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'predictions' && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {!prediction ? (
                  <div className="glass-card p-16 rounded-[3rem] border border-white/5 text-center space-y-8">
                     <Zap className="w-16 h-16 text-brand-yellow animate-pulse mx-auto opacity-50" />
                     <p className="text-brand-text-muted uppercase text-[12px] font-black tracking-[0.4em]">Calculando Probabilidades IA</p>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {/* Hero Best Bet / Value Pick */}
                    {prediction.valueAnalysis?.isValue ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative overflow-hidden group"
                      >
                         <div className="absolute inset-0 bg-gradient-to-r from-brand-green/20 via-brand-bg-card to-brand-green/10 rounded-[3rem] blur-3xl opacity-30 -z-10 group-hover:opacity-50 transition-all duration-1000" />
                         <div className="premium-gradient border-2 border-brand-green/30 p-10 md:p-14 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                               <TrendingUp className="w-48 h-48 text-brand-green" />
                            </div>
                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                               <div className="space-y-6 text-center md:text-left flex-1">
                                  <div className="flex items-center justify-center md:justify-start gap-4">
                                     <div className="px-4 py-1.5 bg-brand-green text-black text-[10px] font-black uppercase tracking-[0.3em] rounded-full shadow-lg">Value Discovery</div>
                                     <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em]">{prediction.valueAnalysis.percentage?.toFixed(1) || '0.0'}% ADVANTAGE</span>
                                  </div>
                                  <div>
                                     <h3 className="text-5xl md:text-7xl font-display font-black text-brand-text-white uppercase tracking-tighter leading-none mb-4">
                                        {prediction.valueAnalysis.market}
                                     </h3>
                                     <div className="inline-flex items-center gap-3 bg-black/40 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/10">
                                        <span className="text-2xl font-mono font-black text-brand-green">@{prediction.valueAnalysis.odds?.toFixed(2)}</span>
                                        <div className="h-4 w-px bg-white/10" />
                                        <span className="text-sm font-black text-white/40 uppercase tracking-widest">Market Value</span>
                                     </div>
                                  </div>
                               </div>
                               <div className="shrink-0 flex flex-col items-center justify-center">
                                  <div className="relative">
                                     <svg className="w-32 h-32 md:w-44 md:h-44 transform -rotate-90">
                                       <circle cx="50%" cy="50%" r="45%" className="stroke-white/5 fill-none" strokeWidth="8" />
                                       <motion.circle 
                                          cx="50%" cy="50%" r="45%" 
                                          className="stroke-brand-green fill-none" 
                                          strokeWidth="8" 
                                          strokeDasharray="283"
                                          initial={{ strokeDashoffset: 283 }}
                                          animate={{ strokeDashoffset: 283 - (283 * (prediction.valueAnalysis.probability || 0.6)) }}
                                          transition={{ duration: 2, ease: "easeOut" }}
                                          strokeLinecap="round"
                                       />
                                     </svg>
                                     <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-4xl md:text-5xl font-display font-black text-brand-text-white leading-none">
                                           {((prediction.valueAnalysis.probability || 0.6) * 100).toFixed(0)}%
                                        </span>
                                        <span className="text-[9px] font-black text-brand-text-muted uppercase tracking-widest mt-1">Trust Score</span>
                                     </div>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </motion.div>
                    ) : (
                        (() => {
                        const markets = [
                          { label: 'Victory Home', prob: prediction.homeWinProb, odd: odds?.home_win },
                          { label: 'Draw Sequence', prob: prediction.drawProb, odd: odds?.draw },
                          { label: 'Victory Away', prob: prediction.awayWinProb, odd: odds?.away_win },
                          { label: 'Both to Score', prob: prediction.bttsProb || 0, odd: odds?.btts_yes },
                          { label: 'High Scoring', prob: prediction.over25Prob || 0, odd: odds?.over_25_goals },
                        ].filter(m => m.odd && m.prob > 0);

                        const best = markets.reduce((prev, curr) => {
                          const prevValue = prev.odd ? ((prev.prob - (1 / prev.odd)) / (1 / prev.odd)) : -999;
                          const currValue = curr.odd ? ((curr.prob - (1 / curr.odd)) / (1 / curr.odd)) : -999;
                          return currValue > prevValue ? curr : prev;
                        }, markets[0]);

                        if (!best || !best.odd) return null;
                        return (
                          <div className="bg-brand-bg-card p-10 rounded-[3.5rem] border border-white/5 shadow-2xl relative overflow-hidden group transition-all hover:bg-brand-bg-card/80">
                             <div className="absolute top-0 right-0 w-96 h-96 bg-brand-green/5 blur-[120px] -mr-48 -mt-48 pointer-events-none" />
                             <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                <div className="space-y-4 text-center md:text-left">
                                   <div className="flex items-center justify-center md:justify-start gap-3">
                                      <Sparkles className="w-5 h-5 text-brand-green animate-pulse" />
                                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-green/80">Premium Algorithmic Pick</span>
                                   </div>
                                   <h3 className="text-4xl md:text-6xl font-display font-black text-brand-text-white uppercase tracking-tighter">
                                      {best.label} <span className="text-brand-green">@{best.odd.toFixed(2)}</span>
                                   </h3>
                                </div>
                                <div className="flex items-center gap-10">
                                   <div className="text-center">
                                      <div className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mb-1">Impact Probability</div>
                                      <div className="text-5xl font-display font-black text-brand-text-white tracking-tighter">{(best.prob * 100).toFixed(0)}%</div>
                                   </div>
                                   <div className="w-16 h-16 rounded-2xl bg-brand-green flex items-center justify-center shadow-lg shadow-brand-green/20">
                                      <TrendingUp className="w-8 h-8 text-black" />
                                   </div>
                                </div>
                             </div>
                          </div>
                        );
                        })()
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      {/* Detailed 1X2 Probabilities */}
                      <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                        <div className="flex flex-col gap-10">
                          <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] flex items-center gap-3">
                            <Target className="w-5 h-5 text-brand-red" /> Probability Matrix <span className="text-brand-text-white">1X2</span>
                          </h4>

                          <div className="grid grid-cols-3 gap-12">
                             <div className="text-center group">
                                <div className={cn("text-5xl font-display font-black tracking-tighter transition-all group-hover:scale-110", prediction.homeWinProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.homeWinProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-3 tracking-[0.2em]">{match.homeTeam}</div>
                                {odds?.home_win && <div className="mt-3 text-[12px] font-mono font-black text-white/30 bg-white/5 py-1 px-3 rounded-full inline-block group-hover:text-brand-green transition-colors">@{odds.home_win.toFixed(2)}</div>}
                             </div>
                             <div className="text-center group">
                                <div className={cn("text-5xl font-display font-black tracking-tighter transition-all group-hover:scale-110", prediction.drawProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.drawProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-3 tracking-[0.2em]">Draw</div>
                                {odds?.draw && <div className="mt-3 text-[12px] font-mono font-black text-white/30 bg-white/5 py-1 px-3 rounded-full inline-block group-hover:text-brand-green transition-colors">@{odds.draw.toFixed(2)}</div>}
                             </div>
                             <div className="text-center group">
                                <div className={cn("text-5xl font-display font-black tracking-tighter transition-all group-hover:scale-110", prediction.awayWinProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.awayWinProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-3 tracking-[0.2em]">{match.awayTeam}</div>
                                {odds?.away_win && <div className="mt-3 text-[12px] font-mono font-black text-white/30 bg-white/5 py-1 px-3 rounded-full inline-block group-hover:text-brand-green transition-colors">@{odds.away_win.toFixed(2)}</div>}
                             </div>
                          </div>

                          <div className="relative h-4 bg-white/5 rounded-full overflow-hidden p-1">
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.homeWinProb * 100}%` }} className="bg-brand-green h-full rounded-full mr-0.5" />
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.drawProb * 100}%` }} className="bg-brand-yellow h-full mr-0.5" />
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.awayWinProb * 100}%` }} className="bg-brand-red h-full rounded-full" />
                          </div>
                        </div>
                      </div>

                      {/* Precise Scoreline Engine */}
                      <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col justify-center items-center text-center group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-brand-green/20 via-transparent to-brand-red/20 opacity-0 group-hover:opacity-10 transition-opacity duration-1000" />
                        <div className="relative z-10 space-y-10 w-full">
                          <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Precise Score Engine</h4>
                          <div className="flex items-center justify-center gap-10">
                             <div className="flex flex-col items-center gap-2">
                                <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="md" className="w-16 h-16 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" />
                                <span className="text-[9px] font-black text-brand-text-muted uppercase tracking-widest">{match.homeTeam}</span>
                             </div>
                             <div className="text-7xl md:text-8xl font-display font-black text-brand-text-white tracking-tighter bg-gradient-to-b from-white/10 to-transparent px-10 py-6 rounded-[3rem] border border-white/10 shadow-2xl">
                               {(() => {
                                 if (prediction?.scoreline && prediction.scoreline !== '?-?') return prediction.scoreline;
                                 if (match.status === 'LIVE') {
                                    const projHome = (match.homeScore || 0) + Math.round((match.xgHome || 0.5) * 1.5);
                                    const projAway = (match.awayScore || 0) + Math.round((match.xgAway || 0.5) * 1.5);
                                    return `${projHome}:${projAway}`;
                                 }
                                 const homeGoals = Math.round((match.xgHome || 1.2) * 1.4);
                                 const awayGoals = Math.round((match.xgAway || 1.0) * 1.2);
                                 return `${homeGoals}:${awayGoals}`;
                               })()}
                             </div>
                             <div className="flex flex-col items-center gap-2">
                                <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="md" className="w-16 h-16 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" />
                                <span className="text-[9px] font-black text-brand-text-muted uppercase tracking-widest">{match.awayTeam}</span>
                             </div>
                          </div>
                          <div className="flex items-center justify-center gap-3">
                             <div className="h-4 w-4 rounded-full bg-brand-green/20 flex items-center justify-center">
                                <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="w-1.5 h-1.5 bg-brand-green rounded-full" />
                             </div>
                             <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.3em]">Neural Prediction Engine Active</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Markets Breakdown */}
                    <div className="space-y-8">
                       <div className="flex items-center gap-4 px-2 text-brand-text-muted uppercase font-black text-[11px] tracking-[0.4em]">
                          <div className="custom-icon-wrapper">
                             <BarChart3 className="w-5 h-5 text-brand-blue" />
                          </div>
                          Focused Market Analysis
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                          <MarketPredictionCard 
                            label="Both Teams to Score" 
                            prob={prediction.bttsProb || 0} 
                            odd={odds?.btts_yes} 
                            icon={Zap} 
                            reasoning={prediction.bttsReasoning}
                          />
                          <MarketPredictionCard label="Over 1.5 Goals" prob={prediction.over15Prob || 0} odd={odds?.over_15_goals} icon={TrendingUp} />
                          <MarketPredictionCard label="Over 2.5 Goles" prob={prediction.over25Prob || 0} odd={odds?.over_25_goals} icon={TrendingUp} />
                          <MarketPredictionCard label="Over 3.5 Goles" prob={prediction.over35Prob || 0} odd={odds?.over_35_goals} icon={TrendingUp} />
                       </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'summary' && (
              <div className="space-y-10">
                {/* Advanced Insight Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="md:col-span-2 space-y-6">
                      {(metadata?.ai_preview || aiPreview) && (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="premium-gradient border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl"
                        >
                          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-green/10 blur-[80px] -mr-32 -mt-32" />
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                               <div className="w-10 h-10 rounded-2xl bg-brand-green/20 flex items-center justify-center border border-brand-green/30">
                                  <Sparkles className="w-5 h-5 text-brand-green" />
                               </div>
                               <span className="text-[12px] font-black uppercase tracking-[0.4em] text-brand-green">Strategist Intel</span>
                            </div>
                            <p className="text-xl md:text-2xl font-display font-medium text-brand-text-white leading-tight italic max-w-2xl">
                              "{metadata?.ai_preview?.text || aiPreview}"
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {/* Performance Center */}
                      <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-8">
                         <div className="flex items-center justify-between">
                            <h3 className="text-sm font-display font-black uppercase tracking-widest text-brand-text-white flex items-center gap-2">
                               <Activity className="w-5 h-5 text-brand-green" /> Performance Center
                            </h3>
                            <div className="text-[10px] font-mono text-brand-text-muted bg-white/5 px-2 py-1 rounded">V2.4 REALTIME</div>
                         </div>

                         <div className="grid grid-cols-3 gap-8">
                            <div className="text-center group">
                               <div className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mb-2 group-hover:text-brand-green transition-colors">xG Dominancia</div>
                               <div className="text-4xl font-display font-black text-brand-text-white tracking-tighter">
                                  {stats?.xgHome?.toFixed(2) || '0.00'}<span className="text-white/20 mx-1">:</span>{stats?.xgAway?.toFixed(2) || '0.00'}
                               </div>
                            </div>
                            <div className="text-center group">
                               <div className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mb-2 group-hover:text-brand-yellow transition-colors">Posesión</div>
                               <div className="text-4xl font-display font-black text-brand-text-white tracking-tighter">
                                  {stats?.possessionHome || 50}%
                               </div>
                            </div>
                            <div className="text-center group">
                               <div className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mb-2 group-hover:text-brand-blue transition-colors">Precisión</div>
                               <div className="text-4xl font-display font-black text-brand-text-white tracking-tighter">
                                  {stats?.accuratePassesHome || 82}%
                               </div>
                            </div>
                         </div>

                         <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-black text-brand-text-muted uppercase tracking-widest">
                               <span className={cn(momentum > 0 && "text-brand-green")}>{match.homeTeam} Presión</span>
                               <span className={cn(momentum < 0 && "text-brand-red")}>{match.awayTeam} Contra</span>
                            </div>
                            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                               <motion.div 
                                 className="absolute top-0 bottom-0 w-2 bg-white shadow-[0_0_15px_#fff] z-10 rounded-full"
                                 animate={{ left: `${50 + ((momentum || 0) * 50)}%` }}
                                 transition={{ type: "spring", damping: 12 }}
                               />
                               <div className="absolute inset-0 bg-gradient-to-r from-brand-red/30 via-transparent to-brand-green/30" />
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Vertical Timeline / Momentum */}
                   <div className="flex flex-col gap-6">
                      <div className="bg-brand-bg-card p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex-1 flex flex-col items-center justify-center text-center overflow-hidden relative">
                         <div className="absolute inset-0 opacity-10 flex items-center justify-center">
                            <TrendingUp className="w-48 h-48 text-brand-green scale-150" />
                         </div>
                         <div className="relative z-10 space-y-4">
                            <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Live Meta-Data</h4>
                            <div className="space-y-6">
                               <div>
                                  <div className="text-5xl font-display font-black text-brand-green tracking-tighter">
                                     {((stats?.xgHome || 0) > (stats?.xgAway || 0) ? (stats?.xgHome || 0) / (stats?.xgAway || 1) : (stats?.xgAway || 0) / (stats?.xgHome || 1)).toFixed(1)}x
                                  </div>
                                  <div className="text-[9px] font-bold text-brand-text-muted uppercase mt-1">Eficiencia de Ataque</div>
                               </div>
                               <div className="h-px w-12 bg-white/10 mx-auto" />
                               <div>
                                  <div className="text-4xl font-display font-black text-white/40 tracking-tighter">
                                     {stats?.attacksHome || 0}<span className="mx-2">/</span>{stats?.attacksAway || 0}
                                  </div>
                                  <div className="text-[9px] font-bold text-brand-text-muted uppercase mt-1">Ataques Totales</div>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Timeline Section */}
                <div className="space-y-8">
                  <div className="flex items-center justify-between px-4">
                    <h3 className="text-sm font-display font-black uppercase tracking-[0.3em] text-brand-text-white flex items-center gap-3">
                       <Zap className="w-5 h-5 text-brand-yellow" /> Game Timeline
                    </h3>
                    <div className="h-px flex-1 bg-white/5 mx-6" />
                  </div>
                  
                  {incidents.length === 0 ? (
                    <div className="p-16 border border-white/5 rounded-[3rem] text-center bg-black/20">
                      <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-text-muted opacity-20">Monitoring match sequence...</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5 -translate-x-1/2" />
                      <div className="space-y-6 relative z-10">
                        {incidents.map((inc, i) => (
                          <motion.div 
                            key={i} 
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className={cn(
                              "flex items-center gap-8 w-full",
                              inc.team === 'HOME' ? "flex-row-reverse text-right pr-[50%]" : "pl-[50%]"
                            )}
                          >
                            <div className={cn(
                              "flex-1 p-5 rounded-[2rem] border bg-brand-bg-card/80 backdrop-blur-xl transition-all hover:scale-105",
                              inc.team === 'HOME' ? "border-brand-green/20" : "border-brand-red/20"
                            )}>
                              <div className="text-xs font-black text-white uppercase tracking-tight">{inc.player}</div>
                              <div className="text-[9px] font-bold text-brand-text-muted uppercase tracking-widest mt-1">{inc.detail}</div>
                            </div>
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center font-mono font-black text-sm shrink-0 border-4 z-20 shadow-2xl relative",
                              inc.team === 'HOME' ? "bg-black border-brand-green text-brand-green" : "bg-black border-brand-red text-brand-red"
                            )}>
                              {inc.minute}'
                              {inc.type === 'GOAL' && (
                                <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute -inset-4 bg-brand-green/10 rounded-full blur-xl -z-10" />
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}


            {activeTab === 'stats' && (
              <div className="space-y-12">
                {!stats ? (
                  <div className="glass-card p-16 rounded-[3rem] border border-white/5 text-center space-y-8">
                    <RefreshCw className="w-16 h-16 text-brand-green animate-spin mx-auto opacity-50" />
                    <p className="text-brand-text-muted uppercase text-[12px] font-black tracking-[0.4em] animate-pulse">Compilando Métricas V2.8</p>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {/* Advanced Performance Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       {/* Expected Points / Dominance */}
                       <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                             <Target className="w-24 h-24 text-brand-green" />
                          </div>
                          <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] mb-10 flex items-center gap-3">
                             <BarChart3 className="w-5 h-5 text-brand-blue" /> Dominio Táctico (xP)
                          </h4>
                          <div className="flex items-center justify-around py-4">
                             <div className="text-center">
                                <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest block mb-3">xP Local</span>
                                <span className={cn("text-6xl font-display font-black tracking-tighter", (stats.xP_home || 0) > (stats.xP_away || 0) ? "text-brand-green underline decoration-4 underline-offset-8" : "text-brand-text-white")}>
                                   {((stats.xP_home || (stats.xgHome * 1.8)) || 0).toFixed(2)}
                                </span>
                             </div>
                             <div className="h-16 w-px bg-white/10" />
                             <div className="text-center">
                                <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest block mb-3">xP Visita</span>
                                <span className={cn("text-6xl font-display font-black tracking-tighter", (stats.xP_away || 0) > (stats.xP_home || 0) ? "text-brand-green underline decoration-4 underline-offset-8" : "text-brand-text-white")}>
                                   {((stats.xP_away || (stats.xgAway * 1.8)) || 0).toFixed(2)}
                                </span>
                             </div>
                          </div>
                       </div>

                       {/* Efficiency Stats */}
                       <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-10">
                          <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] mb-6 flex items-center gap-3">
                             <Zap className="w-5 h-5 text-brand-yellow" /> Letalidad en Ataque
                          </h4>
                          <div className="space-y-10">
                             <div className="space-y-3">
                                <div className="flex justify-between text-[11px] font-black tracking-widest">
                                   <span className="text-brand-text-muted uppercase">{match.homeTeam}</span>
                                   <span className="text-brand-green">{((stats.shotsHome / (stats.xgHome || 1)) || 0).toFixed(1)}x EFICIENCIA</span>
                                </div>
                                <div className="h-2 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((stats.shotsHome / (stats.xgHome || 1)) * 10, 100)}%` }} className="h-full bg-brand-green" />
                                </div>
                             </div>
                             <div className="space-y-3">
                                <div className="flex justify-between text-[11px] font-black tracking-widest text-brand-text-muted">
                                   <span className="uppercase">{match.awayTeam}</span>
                                   <span className="text-brand-red">{((stats.shotsAway / (stats.xgAway || 1)) || 0).toFixed(1)}x EFICIENCIA</span>
                                </div>
                                <div className="h-2 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((stats.shotsAway / (stats.xgAway || 1)) * 10, 100)}%` }} className="h-full bg-brand-red" />
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Detailed Stats Comparison Grid */}
                    <div className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                       <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] mb-12">Comparative Analytics Hub</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10">
                          <StatLine label="Posesión Central" home={stats.possessionHome || 0} away={stats.possessionAway || 0} unit="%" />
                          <StatLine label="xG Operativo" home={stats.xgHome || 0} away={stats.xgAway || 0} />
                          <StatLine label="Remates Efectivos" home={stats.shotsOnTargetHome || 0} away={stats.shotsOnTargetAway || 0} />
                          <StatLine label="Volumen de Tiros" home={stats.shotsHome || 0} away={stats.shotsAway || 0} />
                          <StatLine label="Saques de Esquina" home={stats.cornersHome || 0} away={stats.cornersAway || 0} />
                          <StatLine label="Pases Críticos" home={stats.accuratePassesHome || 0} away={stats.accuratePassesAway || 0} />
                          
                          <div className="md:col-span-2 border-t border-white/5 my-4 pt-12 grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10">
                            <StatLine label="Ataques de Peligro" home={stats.dangerousAttacksHome || 0} away={stats.dangerousAttacksAway || 0} />
                            <StatLine label="Ocasiones Manifiestas" home={stats.bigChancesHome || 0} away={stats.bigChancesAway || 0} />
                            <StatLine label="Paradas de Valor" home={stats.savesHome || 0} away={stats.savesAway || 0} />
                            <StatLine label="Disciplina (Faltas)" home={stats.foulsHome || 0} away={stats.foulsAway || 0} />
                          </div>
                       </div>
                    </div>

                    {playerStats && playerStats.length > 0 && (
                      <div className="space-y-8">
                        <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Player Tactical Breakdown</h4>
                        <div className="bg-brand-bg-card rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-white/[0.02] text-[10px] font-black text-brand-text-muted uppercase tracking-widest border-b border-white/5">
                                  <th className="py-6 px-8">Atleta</th>
                                  <th className="py-6 px-4 text-center">Tiempo</th>
                                  <th className="py-6 px-4 text-center">xG Acc</th>
                                  <th className="py-6 px-4 text-center">G/A</th>
                                  <th className="py-6 px-8 text-right">Valoración</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {playerStats.slice(0, 8).map((ps, i) => (
                                  <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="py-4 px-8">
                                       <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center font-mono font-black text-brand-green border border-white/5 group-hover:border-brand-green/30 transition-all">#{ps.player_id % 99}</div>
                                          <div>
                                             <div className="text-sm font-black text-brand-text-white uppercase leading-none mb-1">Nombre Jugador</div>
                                             <div className="text-[9px] font-bold text-brand-text-muted uppercase tracking-tighter">Posición Clave</div>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="py-4 px-4 text-center font-mono text-xs text-brand-text-muted">{ps.minutes_played}'</td>
                                    <td className="py-4 px-4 text-center font-mono text-xs text-brand-text-white">{(ps.expected_goals || 0).toFixed(2)}</td>
                                    <td className="py-4 px-4 text-center font-mono text-xs text-brand-green">{ps.goals}/{ps.goal_assist}</td>
                                    <td className="py-4 px-8 text-right">
                                      <span className={cn(
                                        "inline-flex items-center justify-center w-12 h-6 rounded-lg font-mono font-black text-[10px]",
                                        ps.rating >= 7.5 ? "bg-brand-green text-black" : ps.rating >= 6.5 ? "bg-white/10 text-white" : "bg-brand-red/20 text-brand-red border border-brand-red/20"
                                      )}>
                                        {ps.rating.toFixed(1)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}


            {activeTab === 'lineups' && (
              <div className="space-y-12">
                {!lineups || lineups.lineup_status === 'unavailable' ? (
                  <div className="glass-card bg-brand-bg-card p-20 rounded-[3rem] border border-white/5 text-center space-y-6">
                    <Users className="w-16 h-16 mx-auto text-brand-text-muted opacity-10" />
                    <p className="text-brand-text-muted italic uppercase text-[11px] font-black tracking-[0.4em]">Tactical Feed Pending...</p>
                  </div>
                ) : (
                  <div className="space-y-12">
                    <div className="flex items-center justify-between px-4">
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border shadow-lg",
                          lineups.lineup_status === 'confirmed' ? "bg-brand-green border-brand-green/30 text-black" : "bg-brand-yellow/20 border-brand-yellow/30 text-brand-yellow"
                        )}>
                          {lineups.lineup_status === 'confirmed' ? 'Oficial' : 'Proyectada'}
                        </div>
                        {lineups.beta && <span className="text-[9px] text-brand-blue font-black uppercase tracking-[0.3em] bg-brand-blue/10 px-3 py-1 rounded-lg border border-brand-blue/20">Alpha V2</span>}
                      </div>
                      {lineups.updated_at && (
                        <span className="text-[10px] text-brand-text-muted font-mono flex items-center opacity-40 uppercase tracking-widest">
                          <RefreshCw className="w-3.5 h-3.5 mr-2" /> Sync: {new Date(lineups.updated_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {['home', 'away'].map((side) => {
                        const team = side === 'home' ? lineups.lineups?.home : lineups.lineups?.away;
                        if (!team) return null;
                        return (
                          <div key={side} className="bg-brand-bg-card p-10 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-10 relative overflow-hidden group">
                             <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl -mr-16 -mt-16 group-hover:bg-brand-green/10 transition-all duration-700" />
                             <div className="flex justify-between items-center relative z-10">
                               <div className="flex items-center gap-4">
                                  <TeamLogo name={team.team_name} size="md" className="w-12 h-12" />
                                  <h4 className="text-xl font-display font-black text-brand-text-white uppercase tracking-tight">
                                    {team.team_name}
                                  </h4>
                               </div>
                               <div className="text-[12px] font-mono font-black text-brand-text-muted bg-white/5 px-4 py-1.5 rounded-xl border border-white/5">{team.formation}</div>
                             </div>

                             {team.confidence !== undefined && team.confidence !== null && (
                               <div className="space-y-3">
                                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-brand-text-muted">
                                   <span>Neural Accuracy</span>
                                   <span className="text-brand-green">{(team.confidence * 100).toFixed(0)}%</span>
                                 </div>
                                 <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${team.confidence * 100}%` }} className="h-full bg-brand-green shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                 </div>
                               </div>
                             )}

                             <div className="space-y-3">
                               {team.players.map((p, idx) => (
                                 <div key={p.id} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5 hover:border-brand-green/40 transition-all cursor-default group/item">
                                   <div className="flex items-center space-x-5">
                                     <div className="w-12 h-12 rounded-2xl bg-black border-2 border-white/5 flex items-center justify-center overflow-hidden shrink-0 group-hover/item:border-brand-green/50 transition-all shadow-xl">
                                       {getImgUrl('player', p.id) ? (
                                         <img 
                                           src={getImgUrl('player', p.id)!} 
                                           alt={p.name} 
                                           className="w-full h-full object-cover grayscale opacity-60 group-hover/item:grayscale-0 group-hover/item:opacity-100 transition-all duration-500"
                                           onError={(e) => {
                                             e.currentTarget.style.display = 'none';
                                             e.currentTarget.parentElement!.innerHTML = `<span class="text-sm font-mono font-black text-brand-green">${p.jersey_number || (idx + 1)}</span>`;
                                           }}
                                         />
                                       ) : (
                                          <span className="text-sm font-mono font-black text-brand-green">{p.jersey_number || (idx + 1)}</span>
                                       )}
                                     </div>
                                     <div>
                                       <p className="text-sm font-black text-brand-text-white uppercase tracking-tight leading-none mb-1 group-hover/item:text-brand-green transition-colors">{p.name}</p>
                                       <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">{p.position}</span>
                                          {p.ai_score !== undefined && (
                                             <div className="h-1 w-1 rounded-full bg-brand-green/40" />
                                          )}
                                       </div>
                                     </div>
                                   </div>
                                   {p.ai_score !== undefined && (
                                     <div className="text-right">
                                       <div className="text-[12px] font-display font-black text-white leading-none">{(p.ai_score * 10).toFixed(1)}</div>
                                       <div className="text-[8px] text-brand-text-muted uppercase tracking-[0.2em] mt-1">IA Index</div>
                                     </div>
                                   )}
                                 </div>
                               ))}
                             </div>

                             {team.substitutes && team.substitutes.length > 0 && (
                               <div className="pt-8 border-t border-white/5">
                                 <h5 className="text-[10px] text-brand-text-muted font-black uppercase tracking-[0.4em] mb-6 px-2">Bench Strategy</h5>
                                 <div className="grid grid-cols-2 gap-4">
                                    {team.substitutes.slice(0, 10).map(p => (
                                      <div key={p.id} className="text-[11px] font-black text-brand-text-muted p-3 flex items-center bg-white/[0.01] rounded-2xl border border-white/5 hover:border-brand-green/30 transition-all group/sub">
                                        <div className="w-7 h-7 rounded-lg bg-black border border-white/5 flex items-center justify-center overflow-hidden shrink-0 mr-3 group-hover/sub:border-brand-green/40">
                                          {getImgUrl('player', p.id) ? (
                                            <img
                                              src={getImgUrl('player', p.id)!}
                                              alt={p.name}
                                              className="w-full h-full object-cover group-hover/sub:scale-110 transition-transform"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.parentElement!.innerHTML = `<span class="text-[9px] font-mono font-black">${p.jersey_number || '?'}</span>`;
                                              }}
                                            />
                                          ) : (
                                            <span className="text-[9px] font-mono font-black">{p.jersey_number || '?'}</span>
                                          )}
                                        </div>
                                        <span className="truncate uppercase tracking-tight group-hover/sub:text-white transition-colors">{p.short_name || p.name}</span>
                                      </div>
                                    ))}
                                 </div>
                               </div>
                             )}
                          </div>
                        );
                      })}
                    </div>

                    {lineups.unavailable_players && (
                      <div className="bg-brand-bg-card p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-brand-red/5 blur-3xl opacity-20 pointer-events-none" />
                        <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] mb-10 flex items-center gap-3 relative z-10">
                          <AlertCircle className="w-5 h-5 text-brand-red" /> Atletas No Disponibles
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                          {['home', 'away'].map(side => {
                            const psArr = side === 'home' ? lineups.unavailable_players?.home : lineups.unavailable_players?.away;
                            if (!psArr || psArr.length === 0) return null;
                            return (
                              <div key={side} className="space-y-4">
                                <p className="text-[10px] text-brand-red font-black uppercase tracking-[0.4em] mb-6 px-2">{side === 'home' ? match.homeTeam : match.awayTeam}</p>
                                <div className="space-y-3">
                                  {psArr.map(p => (
                                    <div key={p.id} className="p-5 bg-brand-red/[0.02] border border-brand-red/10 rounded-2xl flex justify-between items-center transition-all hover:bg-brand-red/[0.05]">
                                      <div>
                                        <span className="font-black text-brand-text-white uppercase tracking-tight">{p.name}</span>
                                        <div className="text-[9px] text-brand-text-muted uppercase tracking-[0.2em] font-black mt-1.5">{p.status}</div>
                                      </div>
                                      <div className="text-right">
                                         <span className="text-[10px] font-black text-brand-red px-3 py-1 bg-brand-red/10 rounded-lg uppercase tracking-widest">{p.reason}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
        
        {/* Footer inside scroll area for mobile compatibility */}
        <div className="mt-12 border-t border-brand-border/10 pt-12">
          <Footer />
        </div>
      </div>
    </div>
  );
}

function MarketPredictionCard({ 
  label, 
  prob, 
  odd, 
  icon: Icon,
  reasoning
}: { 
  label: string; 
  prob: number; 
  odd?: number; 
  icon?: any;
  reasoning?: string;
}) {
  const probPercent = Math.round((prob || 0) * 100);
  const impliedProb = (odd && odd > 0) ? (1 / odd) : 0;
  const ev = (odd && prob > impliedProb) ? ((prob * odd) - 1) : 0;
  const value = ev * 100;
  
  // Kelly Criterion (Quarter Kelly for risk management)
  let kellyStake = 0;
  if (odd && odd > 1 && ev > 0) {
    const p = prob;
    const q = 1 - p;
    const b = odd - 1;
    const fullKelly = p - (q / b);
    kellyStake = Math.max(0, parseFloat((fullKelly * 0.25 * 100).toFixed(2))); // 25% Kelly
  }
  
  const colorClass = prob >= 0.7 ? "text-brand-green" : prob >= 0.5 ? "text-brand-yellow" : "text-brand-text-muted";
  const bgBarClass = prob >= 0.7 ? "bg-brand-green" : prob >= 0.5 ? "bg-brand-yellow" : "bg-brand-text-muted";

  return (
    <div className="glass-card p-5 rounded-3xl border border-brand-border/40 hover:border-brand-green/30 transition-all group flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-3.5 h-3.5 text-brand-text-muted" />}
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted">{label}</span>
          </div>
          {value > 5 && (
             <div className="px-2 py-0.5 rounded bg-brand-green/10 border border-brand-green/20 text-[8px] font-black text-brand-green uppercase animate-pulse shrink-0">
               EV +{value.toFixed(1)}%
             </div>
          )}
        </div>

        <div className="flex items-end justify-between mb-4">
          <div className={cn("text-3xl font-mono font-black", colorClass)}>
            {probPercent}%
          </div>
          {odd && odd > 0 && (
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-bold text-brand-text-muted uppercase tracking-widest mb-1">Cuota</span>
              <div className="text-sm font-mono font-black text-brand-text-white bg-brand-bg-primary px-3 py-1.5 rounded-xl border border-white/5">
                @{odd.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {kellyStake > 0 && (
          <div className="mb-4 flex items-center justify-between p-2.5 bg-brand-bg-primary/50 border border-brand-border/40 rounded-xl">
            <span className="text-[8px] font-bold uppercase tracking-widest text-brand-text-muted">Stake Rec. (1/4 Kelly)</span>
            <span className="text-[10px] font-mono font-black text-brand-text-white">{kellyStake}% Bank</span>
          </div>
        )}

        {reasoning && prob >= 0.6 && (
          <div className="mb-4 p-3 bg-brand-green/5 border border-brand-green/10 rounded-xl">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="w-3 h-3 text-brand-green" />
              <span className="text-[8px] font-black uppercase tracking-widest text-brand-green">Detalles</span>
            </div>
            <p className="text-[10px] leading-relaxed text-brand-text-muted italic">
              {reasoning}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-brand-text-muted">
          <span>Precisión</span>
          <span>IA</span>
        </div>
        <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5 p-0.5">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${probPercent}%` }}
            className={cn("h-full rounded-full transition-all duration-1000", bgBarClass)}
          />
        </div>
      </div>
    </div>
  );
}

function ComparisonBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[9px] uppercase font-bold tracking-widest">
        <span className="text-brand-text-muted">{label}</span>
        <span className="text-brand-text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className={cn("h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)]", color)}
        />
      </div>
    </div>
  );
}

function GoalProb({ label, prob = 0 }: { label: string; prob?: number }) {
  return (
    <div className="flex flex-col space-y-2">
       <div className="flex justify-between text-[9px] uppercase font-bold tracking-tighter">
          <span className="text-brand-text-muted">{label}</span>
          <span className="text-brand-green">{(prob * 100).toFixed(0)}%</span>
       </div>
       <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${prob * 100}%` }} 
            className="h-full bg-brand-green shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
          />
       </div>
    </div>
  );
}

function MarketRow({ label, prob }: { label: string; prob: number }) {
  const confidence = prob > 0.75 ? 'Alta' : prob > 0.45 ? 'Media' : 'Baja';
  const color = confidence === 'Alta' ? 'text-brand-green' : confidence === 'Media' ? 'text-brand-yellow' : 'text-brand-red';

  return (
    <tr>
      <td className="p-3 text-brand-text-white font-medium">{label}</td>
      <td className="p-3 text-center font-mono font-bold text-brand-text-light">{((prob || 0) * 100).toFixed(1)}%</td>
      <td className={cn("p-3 text-right font-bold", color)}>{confidence}</td>
    </tr>
  );
}

function StatLine({ label, home, away, unit = '', subHome, subAway }: { label: string; home: number; away: number; unit?: string; subHome?: number; subAway?: number }) {
  const h = home || 0;
  const a = away || 0;
  const total = h + a;
  const homePercent = total === 0 ? 50 : (h / total) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-brand-text-muted">
        <span>{h}{unit} {subHome !== undefined && `(${subHome})`}</span>
        <span className="uppercase tracking-tighter text-brand-text-white font-medium">{label}</span>
        <span>{a}{unit} {subAway !== undefined && `(${subAway})`}</span>
      </div>
      <div className="h-1 bg-brand-bg-primary rounded-full flex overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${homePercent}%` }} className="bg-brand-green" />
        <div className="flex-1 bg-brand-red" />
      </div>
    </div>
  );
}

function ProbBar({ label, prob, color }: { label: string; prob: number; color: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
       <span className="text-[10px] font-mono font-tabular text-white">{((prob || 0) * 100).toFixed(1)}%</span>
       <motion.div 
         initial={{ height: 0 }} 
         animate={{ height: `${(prob || 0) * 100}%` }} 
         className={cn("w-full rounded-t-lg transition-all", color)}
       />
       <span className="text-[10px] text-brand-text-muted font-bold">{label}</span>
    </div>
  );
}

function OddCard({ label, odd, myProb }: { label: string, odd?: number, myProb?: number }) {
  if (!odd) return (
     <div className="bg-brand-bg-primary/50 text-brand-text-muted border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
       <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
       <span className="text-xl font-display font-black mt-1">N/A</span>
     </div>
  );
  
  const impliedProb = (1 / odd) * 100;
  const aiProbPercent = myProb !== undefined ? myProb * 100 : null;
  const value = myProb !== undefined ? ((myProb - (1 / odd)) / (1 / odd)) * 100 : null;
  
  return (
    <div className="bg-brand-bg-card border border-brand-border rounded-xl p-4 flex flex-col items-center relative overflow-hidden group hover:border-brand-green/30 transition-colors shadow-sm">
      <span className="text-[10px] text-brand-text-muted uppercase font-bold tracking-widest mb-1">{label}</span>
      <span className="text-2xl font-display font-black text-brand-text-white mb-2 drop-shadow-md">{odd.toFixed(2)}</span>
      
      <div className="flex w-full gap-2 mb-2">
        <div className="flex-1 flex flex-col items-center bg-brand-bg-primary/50 rounded p-1 border border-brand-border/30">
          <span className="text-[8px] text-brand-text-muted uppercase font-bold">MKT Prob</span>
          <span className="text-[10px] font-mono text-brand-text-light">{impliedProb.toFixed(1)}%</span>
        </div>
        <div className="flex-1 flex flex-col items-center bg-brand-green/5 rounded p-1 border border-brand-green/20">
          <span className="text-[8px] text-brand-green uppercase font-bold tracking-tighter">AI Prob</span>
          <span className="text-[10px] font-mono text-brand-green font-bold">{aiProbPercent !== null ? aiProbPercent.toFixed(1) : '--'}%</span>
        </div>
      </div>

      {value !== null && (
        <div className="mt-1 w-full text-center border-t border-brand-border/50 pt-3">
          {value > 10 ? (
            <div className="space-y-1">
              <span className="inline-block bg-[#16A34A] text-white text-[9px] px-2 py-1 rounded font-bold tracking-tighter w-full uppercase shadow-[0_4px_10px_rgba(22,163,74,0.3)] animate-pulse">🔥 +{value.toFixed(1)}% VALOR</span>
              <p className="text-[8px] text-brand-green font-medium">Oportunidad detectada</p>
            </div>
          ) : value > 5 ? (
            <span className="inline-block bg-[#EAB308]/20 text-[#EAB308] border border-[#EAB308]/30 text-[9px] px-2 py-1 rounded font-bold tracking-tighter w-full uppercase">🔍 +{value.toFixed(1)}% VALOR</span>
          ) : (
            <span className="inline-block bg-gray-500/10 text-gray-400 border border-gray-500/20 text-[9px] px-2 py-1 rounded font-mono tracking-tighter w-full uppercase">NORMAL</span>
          )}
        </div>
      )}
    </div>
  );
}

function AdvancedMetricRow({ label, home, away, unit = '', better = 'higher' }: { label: string; home: number; away: number; unit?: string; better?: 'higher' | 'lower' }) {
  const isHomeWinner = better === 'higher' ? home > away : home < away;
  const isAwayWinner = better === 'higher' ? away > home : away < home;

  return (
    <div className="flex flex-col space-y-1">
      <div className="text-[10px] text-brand-text-muted font-bold uppercase tracking-tighter text-center">{label}</div>
      <div className="flex items-center justify-between bg-black/10 rounded-lg p-2 border border-brand-border/30">
        <span className={cn("text-xs font-mono font-bold", isHomeWinner ? "text-brand-green" : "text-brand-text-light")}>
          {home.toFixed(better === 'lower' && home < 1 ? 2 : 1)}{unit}
        </span>
        <div className="flex-1 mx-2 h-1 bg-brand-bg-primary rounded-full overflow-hidden flex">
          <div className={cn("h-full", isHomeWinner ? "bg-brand-green" : "bg-gray-600")} style={{ width: `${(home / (home + away + 0.1)) * 100}%` }} />
          <div className={cn("h-full", isAwayWinner ? "bg-brand-green" : "bg-gray-600")} style={{ width: `${(away / (home + away + 0.1)) * 100}%` }} />
        </div>
        <span className={cn("text-xs font-mono font-bold", isAwayWinner ? "text-brand-green" : "text-brand-text-light")}>
          {away.toFixed(better === 'lower' && away < 1 ? 2 : 1)}{unit}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className="flex items-center space-x-2 border-b border-brand-border pb-2">
      <div className={cn("p-1.5 rounded-lg bg-current/10", color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <h4 className="text-[11px] font-black uppercase tracking-widest text-brand-text-white">{title}</h4>
    </div>
  );
}
