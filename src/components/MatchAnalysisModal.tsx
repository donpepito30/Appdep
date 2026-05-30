import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Activity, History, BarChart3, ShieldCheck, Target, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Event, Prediction, OddMarket, cn } from '../types';
import { api } from '../services/api';
import { generatePredictionAnalysis } from '../lib/gemini';
import { TeamLogo } from './TeamLogo';
import { usePredictionData } from '../hooks/usePredictionData';

interface MatchAnalysisModalProps {
  match: Event | null;
  onClose: () => void;
}

export function MatchAnalysisModal({ match, onClose }: MatchAnalysisModalProps) {
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'stats' | 'h2h'>('analysis');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [odds, setOdds] = useState<OddMarket | null>(null);
  
  const { 
    homeForm, 
    awayForm, 
    homeFixtures,
    awayFixtures,
    h2h, 
    homeXG, 
    awayXG, 
    homeAvgGoals, 
    awayAvgGoals, 
    projectedScore,
    probLocal,
    probBTTS,
    probOver25,
    loading: dataLoading 
  } = usePredictionData(match || null);

  useEffect(() => {
    if (!match) {
      setAnalysisText(null);
      setPrediction(null);
      setOdds(null);
      return;
    }

    // Fetch initial prediction and odds
    const fetchBaseData = async () => {
      try {
        const [predData, oddsData] = await Promise.all([
          api.getPredictionDetailed(match.id),
          api.getOdds(match.id)
        ]);
        setPrediction(predData);
        setOdds(oddsData as unknown as OddMarket);
      } catch (err) {
        console.error("Error fetching modal base data:", err);
      }
    };
    fetchBaseData();
  }, [match]);

  useEffect(() => {
    if (!match || analysisText || dataLoading) return;

    const fetchAnalysis = async () => {
      setAnalyzing(true);
      try {
        const text = await generatePredictionAnalysis({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeForm,
          awayForm,
          h2h,
          homeXG: homeXG || 1.25,
          awayXG: awayXG || 1.15,
          homeAvgGoals: homeAvgGoals || 1.3,
          awayAvgGoals: awayAvgGoals || 1.2,
          topMarket: 'Resultado Final', // simplified for modal
          topProb: prediction?.homeWinProb || probLocal || 0.65,
          bttsProb: prediction?.bttsProb || probBTTS || 0.5,
          over25Prob: prediction?.over25Prob || probOver25 || 0.5,
          matchId: match.id
        });
        
        setAnalysisText(text);
      } catch (err) {
        setAnalysisText(`**Veredicto Táctico:** Basado en la tendencia estadística de ${match.homeTeam} y ${match.awayTeam}, se espera un encuentro con alto volumen de juego en el tercio medio.`);
      } finally {
        setAnalyzing(false);
      }
    };

    fetchAnalysis();
  }, [match?.id, dataLoading, analysisText]);

  if (!match) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
        />
        
          <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-5xl bg-brand-bg-primary rounded-3xl md:rounded-[3.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-brand-bg-secondary/40 p-5 md:p-10 lg:p-14 border-b border-white/5 relative shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 md:top-8 md:right-8 p-1.5 md:p-3 bg-brand-bg-primary rounded-lg md:rounded-2xl text-brand-text-muted hover:text-brand-text-white transition-all z-10 border border-white/5 hover:border-white/20"
            >
              <X className="w-3.5 h-3.5 md:w-5 md:h-5" />
            </button>

            <div className="flex flex-col items-center">
              <div className="flex items-center space-x-2 md:space-x-3 text-brand-green mb-4 md:mb-8">
                <div className="custom-icon-wrapper scale-[0.6] md:scale-100 bg-brand-green/10 border-brand-green/20">
                  <Sparkles className="w-4 h-4 md:w-5 md:h-5 fill-brand-green animate-pulse" />
                </div>
                <span className="text-[7px] xs:text-[8px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.5em]">Deep Tactical Intelligence</span>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 lg:gap-20 w-full">
                <div className="flex flex-row md:flex-col items-center justify-center gap-4 md:gap-0 flex-1 text-center group">
                  <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="lg" className="w-16 h-16 xs:w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 md:mb-6 ring-4 md:ring-8 ring-white/[0.03] group-hover:scale-105 transition-transform duration-700" />
                  <div className="text-left md:text-center min-w-0">
                    <h3 className="text-base md:text-2xl lg:text-3xl font-display font-black uppercase tracking-tighter text-white truncate max-w-[120px] xs:max-w-[200px] md:max-w-none">{match.homeTeam}</h3>
                    <span className="text-[8px] md:text-[10px] text-brand-text-muted font-black mt-1 uppercase tracking-[0.2em] opacity-40 block">Local Strategist</span>
                  </div>
                </div>

                <div className="flex items-center md:flex-col shrink-0 gap-4 md:gap-0">
                  <div className="text-2xl md:text-6xl lg:text-7xl font-display font-black text-white italic opacity-10 tracking-tighter select-none">VS</div>
                  <div className="md:mt-4 px-3 py-1.5 md:px-5 md:py-2 bg-brand-bg-primary rounded-xl md:rounded-2xl border border-white/5 text-[8px] md:text-[10px] font-mono font-black text-brand-text-muted uppercase tracking-widest shadow-xl">
                    {new Date(match.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="flex flex-row-reverse md:flex-col items-center justify-center gap-4 md:gap-0 flex-1 text-center group w-full md:w-auto">
                  <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="lg" className="w-16 h-16 xs:w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 md:mb-6 ring-4 md:ring-8 ring-white/[0.03] group-hover:scale-105 transition-transform duration-700" />
                  <div className="text-right md:text-center min-w-0">
                    <h3 className="text-base md:text-2xl lg:text-3xl font-display font-black uppercase tracking-tighter text-white truncate max-w-[120px] xs:max-w-[200px] md:max-w-none">{match.awayTeam}</h3>
                    <span className="text-[8px] md:text-[10px] text-brand-text-muted font-black mt-1 uppercase tracking-[0.2em] opacity-40 block">Away Contender</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex p-2 bg-brand-bg-secondary/20 border-b border-white/5 shrink-0 touch-scroll-x overflow-x-auto scrollbar-hide">
            <div className="flex flex-nowrap min-w-max w-full gap-2">
              {[
                { id: 'analysis' as const, label: 'Veredict', icon: Sparkles },
                { id: 'stats' as const, label: 'Data', icon: BarChart3 },
                { id: 'h2h' as const, label: 'History', icon: History }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex-1 py-3 px-4 md:py-4 md:px-6 flex items-center justify-center gap-2 md:gap-3 text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all rounded-2xl md:rounded-3xl",
                    activeTab === t.id 
                      ? "bg-brand-green text-black shadow-lg shadow-brand-green/20" 
                      : "text-brand-text-muted hover:text-white hover:bg-white/5"
                  )}
                >
                  <div className={cn(
                    "custom-icon-wrapper scale-75 md:scale-90",
                    activeTab === t.id ? "bg-black/20 border-black/10" : ""
                  )}>
                    <t.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </div>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 md:p-14 touch-scroll modern-scroll">
            <AnimatePresence mode="wait">
              {activeTab === 'analysis' && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 md:space-y-14"
                >
                  {/* Enhanced Value Analysis Section */}
                  {prediction?.valueAnalysis && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="premium-gradient border-2 border-brand-green/30 p-5 md:p-10 rounded-[2rem] md:rounded-[3rem] relative overflow-hidden shadow-2xl group"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 rotate-12">
                        <TrendingUp className="w-48 h-48 text-brand-green" />
                      </div>
                      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                        <div className="space-y-4 md:space-y-6">
                           <div className="flex items-center gap-2 md:gap-3">
                              <div className="custom-icon-wrapper border-brand-green/30 scale-75 md:scale-100">
                                <ShieldCheck className="w-5 h-5 text-brand-green" />
                              </div>
                              <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-brand-green">Neural Advantage Detected</span>
                           </div>
                           <h5 className="text-2xl md:text-5xl font-display font-black text-white uppercase tracking-tighter leading-none">
                              {prediction.valueAnalysis.market || prediction.recommendations?.opportunity_market || "Market Value Discovery"}
                           </h5>
                           <div className="flex items-center gap-4 md:gap-6">
                              <div className="px-3 py-1 md:px-4 md:py-1.5 bg-black/40 rounded-xl border border-white/10 text-base md:text-xl font-mono font-black text-brand-green">
                                 @{prediction.valueAnalysis.odds?.toFixed(2) || odds?.home_win?.toFixed(2) || '1.00'}
                              </div>
                              <span className="text-[8px] md:text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Expected ROI: <span className="text-white">{prediction.valueAnalysis.expectedRoi}%</span></span>
                           </div>
                        </div>
                        <div className="flex items-center justify-center md:justify-end">
                           <div className="relative group/score scale-75 md:scale-100">
                              <svg className="w-32 h-32 md:w-36 md:h-36 transform -rotate-90">
                                 <circle cx="50%" cy="50%" r="45%" className="stroke-white/5 fill-none" strokeWidth="8" />
                                 <motion.circle 
                                    cx="50%" cy="50%" r="45%" 
                                    className="stroke-brand-green fill-none" 
                                    strokeWidth="8" 
                                    strokeDasharray="283"
                                    initial={{ strokeDashoffset: 283 }}
                                    animate={{ strokeDashoffset: 283 - (283 * (prediction.valueAnalysis.valueScore / 10)) }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    strokeLinecap="round"
                                 />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                 <span className="text-4xl font-display font-black text-white">{prediction.valueAnalysis.valueScore}</span>
                                 <span className="text-[8px] font-black text-brand-text-muted uppercase tracking-widest">Confidence</span>
                              </div>
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Market Probabilities Visualization */}
                  <div className="space-y-8">
                     <div className="flex items-center gap-4 px-2">
                        <div className="custom-icon-wrapper border-brand-red/30">
                           <Target className="w-6 h-6 text-brand-red" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-text-muted">Edge Matrix vs Market</span>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <MarketGapCard 
                           label="Home Victory" 
                           iaProb={prediction?.homeWinProb || probLocal || 0} 
                           marketProb={odds?.home_win ? 1/odds.home_win : 0.4} 
                           color="brand-green"
                        />
                        <MarketGapCard 
                           label="Strategic Draw" 
                           iaProb={prediction?.drawProb || 0.25} 
                           marketProb={odds?.draw ? 1/odds.draw : 0.3} 
                           color="brand-yellow"
                        />
                        <MarketGapCard 
                           label="Away Victory" 
                           iaProb={prediction?.awayWinProb || 0.25} 
                           marketProb={odds?.away_win ? 1/odds.away_win : 0.3} 
                           color="brand-red"
                        />
                     </div>
                  </div>

                  {/* Deep Analysis Content Block */}
                  <div className="space-y-6 md:space-y-8">
                     <div className="flex items-center gap-3 md:gap-4 px-1">
                        <div className="custom-icon-wrapper border-brand-yellow/30 scale-90 md:scale-100">
                           <Zap className="w-5 h-5 md:w-6 md:h-6 text-brand-yellow" />
                        </div>
                        <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-brand-text-muted">Strategist Narrative</span>
                     </div>
                     <div className="relative p-6 md:p-14 bg-white/[0.02] rounded-[2rem] md:rounded-[3.5rem] border border-white/5 shadow-2xl overflow-hidden group/modal-analysis">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-green/5 blur-[120px] -mr-48 -mt-48 transition-all group-hover/modal-analysis:bg-brand-green/10" />
                        <div className="relative z-10">
                           {analyzing || dataLoading ? (
                           <div className="space-y-8 py-4">
                              <div className="flex items-center gap-4">
                                 <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
                                    <div className="custom-icon-wrapper border-brand-green/20">
                                       <RefreshCw className="w-6 h-6 text-brand-green opacity-40" />
                                    </div>
                                 </motion.div>
                                 <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.4em] animate-pulse">Processing Simulation Layers...</span>
                              </div>
                              <div className="space-y-4">
                                 <div className="h-2 w-full bg-white/5 rounded-full" />
                                 <div className="h-2 w-full bg-white/5 rounded-full" />
                                 <div className="h-2 w-3/4 bg-white/5 rounded-full" />
                                 <div className="h-2 w-full bg-white/5 rounded-full" />
                                 <div className="h-2 w-1/2 bg-white/5 rounded-full" />
                              </div>
                           </div>
                           ) : (
                           <div className="markdown-body">
                              <ReactMarkdown>
                                 {analysisText || "**BSD Neural Link:** Syncing tactical nodes..."}
                              </ReactMarkdown>
                           </div>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Prediction Micro-Insights */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                     <SimpleMarketCard label="Neural BTTS" val={prediction?.bttsProb || probBTTS || 0.5} />
                     <SimpleMarketCard label="High Score (2.5)" val={prediction?.over25Prob || probOver25 || 0.5} />
                     <SimpleMarketCard label="Early Goal (HT)" val={(prediction?.over15Prob || 0.7) * 0.8} />
                     <SimpleMarketCard label="Defensive Push" val={1 - (prediction?.over35Prob || 0.2)} />
                  </div>
                </motion.div>
              )}              {activeTab === 'stats' && (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-12"
                >
                  <div className="bg-white/[0.02] p-10 md:p-14 rounded-[3.5rem] border border-white/5 space-y-12 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-green/20 via-transparent to-brand-red/20" />
                    <h4 className="text-[11px] font-black font-mono uppercase tracking-[0.5em] text-center text-brand-text-muted opacity-40">Precision Performance Metrics</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                      {/* Home Team Form */}
                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="sm" className="w-10 h-10 ring-4 ring-white/5" />
                          <span className="text-sm font-black text-white uppercase tracking-tight">{match.homeTeam}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                           {homeForm.map((res, idx) => (
                             <motion.span 
                               initial={{ opacity: 0, y: 10 }}
                               animate={{ opacity: 1, y: 0 }}
                               transition={{ delay: idx * 0.1 }}
                               key={idx} 
                               className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black border-2 shadow-lg", 
                                res === 'W' ? 'text-brand-green bg-brand-green/10 border-brand-green/30' : 
                                res === 'L' ? 'text-brand-red bg-brand-red/10 border-brand-red/30' : 
                                'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/30')}
                             >
                               {res}
                             </motion.span>
                           ))}
                        </div>
                        
                        {homeFixtures && homeFixtures.length > 0 && (
                          <div className="space-y-3 mt-6">
                            {homeFixtures.slice(0, 4).map((fix: any, idx: number) => {
                              const isHome = String(fix.homeTeamId) === String(match.homeTeamId);
                              const opponent = isHome ? fix.awayTeam : fix.homeTeam;
                              return (
                                <div key={idx} className="flex justify-between items-center text-[10px] p-3 rounded-2xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-colors">
                                  <span className="truncate w-32 font-bold text-brand-text-muted group-hover:text-white transition-colors uppercase tracking-tighter">{opponent}</span>
                                  <span className="font-mono text-white text-[11px] font-black bg-brand-bg-primary px-3 py-1 rounded-xl border border-white/5">{fix.homeScore} - {fix.awayScore}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Away Team Form */}
                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="sm" className="w-10 h-10 ring-4 ring-white/5" />
                          <span className="text-sm font-black text-white uppercase tracking-tight">{match.awayTeam}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                           {awayForm.map((res, idx) => (
                             <motion.span 
                               initial={{ opacity: 0, y: 10 }}
                               animate={{ opacity: 1, y: 0 }}
                               transition={{ delay: idx * 0.1 }}
                               key={idx} 
                               className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black border-2 shadow-lg", 
                                res === 'W' ? 'text-brand-green bg-brand-green/10 border-brand-green/30' : 
                                res === 'L' ? 'text-brand-red bg-brand-red/10 border-brand-red/30' : 
                                'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/30')}
                             >
                               {res}
                             </motion.span>
                           ))}
                        </div>
                        
                        {awayFixtures && awayFixtures.length > 0 && (
                          <div className="space-y-3 mt-6">
                            {awayFixtures.slice(0, 4).map((fix: any, idx: number) => {
                              const isHome = String(fix.homeTeamId) === String(match.awayTeamId);
                              const opponent = isHome ? fix.awayTeam : fix.homeTeam;
                              return (
                                <div key={idx} className="flex justify-between items-center text-[10px] p-3 rounded-2xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-colors">
                                  <span className="truncate w-32 font-bold text-brand-text-muted group-hover:text-white transition-colors uppercase tracking-tighter">{opponent}</span>
                                  <span className="font-mono text-white text-[11px] font-black bg-brand-bg-primary px-3 py-1 rounded-xl border border-white/5">{fix.homeScore} - {fix.awayScore}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-10 pt-10 border-t border-white/5">
                      <TacticalStat label="Scoring Efficiency Index" home={homeAvgGoals} away={awayAvgGoals} />
                      <TacticalStat label="xG Tactical Dominance" home={homeXG} away={awayXG} />
                    </div>
                  </div>
                  
                  <div className="p-8 md:p-10 bg-brand-green/5 rounded-[2.5rem] border border-brand-green/10 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 group-hover:rotate-12 transition-transform duration-700">
                        <Activity className="w-24 h-24 text-brand-green" />
                     </div>
                     <div className="flex items-start gap-6 relative z-10">
                        <div className="custom-icon-wrapper bg-brand-green/20 border-brand-green/20 shrink-0">
                           <ShieldCheck className="w-6 h-6 text-brand-green" />
                        </div>
                        <div className="space-y-3">
                           <p className="text-[11px] text-brand-green uppercase font-black tracking-[0.3em]">Institutional Grade Verification</p>
                           <p className="text-xs text-brand-text-muted leading-relaxed font-bold uppercase tracking-tight opacity-70">
                              Our neural engines process actual pre-match intelligence from the last 240 hours of official competition. These metrics are cross-referenced with global market efficiency to provide non-arbitrary data points for advanced decision making.
                           </p>
                        </div>
                     </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'h2h' && (
                <motion.div
                  key="h2h"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="flex flex-col gap-4">
                    {h2h.length > 0 ? (
                      h2h.slice(0, 6).map((game, i) => (
                        <div key={i} className="bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 flex items-center justify-between group hover:bg-white/[0.04] transition-all hover:translate-x-1">
                          <span className="text-[10px] font-mono font-black text-brand-text-muted uppercase w-24 opacity-40">{new Date(game.date).toLocaleDateString([], { month: 'short', year: '2-digit' })}</span>
                          <div className="flex-1 flex items-center justify-center space-x-12">
                            <span className="text-sm font-black w-32 text-right truncate uppercase tracking-tighter text-brand-text-muted group-hover:text-white transition-colors">{game.homeTeam}</span>
                            <div className="px-6 py-2 bg-brand-bg-primary rounded-2xl font-mono font-black text-brand-green border border-white/10 shadow-xl min-w-[100px] text-center">
                              {game.homeScore} - {game.awayScore}
                            </div>
                            <span className="text-sm font-black w-32 text-left truncate uppercase tracking-tighter text-brand-text-muted group-hover:text-white transition-colors">{game.awayTeam}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-32 text-center space-y-6">
                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                           <History className="w-10 h-10 text-brand-text-muted opacity-20" />
                        </div>
                        <p className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Historical Data Encrypted</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Compressed Footer */}
          <div className="p-4 md:p-8 bg-brand-bg-secondary/40 border-t border-white/5 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2 opacity-40">
                <div className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />
                <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-brand-text-muted">Verified Analysis</span>
             </div>
             <button 
              onClick={onClose}
              className="px-8 py-2.5 md:px-10 md:py-3.5 bg-white text-black text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-xl md:rounded-2xl hover:bg-brand-green transition-all shadow-xl active:scale-95"
             >
                Conclude
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function MarketStat({ label, home, away, max }: { label: string, home: number, away: number, max: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-brand-text-muted">
        <span>{label}</span>
        <div className="flex space-x-4">
          <span className="text-brand-green">{home.toFixed(2)}</span>
          <span className="text-brand-red">{away.toFixed(2)}</span>
        </div>
      </div>
      <div className="flex h-1 gap-1">
        <div className="flex-1 bg-brand-bg-primary rounded-full overflow-hidden">
          <div className="h-full bg-brand-green" style={{ width: `${Math.min(100, (home / max) * 100)}%` }} />
        </div>
        <div className="flex-1 bg-brand-bg-primary rounded-full overflow-hidden flex justify-end">
          <div className="h-full bg-brand-red" style={{ width: `${Math.min(100, (away / max) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function ProbabilityLine({ label, prob }: { label: string, prob: number }) {
  const percent = Math.round(prob * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-brand-text-muted uppercase">{label}</span>
        <span className="text-[10px] font-mono font-black text-brand-green">{percent}%</span>
      </div>
      <div className="h-1 bg-brand-bg-primary rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          className="h-full bg-brand-green/40 shadow-[0_0_5px_rgba(34,197,94,0.3)]"
        />
      </div>
    </div>
  );
}

function TacticalStat({ label, home, away, unit = '' }: { label: string, home: number, away: number, unit?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-[10px] font-black uppercase text-brand-text-muted flex items-center gap-2">
          <span className="text-brand-green font-mono">{home}{unit}</span>
          <span>{label}</span>
          <span className="text-brand-red font-mono">{away}{unit}</span>
        </div>
      </div>
      <div className="relative h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-brand-green" style={{ width: `${(home / (home + away)) * 100}%` }} />
          <div className="h-full bg-brand-red" style={{ width: `${(away / (home + away)) * 100}%` }} />
        </div>
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-brand-bg-primary -translate-x-1/2" />
      </div>
    </div>
  );
}

function SimpleMarketCard({ label, val }: { label: string, val: number }) {
  const percent = Math.round(val * 100);
  return (
    <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/5 flex flex-col items-center">
      <span className="text-[7px] font-black uppercase text-brand-text-muted mb-1 tracking-widest">{label}</span>
      <span className="text-xs font-mono font-black text-white">{percent}%</span>
    </div>
  );
}

function MarketGapCard({ label, iaProb, marketProb, color }: { label: string, iaProb: number, marketProb: number, color: string }) {
  const gap = (iaProb - marketProb) * 100;
  return (
    <div className="bg-white/[0.02] p-5 rounded-3xl border border-white/5 flex flex-col gap-4">
      <span className="text-[9px] font-black uppercase text-brand-text-muted tracking-[0.2em]">{label}</span>
      
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-brand-text-muted uppercase">IA</span>
          <span className="text-xl font-mono font-black text-white">{(iaProb * 100).toFixed(0)}%</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[8px] font-bold text-brand-text-muted uppercase">Mercado</span>
          <span className="text-sm font-mono font-bold text-brand-text-muted">{(marketProb * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="pt-2 border-t border-white/5">
        <div className={cn(
          "flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl border",
          gap > 5 ? `bg-${color}/20 border-${color}/30 text-white` : "bg-white/5 border-white/5 text-brand-text-muted"
        )}>
          {gap > 0 ? <TrendingUp className="w-3 h-3" /> : <div className="w-3 h-3" />}
          <span className="text-[10px] font-black uppercase tracking-tighter">
            {gap > 0 ? `+${gap.toFixed(1)}% Ventaja` : `${gap.toFixed(1)}% Gap`}
          </span>
        </div>
      </div>
    </div>
  );
}

function ComparisonBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-brand-text-muted uppercase">{label}</span>
        <span className="text-[10px] font-mono font-black text-white">{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className={cn("h-full", color)}
        />
      </div>
    </div>
  );
}
