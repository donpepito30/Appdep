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

type DashboardTab = 'summary' | 'predictions' | 'strategy' | 'stats' | 'incidents' | 'lineups' | 'ai' | 'h2h' | 'social' | 'broadcasts' | 'shotmap';

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
        slow: activeTab === 'summary' || activeTab === 'lineups' || activeTab === 'stats' || activeTab === 'ai',
        forms: activeTab === 'predictions' || activeTab === 'strategy' || activeTab === 'ai'
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
    if ((activeTab === 'h2h' || activeTab === 'strategy') && h2hHistory.length === 0 && !loadingH2H) {
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

    // Load Advanced Stats if we are on Analysis or Strategy tab
    if ((activeTab === 'stats' || activeTab === 'strategy' || activeTab === 'ai') && !homeAdvancedStats && match.homeTeamId && match.awayTeamId && !loadingAdvanced) {
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

    // Independent AI Preview generation ONLY when AI tab is selected
    if (activeTab === 'ai' && !aiPreview && !isGeneratingAI && match.homeTeamId && match.awayTeamId) {
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
    <div ref={dashboardRef} className="flex-1 flex flex-col bg-brand-bg-primary min-h-0 min-w-0 w-full overflow-hidden">
      {/* Persistent Match Header */}
      <div className="bg-brand-bg-card border-b border-brand-border/30 px-4 py-4 md:px-6 md:py-6 relative z-50 shrink-0 w-full overflow-hidden">
        <div className="flex items-center justify-between max-w-5xl mx-auto gap-4">
          <div className="flex-1 flex items-center space-x-3 md:space-x-6 min-w-0">
            <div className="shrink-0 flex items-center cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: match.homeLogo, leagueId: match.leagueId }); }}>
              <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="md" className="w-10 h-10 sm:w-12 sm:h-12 md:w-20 md:h-20 hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col min-w-0 notranslate cursor-pointer" translate="no" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: match.homeLogo, leagueId: match.leagueId }); }}>
              <h2 className="text-[11px] sm:text-sm md:text-xl font-bold tracking-tight text-brand-text-white truncate hover:text-brand-green transition-colors">{match.homeTeam}</h2>
              <span className="text-[7px] md:text-[10px] text-brand-green uppercase font-black tracking-widest truncate">{match.leagueName || 'PARTIDO EN VIVO'}</span>
            </div>
          </div>

          <div className="flex flex-col items-center shrink-0">
            <div className="flex items-center space-x-4 md:space-x-8">
              <div className="text-2xl md:text-5xl font-black font-display font-tabular tracking-tighter text-brand-text-white whitespace-nowrap">
                {match.homeScore} - {match.awayScore}
              </div>
            </div>
            {match.status === 'LIVE' && (
              <div className="flex items-center mt-1 space-x-1.5 md:space-x-2">
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-red"></span>
                </span>
                <span className="text-[10px] md:text-xs font-mono font-bold text-brand-red">{match.currentMinute}'<span className="animate-pulse"></span></span>
              </div>
            )}
            {match.status === 'FINISHED' && (
              <span className="text-[8px] md:text-[9px] uppercase font-black text-brand-text-muted mt-1 tracking-[0.2em]">Finalizado</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-end space-x-3 md:space-x-6 min-w-0 notranslate" translate="no">
            <div className="flex flex-col items-end min-w-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: match.awayLogo, leagueId: match.leagueId }); }}>
              <h2 className="text-[11px] sm:text-sm md:text-xl font-bold tracking-tight text-brand-text-white text-right truncate hover:text-brand-green transition-colors">{match.awayTeam}</h2>
              <span className="text-[7px] md:text-[10px] text-brand-text-muted uppercase font-bold tracking-widest truncate">VISITA</span>
            </div>
            <div className="shrink-0 flex items-center cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: match.awayLogo, leagueId: match.leagueId }); }}>
              <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="md" className="w-10 h-10 sm:w-12 sm:h-12 md:w-20 md:h-20 hover:scale-110 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Unified Tab Navigation */}
      <div 
        role="tablist"
        aria-label="Panel de análisis del partido"
        className="flex w-full bg-brand-bg-card/50 border-b border-brand-border/30 shrink-0 touch-scroll-x scrollbar-hide overflow-x-auto"
      >
        {[
          { id: 'summary', label: 'Resumen', icon: Activity },
          { id: 'predictions', label: 'Predicciones', icon: Zap },
          { id: 'h2h', label: 'Historial', icon: Swords },
          { id: 'strategy', label: 'Estrategia', icon: Target },
          { id: 'stats', label: 'Análisis', icon: BarChart3 },
          { id: 'incidents', label: 'Incidentes', icon: History },
          { id: 'lineups', label: 'Alineaciones', icon: Users },
          { id: 'ai', label: 'Insights', icon: Sparkles },
          { id: 'social', label: 'Social', icon: MessageSquare },
          { id: 'broadcasts', label: 'TV', icon: Tv },
          { id: 'shotmap', label: 'Tiros', icon: Crosshair }
        ].map(t => (
            <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id as DashboardTab)}
            className={cn(
              "shrink-0 md:flex-1 flex items-center justify-center space-x-2 py-4 px-5 md:px-4 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap min-w-[64px] md:min-w-0 portrait:min-w-[72px]",
              activeTab === t.id 
                ? "border-brand-green text-brand-green bg-brand-green/5" 
                : "border-transparent text-brand-text-muted hover:text-brand-text-white hover:bg-white/5"
            )}
          >
            <t.icon className="w-5 h-5" />
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
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
            {activeTab === 'social' && (
              <SocialTab eventId={match.id} />
            )}
            {activeTab === 'broadcasts' && (
              <BroadcastsTab eventId={match.id} />
            )}
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                                 <Target className="w-4 h-4 text-brand-green" /> Distribución Geográfica
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
                                  <Zap className="w-4 h-4 text-brand-yellow" /> Promedio de Goles
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
                                  <Activity className="w-4 h-4 text-brand-blue" /> Estado de Forma Mutual
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
              <div className="space-y-8">
                {!prediction ? (
                  <div className="glass-card p-10 md:p-12 rounded-[2rem] border border-brand-border/40 text-center space-y-6">
                    <div className="relative flex justify-center">
                      <Zap className="w-12 h-12 text-brand-green animate-pulse" />
                      <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-brand-green/40 opacity-50" />
                    </div>
                    <p className="text-brand-text-muted italic uppercase text-[10px] font-black tracking-[0.3em] animate-pulse">Analizando variables tácticas...</p>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {/* Best Opportunity Section */}
                    {(() => {
                      const markets = [
                        { label: 'Local (1)', prob: prediction.homeWinProb, odd: odds?.home_win },
                        { label: 'Empate (X)', prob: prediction.drawProb, odd: odds?.draw },
                        { label: 'Visita (2)', prob: prediction.awayWinProb, odd: odds?.away_win },
                        { label: 'BTTS (Sí)', prob: prediction.bttsProb || 0, odd: odds?.btts_yes },
                        { label: 'Over 1.5', prob: prediction.over15Prob || 0, odd: odds?.over_15_goals },
                        { label: 'Over 2.5', prob: prediction.over25Prob || 0, odd: odds?.over_25_goals },
                        { label: 'Over 3.5', prob: prediction.over35Prob || 0, odd: odds?.over_35_goals },
                      ].filter(m => m.odd && m.prob > 0);

                      const best = markets.reduce((prev, curr) => {
                        const prevValue = prev.odd ? ((prev.prob - (1 / prev.odd)) / (1 / prev.odd)) : -999;
                        const currValue = curr.odd ? ((curr.prob - (1 / curr.odd)) / (1 / curr.odd)) : -999;
                        return currValue > prevValue ? curr : prev;
                      }, markets[0]);

                      if (!best || !best.odd) return null;

                      const bestValue = ((best.prob - (1 / best.odd)) / (1 / best.odd)) * 100;

                      return (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border-2 border-brand-green/30 bg-brand-green/5 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-green/10 blur-[80px] -mr-32 -mt-32 group-hover:bg-brand-green/20 transition-all duration-700" />
                          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="space-y-3 text-center md:text-left">
                              <div className="flex items-center justify-center md:justify-start gap-2 text-brand-green">
                                <Sparkles className="w-5 h-5 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.4em]">Sugerencia</span>
                              </div>
                              <h3 className="text-2xl md:text-5xl font-display font-black text-brand-text-white uppercase tracking-tighter">
                                {best.label} <span className="text-brand-green">@{best.odd.toFixed(2)}</span>
                              </h3>
                              <p className="text-[11px] text-brand-text-muted font-medium max-w-md">
                                Basado en la probabilidad detectada vs cuota actual.
                              </p>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mb-1">Precisión</div>
                                <div className="text-4xl font-mono font-black text-brand-green">{(best.prob * 100).toFixed(0)}%</div>
                              </div>
                              <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-brand-green flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-transform">
                                <TrendingUp className="w-8 h-8 md:w-10 md:h-10 text-black" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Probabilities Card (Special for 1X2) */}
                      <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-brand-border shadow-2xl relative overflow-hidden flex flex-col justify-between">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                          <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                            <Target className="w-5 h-5 text-brand-red shrink-0" /> 
                            MERCADO: <span className="text-brand-text-white italic">RESULTADO FINAL (1X2)</span>
                          </h4>
                        </div>

                        <div className="space-y-10">
                          <div className="flex justify-between items-center px-4">
                             <div className="text-center group">
                                <div className={cn("text-4xl font-black font-mono tracking-tighter transition-transform", prediction.homeWinProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.homeWinProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-2 tracking-widest">LOCAL</div>
                                {odds?.home_win && <div className="mt-1 text-[10px] font-mono font-bold text-brand-text-muted">@{odds.home_win.toFixed(2)}</div>}
                             </div>
                             <div className="w-px h-16 bg-gradient-to-b from-transparent via-brand-border/50 to-transparent" />
                             <div className="text-center group">
                                <div className={cn("text-4xl font-black font-mono tracking-tighter transition-transform", prediction.drawProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.drawProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-2 tracking-widest">EMPATE</div>
                                {odds?.draw && <div className="mt-1 text-[10px] font-mono font-bold text-brand-text-muted">@{odds.draw.toFixed(2)}</div>}
                             </div>
                             <div className="w-px h-16 bg-gradient-to-b from-transparent via-brand-border/50 to-transparent" />
                             <div className="text-center group">
                                <div className={cn("text-4xl font-black font-mono tracking-tighter transition-transform", prediction.awayWinProb >= 0.5 ? "text-brand-green" : "text-brand-text-white")}>{(prediction.awayWinProb * 100).toFixed(0)}%</div>
                                <div className="text-[10px] font-black text-brand-text-muted uppercase mt-2 tracking-widest">VISITA</div>
                                {odds?.away_win && <div className="mt-1 text-[10px] font-mono font-bold text-brand-text-muted">@{odds.away_win.toFixed(2)}</div>}
                             </div>
                          </div>

                          <div className="flex h-4 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5 p-0.5">
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.homeWinProb * 100}%` }} className="bg-brand-green h-full rounded-l-full" />
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.drawProb * 100}%` }} className="bg-brand-yellow h-full" />
                             <motion.div initial={{ width: 0 }} animate={{ width: `${prediction.awayWinProb * 100}%` }} className="bg-brand-red h-full rounded-r-full" />
                          </div>
                        </div>
                      </div>

                      {/* Scoreline Prediction Card */}
                      <div className="glass-card p-8 rounded-[2rem] border border-brand-border shadow-2xl relative overflow-hidden flex flex-col justify-center items-center text-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-green/10 via-transparent to-brand-red/10 opacity-30" />
                        <div className="relative z-10 space-y-6 w-full">
                          <h4 className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em] mb-4">Marcador</h4>
                          <div className="flex items-center justify-center space-x-8">
                             <TeamLogo name={match.homeTeam} size="sm" className="w-10 h-10 grayscale group-hover:grayscale-0 transition-all" />
                             <div className="text-5xl md:text-6xl font-black font-display text-brand-text-white tracking-tighter bg-white/5 px-6 py-4 rounded-[2rem] border border-white/10 shadow-[inner_0_4px_20px_rgba(0,0,0,0.5)]">
                               {(() => {
                                 if (prediction?.scoreline && prediction.scoreline !== '?-?') {
                                   return prediction.scoreline;
                                 }
                                 if (match.status === 'LIVE') {
                                   const projHome = (match.homeScore || 0) + Math.round((match.xgHome || 0.5) * 1.5);
                                   const projAway = (match.awayScore || 0) + Math.round((match.xgAway || 0.5) * 1.5);
                                   return `${projHome}-${projAway}`;
                                 }
                                 const homeGoals = Math.round((match.xgHome || 1.2) * 1.4);
                                 const awayGoals = Math.round((match.xgAway || 1.0) * 1.2);
                                 return `${homeGoals}-${awayGoals}`;
                               })()}
                             </div>
                             <TeamLogo name={match.awayTeam} size="sm" className="w-10 h-10 grayscale group-hover:grayscale-0 transition-all" />
                          </div>
                          <div className="flex items-center justify-center gap-2">
                             <Sparkles className="w-4 h-4 text-brand-green" />
                             <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em]">ANÁLISIS COMPLETADO</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Markets Grid */}
                    <div className="space-y-6">
                       <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                         <BarChart3 className="w-5 h-5 text-brand-blue" />
                         Mercados de Goles y Ambos Marcan
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <MarketPredictionCard 
                            label="Ambos Equipos Marcan" 
                            prob={prediction.bttsProb || 0} 
                            odd={odds?.btts_yes} 
                            icon={Zap} 
                            reasoning={prediction.bttsReasoning}
                          />
                          <MarketPredictionCard label="Over 1.5 Goles" prob={prediction.over15Prob || 0} odd={odds?.over_15_goals} icon={TrendingUp} />
                          <MarketPredictionCard label="Over 2.5 Goles" prob={prediction.over25Prob || 0} odd={odds?.over_25_goals} icon={TrendingUp} />
                          <MarketPredictionCard label="Over 3.5 Goles" prob={prediction.over35Prob || 0} odd={odds?.over_35_goals} icon={TrendingUp} />
                       </div>
                    </div>

                    {/* Methodology Footer */}
                    <div className="p-4 bg-brand-bg-primary/40 rounded-3xl border border-brand-border/10">
                       <p className="text-[10px] text-brand-text-muted leading-relaxed italic text-center">
                          Análisis basado en datos históricos y rendimiento actual para una toma de decisiones informada.
                       </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {/* Momentum Indicator Refined - Moved to top of summary */}
                <div className="bg-brand-bg-card rounded-[2rem] p-6 border border-brand-border/40 relative overflow-hidden shadow-xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-green/5 via-transparent to-brand-red/5 opacity-30" />
                  <div className="relative z-10">
                     <div className="flex justify-between items-center mb-3">
                       <div className="flex flex-col">
                         <span className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest">Presión Local</span>
                         <div className="h-1 w-12 bg-brand-green/30 rounded-full mt-1" />
                       </div>
                       <div className="text-[10px] font-display font-black text-white/50 uppercase tracking-[0.3em]">Momentum Actual</div>
                       <div className="flex flex-col items-end">
                         <span className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest">Presión Visita</span>
                         <div className="h-1 w-12 bg-brand-red/30 rounded-full mt-1" />
                       </div>
                     </div>
                     
                     <div className="relative h-3 bg-brand-bg-primary/50 rounded-full overflow-hidden border border-white/5 p-0.5">
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-red/20 via-transparent to-brand-green/20" />
                        <motion.div 
                          className="absolute top-0 w-2 h-full bg-white shadow-[0_0_20px_rgba(255,255,255,1)] z-10 rounded-full cursor-pointer"
                          animate={{ left: `${50 + ((momentum || 0) * 50)}%` }}
                          transition={{ type: 'spring', damping: 12, stiffness: 80 }}
                        />
                        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/20 z-0" />
                     </div>
                  </div>
                </div>

                {metadata?.ai_preview && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-brand-bg-card p-6 border-l-4 border-brand-green rounded-3xl relative overflow-hidden shadow-lg"
                  >
                    <div className="absolute top-2 right-4">
                      <Sparkles className="w-5 h-5 text-brand-green animate-pulse" />
                    </div>
                    <h4 className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3 flex items-center">
                      Resumen del Encuentro
                    </h4>
                    <p className="text-sm text-brand-text-light leading-relaxed font-sans mt-2 whitespace-pre-wrap italic">
                      {metadata.ai_preview.text}
                    </p>
                  </motion.div>
                )}

                {aiPreview && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-brand-bg-card p-6 border-l-4 border-brand-green rounded-3xl relative overflow-hidden shadow-lg"
                  >
                    <div className="absolute top-2 right-4">
                      <Sparkles className="w-5 h-5 text-brand-green animate-pulse" />
                    </div>
                    <h4 className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3 flex items-center">
                      AI Preview Especial (Gemini 3 Flash)
                    </h4>
                    <p className="text-sm text-brand-text-light leading-relaxed font-sans mt-2 italic">
                      {aiPreview}
                    </p>
                  </motion.div>
                )}

                {metadata?.funfacts && metadata.funfacts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metadata.funfacts.map((fact, i) => (
                      <div key={i} className="bg-brand-bg-card/40 p-4 border border-brand-border/30 rounded-2xl flex items-start space-x-3">
                        <div className="p-2 bg-brand-green/10 rounded-lg shrink-0">
                          <Zap className="w-3.5 h-3.5 text-brand-green" />
                        </div>
                        <p className="text-xs text-brand-text-muted leading-snug">{fact.sentence}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(metadata?.venue || metadata?.managers) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {metadata.venue && (
                      <div className="md:col-span-1 bg-brand-bg-card rounded-3xl border border-brand-border/50 overflow-hidden shadow-lg group">
                        <div className="h-24 bg-brand-bg-primary relative">
                           <img 
                            src={getImgUrl('venue', metadata.venue.id) || ''} 
                            alt={metadata.venue.name} 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-card to-transparent" />
                        </div>
                        <div className="p-4 -mt-6 relative z-10">
                          <p className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest mb-1 italic">Estadio / Recinto</p>
                          <h5 className="text-xs font-bold text-brand-text-white truncate">{metadata.venue.name}</h5>
                          {metadata.venue.city && <p className="text-[10px] text-brand-text-muted truncate">{metadata.venue.city}</p>}
                        </div>
                      </div>
                    )}
                    
                    {metadata.managers?.home && (
                       <div className="bg-brand-bg-card rounded-3xl border border-brand-border/50 p-4 shadow-lg flex items-center space-x-4">
                          <div className="w-12 h-12 bg-brand-bg-primary rounded-2xl overflow-hidden border border-brand-border shrink-0">
                             <img 
                              src={getImgUrl('manager', metadata.managers.home.id) || ''} 
                              alt={metadata.managers.home.name} 
                              className="w-full h-full object-cover" 
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          </div>
                          <div className="min-w-0">
                             <p className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest mb-0.5">Entrenador (Local)</p>
                             <h5 className="text-xs font-bold text-brand-text-white truncate">{metadata.managers.home.name}</h5>
                          </div>
                       </div>
                    )}

                    {metadata.managers?.away && (
                       <div className="bg-brand-bg-card rounded-3xl border border-brand-border/50 p-4 shadow-lg flex items-center space-x-4">
                          <div className="w-12 h-12 bg-brand-bg-primary rounded-2xl overflow-hidden border border-brand-border shrink-0">
                             <img 
                              src={getImgUrl('manager', metadata.managers.away.id) || ''} 
                              alt={metadata.managers.away.name} 
                              className="w-full h-full object-cover" 
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          </div>
                          <div className="min-w-0">
                             <p className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest mb-0.5">Entrenador (Visita)</p>
                             <h5 className="text-xs font-bold text-brand-text-white truncate">{metadata.managers.away.name}</h5>
                          </div>
                       </div>
                    )}
                  </div>
                )}

                {/* Quick Stats Grid - Re-adding "Older" feel for quick access */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-brand-bg-card p-4 rounded-2xl border border-brand-border/50">
                      <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest block mb-2">Posesión</span>
                      <div className="flex items-end justify-between">
                        <span className="text-lg font-mono font-bold text-brand-green">{stats.possessionHome}%</span>
                        <span className="text-lg font-mono font-bold text-brand-red">{stats.possessionAway}%</span>
                      </div>
                    </div>
                    <div className="bg-brand-bg-card p-4 rounded-2xl border border-brand-border/50">
                      <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest block mb-2">Remates</span>
                      <div className="flex items-end justify-between">
                        <span className="text-lg font-mono font-bold text-brand-green">{stats.shotsHome}</span>
                        <span className="text-lg font-mono font-bold text-brand-red">{stats.shotsAway}</span>
                      </div>
                    </div>
                    <div className="bg-brand-bg-card p-4 rounded-2xl border border-brand-border/50">
                      <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest block mb-2">Córners</span>
                      <div className="flex items-end justify-between">
                        <span className="text-lg font-mono font-bold text-brand-green">{stats.cornersHome}</span>
                        <span className="text-lg font-mono font-bold text-brand-red">{stats.cornersAway}</span>
                      </div>
                    </div>
                    <div className="bg-brand-bg-card p-4 rounded-2xl border border-brand-border/50 text-center">
                      <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest block mb-2">Total xG</span>
                      <span className="text-lg font-mono font-bold text-brand-text-white">{(stats.xgHome + stats.xgAway).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'strategy' && (
              <div className="space-y-6">
                {!strategyData ? (
                  <div className="bg-brand-bg-card p-10 md:p-12 rounded-[2rem] border border-brand-border/40 text-center space-y-6 shadow-xl">
                    <div className="relative flex justify-center">
                      <RefreshCw className="w-12 h-12 text-brand-green animate-spin" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-brand-text-white font-display font-bold uppercase tracking-[0.2em]">Analizando Patrones Tácticos...</p>
                      <p className="text-[10px] text-brand-text-muted uppercase tracking-widest">Procesando historial y métricas avanzadas</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl space-y-4">
                        <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest flex items-center space-x-2">
                           <TrendingUp className="w-3.5 h-3.5 text-brand-green" />
                           <span>Probabilidades de Victoria (Consensuadas)</span>
                        </h4>
                        <div className="space-y-4">
                           <ComparisonBar label="Local" value={(prediction?.homeWinProb || 0.33) * 100} color="bg-brand-green" />
                           <ComparisonBar label="Empate" value={(prediction?.drawProb || 0.33) * 100} color="bg-brand-yellow" />
                           <ComparisonBar label="Visita" value={(prediction?.awayWinProb || 0.33) * 100} color="bg-brand-red" />
                        </div>
                      </div>

                      <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl space-y-4">
                        <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest flex items-center space-x-2">
                           <ShieldCheck className="w-3.5 h-3.5 text-brand-blue" />
                           <span>Análisis xG Histórico (Últimos 10)</span>
                        </h4>
                        <div className="space-y-4">
                           <div className="flex justify-between items-center">
                             <span className="text-xs text-brand-text-muted">Goles Favor/Partido</span>
                             <div className="flex space-x-8 font-mono font-bold">
                               <span className="text-brand-green">{strategyData.homeStats.avgGoals.toFixed(2)}</span>
                               <span className="text-brand-red">{strategyData.awayStats.avgGoals.toFixed(2)}</span>
                             </div>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-xs text-brand-text-muted">Goles Contra/Partido</span>
                             <div className="flex space-x-8 font-mono font-bold">
                               <span className="text-brand-red">{strategyData.homeStats.avgAgainst.toFixed(2)}</span>
                               <span className="text-brand-green">{strategyData.awayStats.avgAgainst.toFixed(2)}</span>
                             </div>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl">
                      <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest mb-6 flex items-center space-x-2">
                        <History className="w-3.5 h-3.5 text-brand-yellow" />
                        <span>Últimos Enfrentamientos H2H</span>
                      </h4>
                      <div className="space-y-3">
                        {strategyData.h2h.map((h: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-brand-bg-primary/50 rounded-2xl border border-brand-border/30">
                            <span className="text-[10px] font-mono text-brand-text-muted">{new Date(h.date).toLocaleDateString()}</span>
                            <div className="flex-1 flex justify-center items-center space-x-4">
                              <span className="text-xs font-bold w-20 text-right">{h.homeTeam}</span>
                              <span className="text-sm font-mono font-black border-x border-brand-border/50 px-4">{h.homeScore} - {h.awayScore}</span>
                              <span className="text-xs font-bold w-20 text-left">{h.awayTeam}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-6">
                {!stats ? (
                  <div className="bg-brand-bg-card p-10 md:p-12 rounded-[2rem] border border-brand-border/40 text-center space-y-4">
                    <BarChart3 className="w-12 h-12 mx-auto text-brand-green animate-pulse" />
                    <p className="text-brand-text-muted italic uppercase text-[10px] tracking-widest">Esperando estadísticas en tiempo real...</p>
                  </div>
                ) : (
                  <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl">
                    <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest mb-8">Desglose de Estadísticas en Vivo</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                       <StatLine label="Posesión" home={stats.possessionHome || 0} away={stats.possessionAway || 0} unit="%" />
                       <StatLine label="xG (Goles Esperados)" home={stats.xgHome || 0} away={stats.xgAway || 0} />
                       <StatLine label="Remates a Puerta" home={stats.shotsOnTargetHome || 0} away={stats.shotsOnTargetAway || 0} />
                       <StatLine label="Remates fuera" home={stats.shotsOffTargetHome || 0} away={stats.shotsOffTargetAway || 0} />
                       <StatLine label="Remates Totales" home={stats.shotsHome || 0} away={stats.shotsAway || 0} />
                       <StatLine label="Córners" home={stats.cornersHome || 0} away={stats.cornersAway || 0} />
                       
                       <div className="md:col-span-2 border-t border-brand-border/20 my-2 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                         <StatLine label="Ataques Peligrosos" home={stats.dangerousAttacksHome || 0} away={stats.dangerousAttacksAway || 0} />
                         <StatLine label="Ataques Totales" home={stats.attacksHome || 0} away={stats.attacksAway || 0} />
                         <StatLine label="Ocasiones Claras" home={stats.bigChancesHome || 0} away={stats.bigChancesAway || 0} />
                         <StatLine label="Paradas Portero" home={stats.savesHome || 0} away={stats.savesAway || 0} />
                         <StatLine label="Pases Precisos" home={stats.accuratePassesHome || 0} away={stats.accuratePassesAway || 0} />
                         <StatLine label="Faltas" home={stats.foulsHome || 0} away={stats.foulsAway || 0} />
                         <StatLine label="Tarjetas Rojas" home={stats.redCardsHome || 0} away={stats.redCardsAway || 0} />
                         <StatLine label="Tarjetas Amarillas" home={stats.yellowCardsHome || 0} away={stats.yellowCardsAway || 0} />
                       </div>
                    </div>

                    {playerStats && playerStats.length > 0 && (
                      <div className="mt-12 space-y-4">
                        <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Estadísticas Detalladas de Jugadores</h4>
                        <div className="tabla-wrapper">
                          <table className="w-full text-[10px] text-brand-text-muted min-w-[600px]">
                            <thead>
                              <tr className="text-left border-b border-brand-border/30">
                                <th className="pb-2 font-black uppercase">Jugador</th>
                                <th className="pb-2 text-center font-black uppercase">Min</th>
                                <th className="pb-2 text-center font-black uppercase">G</th>
                                <th className="pb-2 text-center font-black uppercase">Ast</th>
                                <th className="pb-2 text-center font-black uppercase">xG</th>
                                <th className="pb-2 text-center font-black uppercase">Rating</th>
                              </tr>
                            </thead>
                            <tbody>
                              {playerStats.map((ps, i) => (
                                <tr key={i} className="border-b border-brand-border/10 hover:bg-white/5 transition-colors">
                                  <td className="py-3 font-bold text-brand-text-light">#{ps.player_id}</td>
                                  <td className="py-3 text-center font-mono">{ps.minutes_played}'</td>
                                  <td className="py-3 text-center font-mono text-brand-green">{ps.goals}</td>
                                  <td className="py-3 text-center font-mono text-brand-blue">{ps.goal_assist}</td>
                                  <td className="py-3 text-center font-mono">{(ps.expected_goals || 0).toFixed(2)}</td>
                                  <td className="py-3 text-center font-mono">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded",
                                      ps.rating >= 7.5 ? "bg-brand-green text-black" : ps.rating >= 6.5 ? "bg-brand-yellow text-black" : "bg-brand-red text-white"
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
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'incidents' && incidents && (
              <div className="space-y-4">
                {incidents.length === 0 ? (
                  <div className="glass-card bg-brand-bg-card p-10 md:p-12 rounded-3xl border border-brand-border text-center space-y-4">
                    <History className="w-12 h-12 mx-auto text-brand-text-muted opacity-20" />
                    <p className="text-brand-text-muted italic uppercase text-xs tracking-widest">Aún no se han registrado incidentes clave</p>
                  </div>
                ) : (
                  <div className="bg-brand-bg-card p-8 rounded-3xl border border-brand-border shadow-xl space-y-8">
                    {incidents.map((inc, i) => (
                      <div key={i} className="flex items-center space-x-6 relative before:absolute before:left-[11px] before:top-8 before:bottom-[-20px] before:w-[2px] before:bg-brand-border last:before:hidden">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 shrink-0",
                          inc.type === 'GOAL' ? "bg-brand-green text-black" : "bg-brand-yellow text-black"
                        )}>
                          {inc.minute}'
                        </div>
                        <div>
                          <p className="text-sm font-bold text-brand-text-white">{inc.player}</p>
                          <p className="text-[10px] text-brand-text-muted uppercase tracking-wider">{inc.type === 'GOAL' ? 'GOOOOL!' : inc.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'lineups' && (
              <div className="space-y-6">
                {!lineups || lineups.lineup_status === 'unavailable' ? (
                  <div className="glass-card bg-brand-bg-card p-10 md:p-12 rounded-3xl border border-brand-border text-center space-y-4">
                    <Users className="w-12 h-12 mx-auto text-brand-text-muted opacity-20" />
                    <p className="text-brand-text-muted italic uppercase text-xs tracking-widest">
                      {lineups?.lineup_status === 'unavailable' ? 'Alineaciones aún no disponibles' : 'Cargando alineaciones...'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          lineups.lineup_status === 'confirmed' ? "bg-brand-green/20 border-brand-green text-brand-green" : "bg-brand-yellow/20 border-brand-yellow text-brand-yellow"
                        )}>
                          {lineups.lineup_status === 'confirmed' ? 'Confirmada' : 'Predicha por IA'}
                        </div>
                        {lineups.beta && <span className="text-[8px] text-brand-blue font-bold uppercase tracking-widest bg-brand-blue/10 px-2 py-0.5 rounded border border-brand-blue/30">Beta</span>}
                      </div>
                      {lineups.updated_at && (
                        <span className="text-[9px] text-brand-text-muted font-mono flex items-center">
                          <RefreshCw className="w-3 h-3 mr-1" /> Actualizado: {new Date(lineups.updated_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {['home', 'away'].map((side) => {
                        const team = side === 'home' ? lineups.lineups?.home : lineups.lineups?.away;
                        if (!team) return null;
                        return (
                          <div key={side} className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl space-y-6">
                             <div className="flex justify-between items-center">
                               <h4 className="text-sm font-display font-black text-brand-text-white flex items-center gap-2">
                                 <TeamLogo name={team.team_name} size="sm" />
                                 {team.team_name}
                               </h4>
                               <span className="text-[10px] font-mono font-bold text-brand-text-muted bg-white/5 px-2 py-1 rounded">{team.formation}</span>
                             </div>

                             {team.confidence !== undefined && team.confidence !== null && (
                               <div className="space-y-1.5">
                                 <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-widest text-brand-text-muted">
                                   <span>Confianza IA</span>
                                   <span className="text-brand-green">{(team.confidence * 100).toFixed(1)}%</span>
                                 </div>
                                 <div className="h-1 bg-brand-bg-primary rounded-full overflow-hidden">
                                   <div className="h-full bg-brand-green" style={{ width: `${team.confidence * 100}%` }} />
                                 </div>
                               </div>
                             )}

                             <div className="space-y-2">
                               {team.players.map(p => (
                                 <div key={p.id} className="flex items-center justify-between p-2.5 bg-brand-bg-primary/50 rounded-xl border border-brand-border/30 hover:border-brand-green/30 transition-all cursor-default group">
                                   <div className="flex items-center space-x-3">
                                     <div className="w-8 h-8 rounded-lg bg-brand-bg-card border border-brand-border flex items-center justify-center overflow-hidden shrink-0 group-hover:border-brand-green/50">
                                       {getImgUrl('player', p.id) ? (
                                         <img 
                                           src={getImgUrl('player', p.id)!} 
                                           alt={p.name} 
                                           className="w-full h-full object-cover"
                                           onError={(e) => {
                                             e.currentTarget.style.display = 'none';
                                             e.currentTarget.parentElement!.innerHTML = `<span class="text-[10px] font-mono font-bold text-brand-text-light">${p.jersey_number || '?'}</span>`;
                                           }}
                                         />
                                       ) : (
                                          <span className="text-[10px] font-mono font-bold text-brand-text-light">{p.jersey_number || '?'}</span>
                                       )}
                                     </div>
                                     <div>
                                       <p className="text-xs font-bold text-brand-text-white">{p.name}</p>
                                       <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-white/5 text-brand-text-muted uppercase tracking-tighter">{p.position}</span>
                                     </div>
                                   </div>
                                   {p.ai_score !== undefined && (
                                     <div className="text-right">
                                       <div className="text-[10px] font-mono font-bold text-brand-green">{(p.ai_score * 100).toFixed(1)}%</div>
                                       <div className="text-[8px] text-brand-text-muted uppercase tracking-widest">Afinidad IA</div>
                                     </div>
                                   )}
                                 </div>
                               ))}
                             </div>

                             {team.substitutes && team.substitutes.length > 0 && (
                               <div className="pt-4 border-t border-brand-border/30">
                                 <h5 className="text-[9px] text-brand-text-muted font-black uppercase tracking-widest mb-4">Suplentes</h5>
                                 <div className="grid grid-cols-2 gap-3">
                                    {team.substitutes.map(p => (
                                      <div key={p.id} className="text-[10px] font-bold text-brand-text-muted p-2 flex items-center bg-white/3 rounded-xl border border-white/5 hover:border-brand-green/30 transition-colors group">
                                        <div className="w-6 h-6 rounded-md bg-brand-bg-card border border-brand-border flex items-center justify-center overflow-hidden shrink-0 mr-2 group-hover:border-brand-green/30">
                                          {getImgUrl('player', p.id) ? (
                                            <img
                                              src={getImgUrl('player', p.id)!}
                                              alt={p.name}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.parentElement!.innerHTML = `<span class="text-[8px] font-mono font-bold">${p.jersey_number || '?'}</span>`;
                                              }}
                                            />
                                          ) : (
                                            <span className="text-[8px] font-mono font-bold">{p.jersey_number || '?'}</span>
                                          )}
                                        </div>
                                        <span className="truncate">{p.short_name || p.name}</span>
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
                      <div className="bg-brand-bg-card p-6 rounded-3xl border border-brand-border shadow-xl">
                        <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest mb-6 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-brand-red" /> Jugadores no disponibles
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {['home', 'away'].map(side => {
                            const psArr = side === 'home' ? lineups.unavailable_players?.home : lineups.unavailable_players?.away;
                            if (!psArr || psArr.length === 0) return null;
                            return (
                              <div key={side}>
                                <p className="text-[9px] text-brand-red font-black uppercase tracking-widest mb-3">{side === 'home' ? match.homeTeam : match.awayTeam}</p>
                                <div className="space-y-2">
                                  {psArr.map(p => (
                                    <div key={p.id} className="p-3 bg-brand-red/5 border border-brand-red/20 rounded-2xl flex justify-between items-center text-xs">
                                      <div>
                                        <span className="font-bold text-brand-text-white">{p.name}</span>
                                        <div className="text-[9px] text-brand-text-muted uppercase tracking-widest mt-0.5">{p.status}</div>
                                      </div>
                                      <span className="text-[10px] font-medium text-brand-red/70">{p.reason}</span>
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
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="bg-brand-bg-card p-6 md:p-10 rounded-[2rem] border border-brand-border shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-green/10 blur-[100px] -mr-16 -mt-16" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-blue/10 blur-[100px] -ml-16 -mb-16" />
                  
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 mb-10 md:mb-14">
                    <div className="p-3 md:p-4 bg-brand-bg-primary rounded-2xl border border-brand-border/50 shadow-inner">
                      <Zap className="w-6 h-6 md:w-8 md:h-8 text-brand-green animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-4xl font-display font-black text-brand-text-white tracking-[0.1em] md:tracking-widest uppercase leading-tight">
                        Análisis Profundos de IA
                      </h3>
                      <p className="text-[9px] md:text-xs text-brand-text-muted font-mono uppercase tracking-[0.3em] mt-1">Análisis Predictivo de Alto Nivel</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
                     <div className="space-y-6">
                        <div className="flex items-center gap-3">
                           <Target className="w-4 h-4 text-brand-red" />
                           <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.3em]">Veredicto Táctico</h4>
                        </div>
                        <div className="bg-brand-bg-primary/50 relative overflow-hidden rounded-2xl border border-brand-border/30 p-5 md:p-8 shadow-inner">
                           <div className="absolute top-0 left-0 w-1 h-full bg-brand-green opacity-50" />
                           <p className="text-sm md:text-lg text-brand-text-light leading-relaxed italic font-medium">
                              "{(metadata?.ai_preview?.text || "Analizando flujo heurístico... Se detecta un patrón de transiciones rápidas y presión constante en zonas críticas.")}"
                           </p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="flex items-center gap-3">
                           <TrendingUp className="w-4 h-4 text-brand-green" />
                           <h4 className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.3em]">Métricas de Valor</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div className="bg-brand-bg-primary/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-24 md:h-32">
                              <span className="text-[8px] text-brand-text-muted font-bold uppercase tracking-widest">Valor xG Táctico</span>
                              <div className="flex items-baseline gap-2">
                                 <span className="text-2xl md:text-4xl font-mono font-black text-brand-green">{(stats ? (stats.xgHome + stats.xgAway) : 1.40).toFixed(2)}</span>
                                 <div className="px-1.5 py-0.5 rounded text-[7px] font-black bg-brand-green/20 text-brand-green">ALTO</div>
                              </div>
                           </div>
                           <div className="bg-brand-bg-primary/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-24 md:h-32">
                              <span className="text-[8px] text-brand-text-muted font-bold uppercase tracking-widest">Momentum</span>
                              <div className="flex items-baseline gap-2">
                                 <span className="text-2xl md:text-4xl font-mono font-black text-brand-blue">{(Math.abs(momentum) * 10).toFixed(1)}</span>
                                 <span className="text-[9px] font-bold text-brand-text-muted uppercase">Índice</span>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
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
