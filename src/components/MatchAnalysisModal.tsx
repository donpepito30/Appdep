import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Activity, History, BarChart3, ShieldCheck, Target, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Event, Prediction, OddMarket, cn } from '../types';
import { api } from '../services/api';
import { generatePredictionAnalysis } from '../lib/gemini';
import { TeamLogo } from './TeamLogo';
import { usePredictionData } from '../hooks/usePredictionData';
import { calcularBTTSPropio, alignScorelineWithProbabilities } from '../lib/prediction';

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

  // User's custom BTTS formula calculation
  const bttsCount = h2h?.filter((h: any) => Number(h.homeScore) > 0 && Number(h.awayScore) > 0).length || 0;
  const bttsPorcentaje = h2h?.length > 0 ? (bttsCount / h2h.length) * 100 : 50;

  const customBttsVal = (() => {
    const xgLocal = homeXG > 0 ? homeXG : (match?.xgHome || 1.35);
    const xgVisitante = awayXG > 0 ? awayXG : (match?.xgAway || 1.25);
    const overProb = (prediction?.over25Prob || probOver25 || 0.5) * 100;
    return calcularBTTSPropio(xgLocal, xgVisitante, overProb, { bttsPorcentaje }) / 100;
  })();

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
        const hp = prediction?.homeWinProb || probLocal || 0.65;
        const dp = prediction?.drawProb || 0.25;
        const ap = prediction?.awayWinProb || Math.max(0.05, 1 - hp - dp);
        const rawScore = prediction?.scoreline || (projectedScore !== '?-?' ? projectedScore : "1-1");
        const alignedScore = alignScorelineWithProbabilities(rawScore, hp, dp, ap);

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
          topProb: hp,
          bttsProb: prediction?.bttsProb || probBTTS || 0.5,
          over25Prob: prediction?.over25Prob || probOver25 || 0.5,
          matchId: match.id,
          projectedScore: alignedScore
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
          className="relative w-full max-w-5xl bg-brand-bg-primary rounded-[2.5rem] md:rounded-[3.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
        >
          {/* Main Content Area (Unified scrollable container) */}
          <div className="flex-1 overflow-y-auto modern-scroll touch-scroll">
            
            {/* Header Card Section */}
            <div className="p-4 md:p-8 lg:p-10 relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 md:top-6 md:right-6 p-2 md:p-2.5 bg-brand-bg-secondary/80 backdrop-blur-md rounded-xl md:rounded-2xl text-brand-text-muted hover:text-brand-text-white transition-all z-20 border border-white/10 hover:border-brand-green/30"
              >
                <X className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              {/* Match Identity Card */}
              <div className="glass-card bg-brand-bg-secondary/30 border border-white/5 rounded-[2.5rem] p-8 md:p-12 mb-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-green/5 blur-[100px] -mr-32 -mt-32" />
                
                <div className="flex flex-col items-center relative z-10">
                  <div className="flex items-center space-x-3 text-brand-green mb-10">
                    <div className="custom-icon-wrapper scale-90 bg-brand-green/10 border-brand-green/20">
                      <Sparkles className="w-5 h-5 fill-brand-green animate-pulse" />
                    </div>
                    <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em]">Inteligencia Táctica Profunda</span>
                  </div>

                  <div className="flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20 w-full max-w-4xl">
                    <div className="flex flex-col items-center flex-1 text-center group/team">
                      <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="xl" className="mb-6 ring-8 ring-white/[0.03] group-hover/team:scale-105 transition-transform duration-700 shadow-2xl" />
                      <h3 className="text-2xl md:text-4xl font-display font-black uppercase tracking-tighter text-white">{match.homeTeam}</h3>
                      <span className="text-[10px] text-brand-text-muted font-black mt-2 uppercase tracking-[0.2em] opacity-40">Estratega Local</span>
                    </div>

                    <div className="flex flex-col items-center justify-center shrink-0">
                      <div className="text-4xl md:text-7xl font-display font-black text-white italic opacity-5 tracking-tighter select-none mb-4">VS</div>
                      <div className="px-5 py-2 bg-brand-bg-primary/50 backdrop-blur-xl rounded-2xl border border-white/10 text-[10px] font-mono font-black text-brand-green uppercase tracking-widest shadow-2xl">
                        {new Date(match.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div className="flex flex-col items-center flex-1 text-center group/team">
                      <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="xl" className="mb-6 ring-8 ring-white/[0.03] group-hover/team:scale-105 transition-transform duration-700 shadow-2xl" />
                      <h3 className="text-2xl md:text-4xl font-display font-black uppercase tracking-tighter text-white">{match.awayTeam}</h3>
                      <span className="text-[10px] text-brand-text-muted font-black mt-2 uppercase tracking-[0.2em] opacity-40">Contendiente Visitante</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Cards Grid */}
              <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-10">
                {[
                  { id: 'analysis' as const, label: 'Neuronal', icon: Sparkles, desc: 'Veredicto' },
                  { id: 'stats' as const, label: 'Rendimiento', icon: BarChart3, desc: 'Datos' },
                  { id: 'h2h' as const, label: 'Historial', icon: History, desc: 'Flujo h2h' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "flex flex-col items-center md:items-start p-3 md:p-6 rounded-2xl md:rounded-[2rem] border transition-all duration-300 group/nav",
                      activeTab === t.id 
                        ? "bg-brand-green border-brand-green shadow-xl shadow-brand-green/20" 
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/20"
                    )}
                  >
                    <div className={cn(
                      "custom-icon-wrapper scale-75 md:scale-100 mb-2 md:mb-4 transition-transform group-hover/nav:scale-110",
                      activeTab === t.id ? "bg-black/20 border-black/10" : "bg-white/5 border-white/10"
                    )}>
                      <t.icon className={cn("w-4 h-4 md:w-5 md:h-5", activeTab === t.id ? "text-black" : "text-brand-green")} />
                    </div>
                    <div className="text-center md:text-left">
                      <span className={cn(
                        "text-[8px] md:text-[11px] font-black uppercase tracking-widest block leading-tight",
                        activeTab === t.id ? "text-black" : "text-white"
                      )}>{t.label}</span>
                      <span className={cn(
                        "text-[7px] md:text-[9px] font-bold uppercase tracking-tight hidden xs:block",
                        activeTab === t.id ? "text-black/60" : "text-brand-text-muted"
                      )}>{t.desc}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* View Content Card */}
              <div className="glass-card bg-white/[0.01] border border-white/5 rounded-[2.5rem] p-6 md:p-12 min-h-[400px]">
                <AnimatePresence mode="wait">
                  {activeTab === 'analysis' && (
                    <motion.div
                      key="analysis"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-10"
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
                                  <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-brand-green">Ventaja Neuronal Detectada</span>
                               </div>
                               <h5 className="text-2xl md:text-5xl font-display font-black text-white uppercase tracking-tighter leading-none">
                                  {prediction.valueAnalysis.market || prediction.recommendations?.opportunity_market || "Oportunidad de Valor de Mercado"}
                               </h5>
                               <div className="flex items-center gap-4 md:gap-6">
                                  <div className="px-3 py-1 md:px-4 md:py-1.5 bg-black/40 rounded-xl border border-white/10 text-base md:text-xl font-mono font-black text-brand-green">
                                     @{prediction.valueAnalysis.odds?.toFixed(2) || odds?.home_win?.toFixed(2) || '1.00'}
                                  </div>
                                  <span className="text-[8px] md:text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Retorno (ROI) Esperado: <span className="text-white">{prediction.valueAnalysis.expectedRoi}%</span></span>
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
                                     <span className="text-[8px] font-black text-brand-text-muted uppercase tracking-widest">Confianza</span>
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
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-text-muted">Matriz de Ventaja vs Mercado</span>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <MarketGapCard 
                           label="Victoria Local" 
                           iaProb={prediction?.homeWinProb || probLocal || 0} 
                           marketProb={odds?.home_win ? 1/odds.home_win : 0.4} 
                           color="brand-green"
                        />
                        <MarketGapCard 
                           label="Empate Estratégico" 
                           iaProb={prediction?.drawProb || 0.25} 
                           marketProb={odds?.draw ? 1/odds.draw : 0.3} 
                           color="brand-yellow"
                        />
                        <MarketGapCard 
                           label="Victoria Visitante" 
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
                        <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-brand-text-muted">Narrativa del Estratega</span>
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
                                 <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.4em] animate-pulse">Procesando Capas de Simulación...</span>
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
                           <div className="markdown-body text-center w-full px-4">
                              <ReactMarkdown>
                                 {analysisText || "**Enlace Neuronal BSD:** Sincronizando nodos tácticos..."}
                              </ReactMarkdown>
                           </div>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Prediction Micro-Insights */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                     <SimpleMarketCard label="Ambos Marcan Neuronal" val={prediction?.bttsProb || probBTTS || 0.5} />
                     <SimpleMarketCard label="BTTS Propio 🧪" val={customBttsVal} />
                     <SimpleMarketCard label="Más de 2.5 Goles" val={prediction?.over25Prob || probOver25 || 0.5} />
                     <SimpleMarketCard label="Gol Temprano (1T)" val={(prediction?.over15Prob || 0.7) * 0.8} />
                     <SimpleMarketCard label="Impulso Defensivo" val={1 - (prediction?.over35Prob || 0.2)} />
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
                    <h4 className="text-[11px] font-black font-mono uppercase tracking-[0.5em] text-center text-brand-text-muted opacity-40">Métricas de Rendimiento de Precisión</h4>
                    
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
                      <TacticalStat label="Índice de Eficiencia de Goleo" home={homeAvgGoals} away={awayAvgGoals} />
                      <TacticalStat label="Dominio Táctico de xG" home={homeXG} away={awayXG} />
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
                           <p className="text-[11px] text-brand-green uppercase font-black tracking-[0.3em]">Verificación de Grado Institucional</p>
                           <p className="text-xs text-brand-text-muted leading-relaxed font-bold uppercase tracking-tight opacity-70">
                              Nuestros motores de simulación neuronal analizan la inteligencia previa al partido acumulada durante las últimas 240 horas de competición oficial. Estas métricas se cruzan de modo sistemático con la eficiencia del mercado global para proveer ventajas estadísticas reales.
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
                        <p className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Sin Datos Históricos Recientes</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

            </div> {/* Closing Header Card Section (p-4 md:p-8) */}
          </div> {/* Closing Main Content Area (Unified scrollable container) */}

          {/* Compressed Footer (NOW FIXED AT BOTTOM) */}
          <div className="p-4 md:p-8 bg-brand-bg-secondary/60 backdrop-blur-xl border-t border-white/5 flex items-center justify-between shrink-0 relative z-30">
             <div className="flex items-center gap-2 opacity-40">
                <div className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />
                <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-brand-text-muted">Análisis Verificado</span>
             </div>
             <button 
              onClick={onClose}
              className="px-8 py-2.5 md:px-10 md:py-3.5 bg-white text-black text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-xl md:rounded-2xl hover:bg-brand-green transition-all shadow-xl active:scale-95"
             >
                Cerrar
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
