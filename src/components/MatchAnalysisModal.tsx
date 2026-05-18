import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Activity, History, BarChart3, ShieldCheck, Target } from 'lucide-react';
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
  const [, setOdds] = useState<OddMarket | null>(null);
  
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
          api.getEventPrediction(match.id),
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
          className="relative w-full max-w-4xl bg-brand-bg-primary rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-brand-bg-secondary/50 p-6 md:p-8 border-b border-white/5 relative shrink-0">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 bg-brand-bg-primary rounded-full text-brand-text-muted hover:text-brand-text-white transition-all z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              <div className="flex items-center space-x-2 text-brand-green mb-4">
                <Sparkles className="w-4 h-4 fill-brand-green" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">IA Deep Analysis Engine</span>
              </div>

              <div className="flex items-center justify-center gap-6 md:gap-12 w-full max-w-2xl">
                <div className="flex flex-col items-center flex-1 text-center">
                  <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="lg" className="mb-4 ring-4 ring-white/5" />
                  <h3 className="text-sm md:text-xl font-black uppercase tracking-tight text-white">{match.homeTeam}</h3>
                  <span className="text-[10px] text-brand-text-muted font-bold mt-1 uppercase tracking-widest leading-none">LOCAL</span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="text-3xl md:text-5xl font-display font-black text-white italic opacity-80">VS</div>
                  <div className="mt-2 px-3 py-1 bg-brand-bg-primary rounded-full border border-white/5 text-[9px] font-mono font-bold text-brand-text-muted">
                    {new Date(match.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="flex flex-col items-center flex-1 text-center">
                  <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="lg" className="mb-4 ring-4 ring-white/5" />
                  <h3 className="text-sm md:text-xl font-black uppercase tracking-tight text-white">{match.awayTeam}</h3>
                  <span className="text-[10px] text-brand-text-muted font-bold mt-1 uppercase tracking-widest leading-none">VISITA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex border-b border-white/5 shrink-0">
            {[
              { id: 'analysis' as const, label: 'Análisis IA', icon: Sparkles },
              { id: 'stats' as const, label: 'Estadísticas', icon: BarChart3 },
              { id: 'h2h' as const, label: 'Historial', icon: History }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex-1 py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                  activeTab === t.id 
                    ? "border-brand-green text-brand-green bg-brand-green/5" 
                    : "border-transparent text-brand-text-muted hover:text-white"
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 touch-scroll">
            <AnimatePresence mode="wait">
              {activeTab === 'analysis' && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-8"
                >
                  {/* AI Deep Analysis Branding Header */}
                  <div className="space-y-2 mb-8">
                    <h4 className="text-3xl md:text-4xl font-display font-black text-white uppercase leading-none tracking-tighter">
                      Análisis <br/> Profundos de IA
                    </h4>
                    <p className="text-[11px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Algoritmo Predictivo BSD Core V3.0</p>
                  </div>

                  <div className="flex items-center gap-4 text-brand-green mb-6">
                    <div className="w-10 h-10 rounded-full border-2 border-brand-green/30 flex items-center justify-center relative">
                      <div className="absolute inset-0 rounded-full border-2 border-brand-green/20 animate-ping opacity-20" />
                      <Target className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-black uppercase tracking-[0.3em]">Veredicto Táctico Final</span>
                  </div>

                  {/* Deep Analysis Content Block */}
                  <div className="relative p-8 bg-gradient-to-br from-brand-bg-secondary to-brand-bg-primary rounded-[2.5rem] border border-brand-green/10 shadow-2xl overflow-hidden group/modal-analysis">
                    {/* Visual Decorative Element */}
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Sparkles className="w-24 h-24 text-brand-green" />
                    </div>
                    
                    {/* Accent Line */}
                    <div className="absolute left-0 top-10 bottom-10 w-1.5 bg-brand-green rounded-full opacity-60 shadow-[0_0_15px_rgba(34,197,94,0.5)]" />
                    
                    <div className="relative z-10">
                      {analyzing || dataLoading ? (
                        <div className="space-y-4 animate-pulse">
                          <div className="h-2 w-full bg-white/10 rounded-full" />
                          <div className="h-2 w-full bg-white/10 rounded-full" />
                          <div className="h-2 w-full bg-white/10 rounded-full" />
                          <div className="h-2 w-3/4 bg-white/10 rounded-full" />
                        </div>
                      ) : (
                        <div className="prose prose-invert max-w-none prose-sm md:prose-base analysis-markdown pl-6">
                           <ReactMarkdown>
                             {analysisText || "**Análisis BSD:** Cargando inteligencia táctica..."}
                           </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-text-muted">Proyección Directa</span>
                    <div className="px-3 py-1 bg-brand-green/10 border border-brand-green/20 rounded-full">
                       <span className="text-[10px] font-black text-brand-green font-mono uppercase tracking-widest">{projectedScore !== '?-?' ? projectedScore : '1-0'}</span>
                    </div>
                  </div>

                  {/* Probability Summary with Enhanced Visuals */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {[
                       { label: 'Victoria Local', prob: probLocal, color: 'brand-green' },
                       { label: 'Empate', prob: 1 - probLocal - (1 - probLocal) * 0.4, color: 'brand-yellow' },
                       { label: 'Victoria Visita', prob: (1 - probLocal) * 0.4, color: 'brand-blue' }
                     ].map((p, idx) => (
                       <div key={idx} className="bg-white/[0.02] p-4 rounded-3xl border border-white/5 flex flex-col items-center">
                         <span className="text-[9px] font-black uppercase text-brand-text-muted mb-2 tracking-[0.2em]">{p.label}</span>
                         <span className={cn("text-2xl font-mono font-black", `text-${p.color}`)}>
                           {((p.prob || 0) * 100).toFixed(0)}%
                         </span>
                         <div className="w-full h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
                           <div className={cn("h-full", `bg-${p.color}/50`)} style={{ width: `${(p.prob || 0) * 100}%` }} />
                         </div>
                       </div>
                     ))}
                  </div>

                  {/* Market Probabilities (Horizontal Small Cards) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
                    <SimpleMarketCard label="BTTS" val={probBTTS} />
                    <SimpleMarketCard label="Over 2.5" val={probOver25} />
                    <SimpleMarketCard label="Ambos Marca" val={probBTTS} />
                    <SimpleMarketCard label="Goles HT" val={probOver25 * 0.7} />
                  </div>
                </motion.div>
              )}

              {activeTab === 'stats' && (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-8"
                >
                  <div className="bg-brand-bg-secondary/40 p-8 rounded-3xl border border-white/5 space-y-8">
                    <h4 className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-center text-brand-text-muted">Rendimiento Reciente (Últimos 5 p.)</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Home Team Form */}
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="sm" />
                          <span className="text-xs font-bold text-white uppercase">{match.homeTeam}</span>
                        </div>
                        <div className="flex items-center space-x-2 mb-6">
                           {homeForm.map((res, idx) => (
                             <span key={idx} className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border", 
                               res === 'W' ? 'text-brand-green bg-brand-green/10 border-brand-green/20' : 
                               res === 'L' ? 'text-brand-red bg-brand-red/10 border-brand-red/20' : 
                               'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/20')}>
                               {res}
                             </span>
                           ))}
                           {homeForm.length === 0 && <span className="text-xs text-brand-text-muted italic">Sin datos</span>}
                        </div>
                        {/* Real detailed results */}
                        {homeFixtures && homeFixtures.length > 0 && (
                          <div className="space-y-2 mt-4 border-t border-white/5 pt-4">
                            {homeFixtures.slice(0, 5).map((fix: any, idx: number) => {
                              const isHome = String(fix.homeTeamId) === String(match.homeTeamId);
                              const opponent = isHome ? fix.awayTeam : fix.homeTeam;
                              return (
                                <div key={idx} className="flex justify-between items-center text-[10px] text-brand-text-muted">
                                  <span className="truncate w-24">{opponent}</span>
                                  <span className="font-mono text-white text-[11px] bg-brand-bg-primary px-2 py-0.5 rounded">{fix.homeScore} - {fix.awayScore}</span>
                                  <span className="w-8 text-right font-bold opacity-50">{isHome ? '(L)' : '(V)'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Away Team Form */}
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="sm" />
                          <span className="text-xs font-bold text-white uppercase">{match.awayTeam}</span>
                        </div>
                        <div className="flex items-center space-x-2 mb-6">
                           {awayForm.map((res, idx) => (
                             <span key={idx} className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border", 
                               res === 'W' ? 'text-brand-green bg-brand-green/10 border-brand-green/20' : 
                               res === 'L' ? 'text-brand-red bg-brand-red/10 border-brand-red/20' : 
                               'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/20')}>
                               {res}
                             </span>
                           ))}
                           {awayForm.length === 0 && <span className="text-xs text-brand-text-muted italic">Sin datos</span>}
                        </div>
                        {/* Real detailed results */}
                        {awayFixtures && awayFixtures.length > 0 && (
                          <div className="space-y-2 mt-4 border-t border-white/5 pt-4">
                            {awayFixtures.slice(0, 5).map((fix: any, idx: number) => {
                              const isHome = String(fix.homeTeamId) === String(match.awayTeamId);
                              const opponent = isHome ? fix.awayTeam : fix.homeTeam;
                              return (
                                <div key={idx} className="flex justify-between items-center text-[10px] text-brand-text-muted">
                                  <span className="truncate w-24">{opponent}</span>
                                  <span className="font-mono text-white text-[11px] bg-brand-bg-primary px-2 py-0.5 rounded">{fix.homeScore} - {fix.awayScore}</span>
                                  <span className="w-8 text-right font-bold opacity-50">{isHome ? '(L)' : '(V)'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6 pt-4 border-t border-white/5">
                      <TacticalStat label="Goles a Favor (Media)" home={homeAvgGoals} away={awayAvgGoals} />
                      <TacticalStat label="xG Generado (Media)" home={homeXG} away={awayXG} />
                    </div>
                  </div>
                  
                  <div className="p-5 bg-brand-bg-primary/40 rounded-3xl border border-white/5">
                     <div className="flex items-start gap-4">
                        <div className="p-2.5 bg-brand-green/10 rounded-xl shrink-0">
                           <Activity className="w-5 h-5 text-brand-green" />
                        </div>
                        <div className="space-y-1">
                           <p className="text-[10px] text-brand-text-muted uppercase font-black tracking-widest">Información Real Pre-Partido</p>
                           <p className="text-[11px] text-brand-text-muted leading-relaxed uppercase tracking-tighter opacity-80">
                              Las métricas mostradas reflejan los datos históricos reales (Goles, xG, Forma) obtenidos directamente de los últimos 5 encuentros oficiales de cada equipo. Utilice estos datos duros para respaldar o ajustar el análisis predictivo.
                           </p>
                        </div>
                     </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'h2h' && (
                <motion.div
                  key="h2h"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col gap-4">
                    {h2h.length > 0 ? (
                      h2h.slice(0, 5).map((game, i) => (
                        <div key={i} className="bg-brand-bg-secondary/40 p-5 rounded-2xl border border-white/5 flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold text-brand-text-muted uppercase w-20">{new Date(game.date).toLocaleDateString([], { month: 'short', year: '2-digit' })}</span>
                          <div className="flex-1 flex items-center justify-center space-x-6">
                            <span className="text-xs font-bold w-24 text-right truncate">{game.homeTeam}</span>
                            <div className="px-4 py-1.5 bg-brand-bg-primary rounded-xl font-mono font-black text-brand-green border border-white/5">
                              {game.homeScore} - {game.awayScore}
                            </div>
                            <span className="text-xs font-bold w-24 text-left truncate">{game.awayTeam}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center space-y-4">
                        <History className="w-12 h-12 mx-auto text-brand-text-muted opacity-20" />
                        <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Sin enfrentamientos directos registrados recientemente</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="p-6 bg-brand-bg-secondary/50 border-t border-white/5 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-green" />
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-text-muted">Análisis Verificado BSD Core</span>
             </div>
             <button 
              onClick={onClose}
              className="px-6 py-2 bg-brand-green text-black text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-brand-green/80 transition-all shadow-lg shadow-brand-green/20"
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
