import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { useMatchStore } from './hooks/useMatchStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Search, Trophy, LayoutGrid, Users, BarChart3, Globe, ChevronDown, ChevronRight, Monitor, Activity, Swords, ShieldCheck, RefreshCw, ShoppingBag, Loader2, Zap, Star, Sparkles, Target } from 'lucide-react';
import { cn, Event } from './types';
import { subscribeToApiCounter, subscribeToApiStatus } from './services/api';
import { Footer } from './components/Footer';

type AppView = 'live' | 'predictions' | 'value' | 'leagues' | 'tv';

import { motion, AnimatePresence } from 'motion/react';
import { TeamModalProvider, useTeamModal } from './contexts/TeamModalContext';
import { calculateHybridPrediction, calculatePoissonModel } from './lib/prediction';
import { PredictionsView } from './components/PredictionsView';
import { MatchDashboard } from './components/MatchDashboard';
import { EnrichedMatchCard } from './components/EnrichedMatchCard';
import { ErrorFallback } from './components/ErrorFallback';
import { TeamForm } from './types';
import { FootballLoader } from './components/FootballLoader';

// Lazy loaded views
const CompetitionView = lazy(() => import('./components/CompetitionView').then(m => ({ default: m.CompetitionView })));
const MarketHub = lazy(() => import('./components/MarketHub').then(m => ({ default: m.MarketHub })));
const DiagnosticView = lazy(() => import('./components/DiagnosticView').then(m => ({ default: m.DiagnosticView })));
const PlayerModal = lazy(() => import('./components/PlayerModal').then(m => ({ default: m.PlayerModal })));
const MatchAnalysisModal = lazy(() => import('./components/MatchAnalysisModal').then(m => ({ default: m.MatchAnalysisModal })));
const TeamModal = lazy(() => import('./components/TeamModal').then(m => ({ default: m.TeamModal })));
const BettingHub = lazy(() => import('./components/BettingHub').then(m => ({ default: m.BettingHub })));
const SureBetsView = lazy(() => import('./components/SureBetsView').then(m => ({ default: m.SureBetsView })));
const TVGuideView = lazy(() => import('./components/TVGuideView').then(m => ({ default: m.TVGuideView })));

const SuspenseLoader = () => (
  <div className="flex-1 flex items-center justify-center bg-brand-bg-primary h-full">
    <FootballLoader />
  </div>
);

function ApiCounter() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'connected' | 'error' | 'unauthorized'>('connected');

  useEffect(() => {
    const unsubCount = subscribeToApiCounter((newCount) => {
      setCount(newCount);
    });
    const unsubStatus = subscribeToApiStatus((newStatus) => {
      setStatus(newStatus);
    });
    return () => {
      unsubCount();
      unsubStatus();
    };
  }, []);

  const statusInfo = {
    connected: { 
      icon: <div className="w-2 h-2 rounded-full bg-brand-green shadow-[0_0_8px_rgba(78,222,163,0.8)] animate-pulse" />, 
      text: 'SYSTEM LIVE', 
      color: 'text-brand-green' 
    },
    error: { 
      icon: <div className="w-2 h-2 rounded-full bg-brand-red shadow-[0_0_8px_rgba(255,122,115,0.8)] animate-pulse" />, 
      text: 'CONNECTION DROP', 
      color: 'text-brand-red' 
    },
    unauthorized: { 
      icon: <div className="w-2 h-2 rounded-full bg-brand-yellow shadow-[0_0_8px_rgba(255,184,87,0.8)] animate-pulse" />, 
      text: 'AUTH REQD', 
      color: 'text-brand-yellow' 
    }
  };

  const { icon, text, color } = statusInfo[status];

  return (
    <div className="flex items-center space-x-2 md:space-x-3 px-2 md:px-4 py-1 rounded-full border border-brand-border/30 text-[8px] md:text-[9px] font-black font-mono bg-brand-bg-primary/50">
      <div className={cn("flex items-center space-x-1.5 md:space-x-2 pr-2 md:pr-3 border-r border-brand-border/30", color)}>
        {icon}
        <span className="uppercase tracking-[0.2em]">{text}</span>
      </div>
      <span className="text-brand-text-muted tracking-widest uppercase truncate max-w-[80px] md:max-w-none">PT {count.toString().padStart(6, '0')}</span>
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('live');
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});
  const [globalPlayerId, setGlobalPlayerId] = useState<string | null>(null);
  const [analysisMatch, setAnalysisMatch] = useState<Event | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  // New States for API metrics, Header tabs filtering, search, and hamburger menu
  const [apiCount, setApiCount] = useState(0);
  const [apiStatus, setApiStatus] = useState<'connected' | 'error' | 'unauthorized'>('connected');
  const [headerTab, setHeaderTab] = useState<'live' | 'today' | 'top' | 'predictions'>('live');
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { matches, upcomingMatches, selectedMatchId, setSelectedMatchId, liveData, lastStats, loading, apiError, groupedByMarket, getMarketProbabilities, getMatchBadge, topPicks, groupedByDay, dayLabels, teamForms, syncMatchDetail, v2Predictions, enrichedData, frozenPredictions } = useMatchStore();

  // High-visibility scroll tracking states for App views
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [sidebarScrollStats, setSidebarScrollStats] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setSidebarScrollStats({ scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight });
  };

  const centerScrollRef = useRef<HTMLDivElement>(null);
  const [centerScrollStats, setCenterScrollStats] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const handleCenterScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setCenterScrollStats({ scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight });
  };

  // Keep scroll stats in sync with dynamic searches, views and list tabs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sidebarScrollRef.current) {
        const target = sidebarScrollRef.current;
        setSidebarScrollStats({ scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight });
      }
      if (centerScrollRef.current) {
        const target = centerScrollRef.current;
        setCenterScrollStats({ scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, headerTab, activeView, selectedMatchId]);

  useEffect(() => {
    const unsubCount = subscribeToApiCounter((newCount) => {
      setApiCount(newCount);
    });
    const unsubStatus = subscribeToApiStatus((newStatus) => {
      setApiStatus(newStatus);
    });
    return () => {
      unsubCount();
      unsubStatus();
    };
  }, []);

  const liveCount = useMemo(() => {
    return matches.filter(m => m.status === 'LIVE').length;
  }, [matches]);

  const headerTabs = [
    { id: 'live' as const, label: 'En Vivo', emoji: '🔴' },
    { id: 'today' as const, label: 'Hoy', emoji: '📅' },
    { id: 'top' as const, label: 'Top Picks', emoji: '⭐' },
    { id: 'predictions' as const, label: 'Predicciones', emoji: '📊' }
  ];

  const handleTabClick = (tabId: 'live' | 'today' | 'top' | 'predictions') => {
    setHeaderTab(tabId);
    setActiveView('live');
    setIsMobileMenuOpen(false);
  };

  const toggleLeague = (league: string) => {
    setCollapsedLeagues(prev => ({ ...prev, [league]: !prev[league] }));
  };

  const filteredEventsList = useMemo(() => {
    let pool: Event[] = [];
    if (headerTab === 'live') {
      pool = matches.filter(m => m.status === 'LIVE');
    } else if (headerTab === 'today') {
      pool = groupedByDay.today || [];
    } else if (headerTab === 'top') {
      pool = topPicks || [];
    } else if (headerTab === 'predictions') {
      pool = v2Predictions.map(p => p.event) || [];
    }

    if (searchTerm.trim() !== '') {
      const s = searchTerm.toLowerCase();
      pool = pool.filter(m => 
        (m.homeTeam || '').toLowerCase().includes(s) || 
        (m.awayTeam || '').toLowerCase().includes(s) ||
        (m.leagueName || '').toLowerCase().includes(s)
      );
    }
    return pool;
  }, [headerTab, searchTerm, matches, groupedByDay, topPicks, v2Predictions]);

  const groupedFilteredEvents = useMemo(() => {
    const sorted = [...filteredEventsList].sort((a, b) => {
      const priority = { 'LIVE': 0, 'SCHEDULED': 1, 'FINISHED': 2 };
      const pA = priority[a.status] ?? 3;
      const pB = priority[b.status] ?? 3;
      if (pA !== pB) return pA - pB;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const groups: Record<string, Event[]> = {};
    sorted.forEach(m => {
      const name = m.leagueName || 'Desconocido';
      if (!groups[name]) groups[name] = [];
      groups[name].push(m);
    });
    return groups;
  }, [filteredEventsList]);

  const groupedMatches = useMemo(() => {
    const sorted = [...matches].sort((a, b) => {
      // Priority: LIVE > SCHEDULED > FINISHED
      const priority = { 'LIVE': 0, 'SCHEDULED': 1, 'FINISHED': 2 };
      const pA = priority[a.status] ?? 3;
      const pB = priority[b.status] ?? 3;
      if (pA !== pB) {
        return pA - pB;
      }
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const groups: Record<string, Event[]> = {};
    sorted.forEach(m => {
      if (!groups[m.leagueName]) groups[m.leagueName] = [];
      groups[m.leagueName].push(m);
    });
    return groups;
  }, [matches]);

  const groupedUpcoming = useMemo(() => {
    const liveIds = new Set(matches.map(m => m.id));
    const upcomingFiltered = (upcomingMatches || []).filter(m => !liveIds.has(m.id)).sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const groups: Record<string, Event[]> = {};
    upcomingFiltered.forEach(m => {
      if (!groups[m.leagueName]) groups[m.leagueName] = [];
      groups[m.leagueName].push(m);
    });
    return groups;
  }, [upcomingMatches, matches]);

  const selectedMatch = matches.find(m => m.id === selectedMatchId) || (upcomingMatches || []).find(m => m.id === selectedMatchId);

  const NavItem = ({ id, icon: Icon, label }: { id: AppView, icon: any, label: string }) => (
    <button
      onClick={() => setActiveView(id)}
      title={label}
      className={cn(
        "flex flex-col items-center justify-center flex-1 md:flex-none h-full md:h-auto md:w-full md:py-4 transition-all duration-200 relative group overflow-hidden",
        activeView === id ? "bg-brand-green/10 text-brand-green" : "text-brand-text-muted hover:text-brand-text-white hover:bg-white/5"
      )}
    >
      <div className={cn(
        "custom-icon-wrapper md:mb-1 transition-all duration-200 scale-90 md:scale-100",
        activeView === id ? "bg-brand-green/20 border-brand-green/40 shadow-[0_0_15px_rgba(0,255,136,0.25)] !rounded-full" : ""
      )}>
        <Icon className={cn("w-4.5 h-4.5 md:w-5 md:h-5 transition-all duration-200", activeView === id ? "scale-110 drop-shadow-[0_0_10px_rgba(78,222,163,0.4)]" : "group-hover:scale-110")} />
      </div>
      <span className="text-[8px] md:text-[9px] font-black uppercase tracking-tight md:tracking-widest mt-0.5 md:mt-2 truncate max-w-full px-0.5 transition-all duration-200">{label}</span>
      
      <AnimatePresence>
        {activeView === id && (
          <motion.div 
            layoutId="activeNav"
            className="absolute inset-0 z-[-1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="hidden md:block absolute left-0 top-1/4 bottom-1/4 w-1 bg-brand-green shadow-[0_0_15px_rgba(78,222,163,0.8)] rounded-r-full" />
            <div className="md:hidden absolute top-0 left-1/4 right-1/4 h-1 bg-brand-green shadow-[0_0_15px_rgba(78,222,163,0.8)] rounded-b-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );

  const LeagueGroup = ({ title, groups, isUpcoming = false }: { title: string, groups: Record<string, Event[]>, isUpcoming?: boolean }) => {
    return (
      <div className="mb-6">
        <h2 className="text-xs font-bold text-brand-text-muted uppercase tracking-widest px-2 mb-2 flex items-center space-x-2">
          <span>{title}</span>
        </h2>
        
        {Object.keys(groups).length === 0 ? (
          <div className="p-4 text-center text-brand-text-muted text-sm space-y-2">
            <ActivityIcon className="w-6 h-6 mx-auto opacity-20" />
            <p>No hay partidos</p>
          </div>
        ) : null}

        {(Object.entries(groups) as [string, Event[]][]).map(([league, leagueMatches]) => (
          <div key={league} className="space-y-1">
            <button 
              onClick={() => toggleLeague(league)}
              className="w-full flex items-center justify-between p-2 hover:bg-brand-bg-hover rounded-lg group"
            >
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 bg-brand-bg-card rounded flex items-center justify-center border border-brand-border">
                  <Globe className="w-3 h-3 text-brand-text-muted group-hover:text-brand-green transition-colors" />
                </span>
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest">{league}</span>
              </div>
              {collapsedLeagues[league] ? <ChevronRight className="w-3 h-3 text-brand-text-muted" /> : <ChevronDown className="w-3 h-3 text-brand-text-muted" />}
            </button>
            
            {!collapsedLeagues[league] && (
              <div className="space-y-1">
                {leagueMatches.map(match => {
                  const badge = getMatchBadge(match);
                  return (
                    <EnrichedMatchCard 
                      key={match.id}
                      match={match}
                      isUpcoming={isUpcoming}
                      selectedMatchId={selectedMatchId}
                      setSelectedMatchId={setSelectedMatchId}
                      badgeData={badge as any}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (apiError === 'API_KEY_MISSING') {
    return (
      <div className="h-screen bg-brand-bg-primary flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-16 h-16 bg-brand-red/10 flex items-center justify-center rounded-2xl border border-brand-red">
           <Trophy className="w-8 h-8 text-brand-red" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold text-brand-text-white uppercase tracking-wider mb-2">API Key Required</h2>
          <p className="text-brand-text-muted max-w-md mx-auto">
            Please configure the <code className="bg-black px-1 py-0.5 rounded text-brand-green">BZZOIRO_API_KEY</code> environment variable via Google AI Studio settings to connect directly to the real API.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen bg-brand-bg-primary flex items-center justify-center relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-green/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <FootballLoader />
        </div>
        
        {/* Status indicator at the bottom */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 opacity-50">
          <ApiCounter />
        </div>
      </div>
    );
  }

  const getStatusIndicator = (statusValue: typeof apiStatus) => {
    switch (statusValue) {
      case 'connected':
        return (
          <div className="flex items-center space-x-1.5 bg-brand-green/10 border border-brand-green/20 px-2.5 py-1 rounded-full uppercase shrink-0">
            <span className="relative flex h-2 w-2 animate-pulse">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green"></span>
            </span>
            <span className="text-xs font-medium text-brand-green hidden sm:inline uppercase tracking-widest">CONNECTED</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center space-x-1.5 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-full uppercase shrink-0">
            <span className="relative flex h-2 w-2 animate-pulse">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
            </span>
            <span className="text-xs font-medium text-red-400 hidden sm:inline uppercase tracking-widest">ERROR</span>
          </div>
        );
      case 'unauthorized':
        return (
          <div className="flex items-center space-x-1.5 bg-brand-yellow/10 border border-brand-yellow/20 px-2.5 py-1 rounded-full uppercase shrink-0">
            <span className="relative flex h-2 w-2 animate-pulse">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-yellow opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-yellow"></span>
            </span>
            <span className="text-xs font-medium text-brand-yellow hidden sm:inline uppercase tracking-widest">UNAUTHORIZED</span>
          </div>
        );
    }
  };

  return (
    <div className="app-container h-[100dvh] bg-brand-bg-primary flex flex-col text-brand-text-white font-sans selection:bg-brand-green/30 relative overflow-hidden">

      {/* 1. HEADER PRINCIPAL (Altura fija 56px, sticky top-0, z-50) */}
      <header className="sticky top-0 z-50 w-full h-[56px] min-h-[56px] bg-brand-bg-secondary/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-6 shrink-0 select-none">
        {/* Left: Logo/nombre "BSD" */}
        <div className="flex items-center space-x-4">
          <span 
            onClick={() => handleTabClick('live')}
            className="font-black text-xl text-brand-green font-display tracking-tight cursor-pointer hover:opacity-80 active:scale-95 transition-all"
          >
            BSD
          </span>
          {liveCount > 0 && (
            <div className="flex items-center space-x-1.5 bg-brand-green/10 border border-brand-green/20 px-2.5 py-0.5 rounded-full select-none animate-pulse">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green"></span>
              </span>
              <span className="text-[9px] font-mono font-black text-brand-green uppercase tracking-wider">{liveCount} LIVE</span>
            </div>
          )}
        </div>

        {/* Center: Tabs de navegación principal (solo desktop, oculto en mobile) */}
        <div className="hidden md:flex items-center space-x-8 h-full relative">
          {headerTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "relative h-full px-1 flex items-center text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                headerTab === tab.id ? "after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-brand-green text-white" : "text-brand-text-muted hover:text-white"
              )}
            >
              <span className="flex items-center space-x-1.5 transition-colors duration-200">
                <span className="text-sm">{tab.emoji}</span>
                <span>{tab.label}</span>
                {tab.id === 'live' && liveCount > 0 && (
                  <span className="bg-brand-green text-black text-xs font-black px-1.5 rounded-full ml-1.5 animate-pulse">
                    {liveCount}
                  </span>
                )}
              </span>
              {headerTab === tab.id && (
                <motion.div
                  layoutId="headerTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green shadow-[0px_-2px_10px_#00ff88]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Right: API counter and Status Indicator */}
        <div className="flex items-center space-x-3 md:space-x-4">
          {/* Daily API calls: "API: 142/∞" */}
          <div className="text-[10px] md:text-xs font-mono font-extrabold text-brand-text-muted bg-neutral-900/40 border border-white/5 py-1 px-2.5 rounded-lg flex items-center space-x-1">
            <span>API:</span>
            <span className="text-brand-green font-black">{apiCount}</span>
            <span className="text-white/30">/</span>
            <span>∞</span>
          </div>

          {/* Connection status */}
          {getStatusIndicator(apiStatus)}

          {/* Mobile simple hamburger trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 rounded-lg bg-white/5 border border-white/5 active:scale-90 transition-transform cursor-pointer"
          >
            <div className={cn("w-4.5 h-0.5 bg-white transition-transform duration-300", isMobileMenuOpen ? "rotate-45 translate-y-1.5" : "")} />
            <div className={cn("w-4.5 h-0.5 bg-white mt-1 transition-opacity duration-300", isMobileMenuOpen ? "opacity-0" : "")} />
            <div className={cn("w-4.5 h-0.5 bg-white mt-1 transition-transform duration-300", isMobileMenuOpen ? "-rotate-45 -translate-y-1.5" : "")} />
          </button>
        </div>
      </header>

      {/* 2. SUB-HEADER SCROLLBAR (solo mobile < 768px) */}
      <div className="md:hidden sticky top-[56px] z-40 w-full bg-brand-bg-secondary/95 backdrop-blur-xl border-b border-white/5 overflow-x-auto scrollbar-none flex items-center py-2.5 px-4 space-x-2.5 whitespace-nowrap active-scroller shrink-0 select-none">
        {headerTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 border cursor-pointer relative",
              headerTab === tab.id
                ? "bg-brand-green/15 border-brand-green/45 text-brand-green font-black shadow-[0_0_10px_rgba(0,255,136,0.1)]"
                : "bg-white/5 border-white/5 text-brand-text-muted hover:text-white"
            )}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.id === 'live' && liveCount > 0 && (
              <span className="bg-brand-green text-black text-xs font-black px-1.5 rounded-full ml-1">
                {liveCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 3. MOBILE MENU BOTTOM DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] md:hidden cursor-pointer"
            />
            {/* Slide up Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 max-h-[80vh] bg-[#090909] border-t border-white/10 rounded-t-[2rem] z-[120] p-6 pb-12 flex flex-col space-y-6 md:hidden shadow-[0_-15px_40px_rgba(0,0,0,0.9)]"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto shrink-0" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-text-muted">Navegación Principal BSD</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)} 
                  className="text-xs font-bold text-white/50 hover:text-white transition-colors"
                >
                  Cerrar
                </button>
              </div>

              <div className="flex flex-col space-y-2.5 overflow-y-auto">
                {headerTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all text-xs font-black uppercase tracking-wider flex items-center justify-between group cursor-pointer",
                      headerTab === tab.id
                        ? "bg-brand-green/10 border-brand-green/35 text-brand-green shadow-inner"
                        : "bg-white/5 border-white/5 text-brand-text-white/80 hover:bg-white/10"
                    )}
                  >
                    <span className="flex items-center space-x-3">
                      <span className="text-lg">{tab.emoji}</span>
                      <span>{tab.label}</span>
                      {tab.id === 'live' && liveCount > 0 && (
                        <span className="bg-brand-green text-black text-xs font-black px-1.5 rounded-full ml-1 animate-pulse">
                          {liveCount}
                        </span>
                      )}
                    </span>
                    <span className={cn(
                      "text-[9px] font-mono tracking-widest text-white/20 transition-transform group-hover:translate-x-1",
                      headerTab === tab.id ? "text-brand-green font-black" : ""
                    )}>Seleccionar →</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Premium Ambient Backdrops */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-green/3 rounded-full blur-[130px] animate-pulse" style={{ animationDuration: '9s' }} />
        <div className="absolute top-1/3 -right-10 w-[500px] h-[500px] bg-brand-blue/2 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '14s' }} />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 bg-brand-yellow/2 rounded-full blur-[110px] animate-pulse" style={{ animationDuration: '11s' }} />
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative w-full min-h-0">

      {/* Navigation (Sidebar Desktop / Bottom Mobile) */}
      <nav className="w-full md:w-20 lg:w-24 h-16 md:h-full border-t md:border-r md:border-t-0 border-brand-border bg-brand-bg-secondary flex flex-row md:flex-col items-center justify-around md:justify-start md:py-8 lg:py-10 md:space-y-6 lg:space-y-8 z-[100] order-last md:order-first shrink-0 relative mt-0 overflow-visible">
        <div className="hidden md:flex flex-col items-center mb-6 lg:mb-10 shrink-0">
           <div className="relative group/logo">
             <div className="absolute inset-0 bg-brand-green/20 blur-xl rounded-full opacity-0 group-hover/logo:opacity-100 transition-opacity duration-700" />
             <img 
               src="/src/assets/images/app_logo_futuristic_radar_1780106234733.png" 
               alt="Match Intel" 
               className="w-12 h-12 relative z-10 transition-transform duration-700 group-hover/logo:rotate-[360deg]" 
             />
           </div>
           <div className="w-8 h-0.5 bg-brand-green mt-4 rounded-full opacity-50" />
        </div>
        
        <NavItem id="live" icon={Activity} label="Vivo" />
        <NavItem id="predictions" icon={Sparkles} label="Predicciones" />
        <NavItem id="value" icon={Target} label="Valor" />
        <NavItem id="leagues" icon={Globe} label="Ligas" />
        <NavItem id="tv" icon={Monitor} label="TV" />

        <div className="hidden md:flex flex-col items-center mt-auto w-full border-t border-brand-border/30 pt-4">
          <button 
            onClick={() => setShowDiagnostic(true)}
            className="flex flex-col items-center justify-center p-4 text-brand-text-muted hover:text-brand-green transition-all group w-full"
            title="Soporte y API"
          >
            <div className="custom-icon-wrapper mb-1">
              <ShieldCheck className="w-5 h-5 group-hover:scale-110" />
            </div>
          </button>
        </div>
      </nav>

      {showDiagnostic && (
        <ErrorBoundary>
          <Suspense fallback={<SuspenseLoader />}>
            <DiagnosticView onClose={() => setShowDiagnostic(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Conditional Sidebar */}
      {activeView === 'live' && (
        <aside className={cn(
          "w-full md:w-96 border-r border-brand-border bg-brand-bg-primary flex flex-col z-20 md:shrink-0",
          selectedMatchId ? "hidden md:flex" : "flex flex-1 min-h-0 md:h-full"
        )}>
          <div className="p-4 md:p-6 border-b border-brand-border shrink-0">
            <h1 className="text-2xl font-display font-black tracking-tighter text-brand-text-white uppercase italic mb-6">
              CENTRO <span className="text-brand-green font-sans">EN VIVO</span>
            </h1>
            
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted group-focus-within:text-brand-green transition-colors animate-pulse" />
              <input 
                type="text" 
                placeholder="Filtrar eventos..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-brand-bg-card border border-brand-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-green/30 transition-all text-brand-text-white"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 relative flex flex-col w-full overflow-hidden">
            <div 
              ref={sidebarScrollRef}
              onScroll={handleSidebarScroll}
              className="flex-1 min-h-0 overflow-y-scroll p-2 pb-24 space-y-1 scroll-smooth touch-scroll relative z-0"
            >
              <LeagueGroup 
                title={
                  headerTab === 'live' ? "⚽ EN VIVO (HOY)" :
                  headerTab === 'today' ? "📅 PARTIDOS DE HOY" :
                  headerTab === 'top' ? "⭐ SELECCIÓN TOP PICKS" :
                  "📊 PRONÓSTICOS INTELIGENTES"
                } 
                groups={groupedFilteredEvents} 
              />
            </div>

            {/* Custom Glowing Cyber-Green Scrollbar Overlay for Sidebar */}
            {sidebarScrollStats.scrollHeight > sidebarScrollStats.clientHeight && (
              <div className="absolute right-0.5 top-2 bottom-2 w-1.5 pointer-events-none z-50 bg-black/40 rounded-full border border-white/5 backdrop-blur-[1px]">
                <div 
                  className="absolute left-0 right-0 rounded-full bg-gradient-to-b from-[#00ff88] to-[#00d4ff] shadow-[0_0_8px_rgba(0,255,136,0.4)] transition-all duration-75"
                  style={{
                    height: `${Math.max(30, sidebarScrollStats.clientHeight * (sidebarScrollStats.clientHeight / sidebarScrollStats.scrollHeight))}px`,
                    transform: `translateY(${(sidebarScrollStats.scrollTop / (sidebarScrollStats.scrollHeight - sidebarScrollStats.clientHeight)) * (sidebarScrollStats.clientHeight - Math.max(30, sidebarScrollStats.clientHeight * (sidebarScrollStats.clientHeight / sidebarScrollStats.scrollHeight)) - 16) + 8}px)`
                  }}
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main Panel */}
      <main className={cn(
        "flex-1 flex flex-col relative bg-brand-bg-primary min-w-0 w-full overflow-hidden",
        activeView === 'live' && !selectedMatchId ? "hidden md:flex" : "flex h-full"
      )}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col w-full min-h-0 relative"
          >
            {/* Si hay un partido seleccionado, mostramos el dashboard independientemente de la pestaña activa (excepto en ligas/mercado que son vistas distintas) */}
            {activeView === 'live' && selectedMatch ? (
              <div className="flex-1 flex flex-col relative w-full h-full">
                <button 
                  onClick={() => setSelectedMatchId(null)}
                  className="md:hidden p-4 flex items-center space-x-2 text-brand-text-muted hover:text-brand-text-white font-bold text-[10px] uppercase tracking-widest bg-brand-bg-card/80 backdrop-blur-md border-b border-brand-border shrink-0 z-50 sticky top-0"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  <span>Volver a Partidos</span>
                </button>
                <div className="flex-1 relative z-0 flex flex-col min-h-0">
                  <div className="flex-1 w-full max-w-full flex flex-col min-h-0">
                    <ErrorBoundary>
                      <Suspense fallback={<SuspenseLoader />}>
                        <MatchDashboard 
                          match={selectedMatch}
                          stats={liveData.stats}
                          prediction={liveData.prediction}
                          odds={liveData.odds}
                          incidents={liveData.incidents}
                          momentum={liveData.momentum}
                          lastStats={lastStats}
                          metadata={liveData.metadata}
                          lineups={liveData.lineups}
                          playerStats={liveData.playerStats}
                          syncMatchDetail={syncMatchDetail}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 relative z-10 flex flex-col overflow-hidden">
                <div className="flex-1 w-full max-w-full flex flex-col relative overflow-hidden">
                  <div 
                    ref={centerScrollRef}
                    onScroll={handleCenterScroll}
                    className="flex-1 w-full max-w-full flex flex-col overflow-y-scroll min-h-0 focus:outline-none"
                  >
                  {activeView === 'live' && (
                    <div className="p-4 md:p-6 lg:p-10 space-y-8 md:space-y-12 min-h-0 w-full max-w-7xl mx-auto">
                      {/* Probability Quick View */}
                      {topPicks.length > 0 && (
                        <div className="space-y-4">
                           <div className="flex items-center justify-between">
                            <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-brand-text-white flex items-center gap-2">
                              <Star className="w-3.5 h-3.5 text-brand-yellow fill-brand-yellow" />
                              Top Picks del Día
                            </h3>
                            <button onClick={() => setActiveView('predictions')} className="text-[9px] font-bold text-brand-green uppercase tracking-widest hover:underline hover:opacity-80">Ver Todos</button>
                           </div>
                           <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
                              {topPicks.slice(0, 4).map(m => (
                                <button 
                                  key={m.id} 
                                  onClick={() => setSelectedMatchId(m.id)}
                                  className="bg-brand-bg-secondary/40 border border-white/5 p-4 rounded-2xl hover:border-brand-green/30 transition-all text-left flex flex-col justify-between h-32"
                                >
                                  <div className="flex justify-between items-start mb-2">
                                     <span className="text-[8px] font-mono text-brand-text-muted">{new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                     <div className="px-1.5 py-0.5 bg-brand-green/10 rounded text-[7px] font-bold text-brand-green uppercase">Top Pick</div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-bold truncate">{m.homeTeam}</div>
                                    <div className="text-[10px] font-bold truncate">{m.awayTeam}</div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-brand-text-muted">Confianza</span>
                                    <span className="text-xs font-mono font-black text-brand-green">92%</span>
                                  </div>
                                </button>
                              ))}
                           </div>
                        </div>
                      )}

                      {/* Welcome Header */}
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                          <h2 className="text-3xl font-black italic tracking-tighter text-brand-text-white uppercase">
                            PANEL DE <span className="text-brand-green">CONTROL</span>
                          </h2>
                          <p className="text-brand-text-muted text-[10px] uppercase font-bold tracking-[0.3em] mt-1">Sincronización en tiempo real BSD</p>
                        </div>
                        <div className="flex items-center gap-3 bg-brand-bg-card p-3 rounded-2xl border border-brand-border/30 shadow-[0_0_15px_rgba(78,222,163,0.1)]">
                          <Activity className="w-5 h-5 text-brand-green" />
                          <div>
                            <div className="text-[10px] font-black text-brand-text-white uppercase leading-none">{matches.length} ACTIVOS</div>
                            <div className="text-[8px] font-bold text-brand-green uppercase tracking-tighter mt-1">Feed en Tiempo Real</div>
                          </div>
                        </div>
                      </div>

                      {/* Features Grid to fill space */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-card p-6 rounded-[2rem] border-l-4 border-brand-green">
                           <Trophy className="w-8 h-8 text-brand-green mb-4" />
                           <h3 className="text-sm font-black text-brand-text-white uppercase tracking-widest mb-2">Algoritmo Elite</h3>
                           <p className="text-[10px] text-brand-text-muted leading-relaxed uppercase tracking-tighter">Motor de predicción basado en modelos matemáticos de alta fidelidad y heurística deportiva avanzada.</p>
                        </div>
                        <div className="glass-card p-6 rounded-[2rem] border-l-4 border-brand-yellow">
                           <BarChart3 className="w-8 h-8 text-brand-yellow mb-4" />
                           <h3 className="text-sm font-black text-brand-text-white uppercase tracking-widest mb-2">Cuotas Dinámicas</h3>
                           <p className="text-[10px] text-brand-text-muted leading-relaxed uppercase tracking-tighter">Seguimiento instantáneo de movimientos en el mercado para detectar valor en hándicaps y totales.</p>
                        </div>
                        <div className="glass-card p-6 rounded-[2rem] border-l-4 border-brand-red">
                           <Monitor className="w-8 h-8 text-brand-red mb-4" />
                           <h3 className="text-sm font-black text-brand-text-white uppercase tracking-widest mb-2">Análisis Técnico</h3>
                           <p className="text-[10px] text-brand-text-muted leading-relaxed uppercase tracking-tighter">Métricas en vivo incluyendo xG (Expected Goals), Momentum y Posicionamiento Táctico Real.</p>
                        </div>
                      </div>

                      {/* Placeholder content if empty */}
                      <div className="py-12 md:py-20 flex flex-col items-center justify-center text-brand-text-muted space-y-4 glass-card rounded-[3rem] border border-brand-border/20">
                        <div className="w-20 h-20 md:w-24 md:h-24 bg-brand-bg-card rounded-full flex items-center justify-center border border-brand-border/50 shadow-inner relative">
                           <Trophy className="w-10 h-10 md:w-12 md:h-12 opacity-30" />
                           <div className="absolute inset-0 rounded-full border-2 border-brand-green/20 animate-ping" />
                        </div>
                        <div className="text-center px-4">
                          <p className="text-brand-text-white font-black uppercase tracking-[0.4em] text-xs md:text-sm">ESPERANDO SELECCIÓN</p>
                          <p className="font-sans text-[9px] md:text-[10px] text-brand-text-muted uppercase tracking-widest mt-2 opacity-60">Elige un partido del panel lateral para iniciar el análisis táctico</p>
                        </div>
                      </div>

                      <div className="mt-12 opacity-40">
                        <Footer />
                      </div>
                    </div>
                  )}
                  {activeView === 'predictions' && (
                    <div className="p-4 md:p-8 space-y-8 min-h-0">
                       <div className="max-w-7xl mx-auto w-full">
                        <div className="mb-8">
                          <h2 className="text-3xl font-black italic tracking-tighter text-brand-text-white uppercase">
                            DIARIO DE <span className="text-brand-green">PREDICCIONES</span>
                          </h2>
                          <p className="text-brand-text-muted text-[10px] uppercase font-bold tracking-[0.3em] mt-1">Sincronización de eventos próximos (Calendario IA)</p>
                        </div>
                        <ErrorBoundary>
                          <Suspense fallback={<SuspenseLoader />}>
                            <PredictionsView 
                              groupedByDay={groupedByDay} 
                              v2Predictions={v2Predictions}
                              enrichedData={enrichedData}
                              dayLabels={dayLabels}
                              onSelectMatch={(id) => {
                                const m = (groupedByDay.today.concat(groupedByDay.tomorrow, groupedByDay.dayAfter, groupedByDay.later)).find(match => match.id === id);
                                if (m) setAnalysisMatch(m);
                              }} 
                              getMarketProbabilities={getMarketProbabilities} 
                              frozenPredictions={frozenPredictions}
                              teamForms={teamForms}
                            />
                          </Suspense>
                        </ErrorBoundary>
                      </div>
                    </div>
                  )}
                  {activeView === 'value' && (
                    <div className="relative">
                      <ErrorBoundary>
                        <Suspense fallback={<SuspenseLoader />}>
                          <SureBetsView />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  )}
                  {activeView === 'leagues' && (
                    <div className="relative min-h-0">
                      <ErrorBoundary><Suspense fallback={<SuspenseLoader />}><CompetitionView /></Suspense></ErrorBoundary>
                    </div>
                  )}
                  {activeView === 'tv' && (
                    <div className="relative">
                      <ErrorBoundary><Suspense fallback={<SuspenseLoader />}><TVGuideView /></Suspense></ErrorBoundary>
                    </div>
                  )}
                  </div>

                  {/* Custom Glowing Cyber-Green Scrollbar Overlay for Central Main Panel */}
                  {centerScrollStats.scrollHeight > centerScrollStats.clientHeight && (
                    <div className="absolute right-1 top-2 bottom-2 w-1.5 pointer-events-none z-50 bg-black/40 rounded-full border border-white/5 backdrop-blur-[1px]">
                      <div 
                        className="absolute left-0 right-0 rounded-full bg-gradient-to-b from-[#00ff88] to-[#00d4ff] shadow-[0_0_8px_rgba(0,255,136,0.4)] transition-all duration-75"
                        style={{
                          height: `${Math.max(40, centerScrollStats.clientHeight * (centerScrollStats.clientHeight / centerScrollStats.scrollHeight))}px`,
                          transform: `translateY(${(centerScrollStats.scrollTop / (centerScrollStats.scrollHeight - centerScrollStats.clientHeight)) * (centerScrollStats.clientHeight - Math.max(40, centerScrollStats.clientHeight * (centerScrollStats.clientHeight / centerScrollStats.scrollHeight)) - 24) + 12}px)`
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      </div>

      {globalPlayerId && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <PlayerModal playerId={globalPlayerId} onClose={() => setGlobalPlayerId(null)} />
          </Suspense>
        </ErrorBoundary>
      )}

      {analysisMatch && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <MatchAnalysisModal match={analysisMatch} onClose={() => setAnalysisMatch(null)} />
          </Suspense>
        </ErrorBoundary>
      )}

      <GlobalTeamModalHandler />
    </div>
  );
}

function GlobalTeamModalHandler() {
  const { selectedTeam, closeTeamModal } = useTeamModal();
  if (!selectedTeam) return null;
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <TeamModal team={selectedTeam} onClose={closeTeamModal} />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function AppWrapper() {
  return (
    <TeamModalProvider>
      <App />
    </TeamModalProvider>
  );
}

function ActivityIcon(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
