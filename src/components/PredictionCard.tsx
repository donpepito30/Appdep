import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Star, Sparkles, AlertCircle, ChevronDown, ChevronUp, TrendingUp, History, Activity, ExternalLink, Target } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Event, Prediction, cn } from '../types';
import { usePredictionData } from '../hooks/usePredictionData';
import { generatePredictionAnalysis } from '../lib/gemini';
import { TeamLogo } from './TeamLogo';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface PredictionCardProps {
  match: Event;
  prediction?: Prediction;
  topMarket: string;
  topProb: number;
  bttsProb: number;
  over25Prob: number;
  onSelect?: (id: string) => void;
  featured?: boolean;
}

export function PredictionCard({ match, prediction, topMarket, topProb, bttsProb, over25Prob, onSelect, featured = false }: PredictionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const entry = useIntersectionObserver(cardRef, { threshold: 0.1 });
  const isVisible = !!entry?.isIntersecting;

  const { homeForm, awayForm, h2h, homeXG, awayXG, homeAvgGoals, awayAvgGoals, projectedScore, probLocal, probBTTS, probOver25, loading: dataLoading } = usePredictionData(match, isVisible || featured);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(featured);

  // Prioritize passed props (V2/ML) over heuristic calculations from usePredictionData
  const finalTopProb = topProb > 0.1 ? topProb : probLocal;
  const finalBTTSProb = bttsProb > 0 ? bttsProb : probBTTS;
  const finalOverProb = over25Prob > 0 ? over25Prob : probOver25;
  const finalMarket = finalTopProb > 0.5 ? 'Local' : finalBTTSProb > 0.6 ? 'Ambos Marcan' : topMarket;

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
          matchId: match.id
        });
        
        setAnalysisText(text);
      } catch (err) {
        setAnalysisText(`### 🤖 PROYECCIÓN IA BSD (OFFLINE)
**Contexto Táctico:** Basado en la forma reciente (${homeForm.join('')}), se proyecta un encuentro donde ${match.homeTeam} buscará imponer condiciones desde la posesión.`);
      } finally {
        setAnalyzing(false);
      }
    };

    fetchAnalysis();
  }, [isVisible, dataLoading, match.id, finalMarket]);

  const isFrozen = !!match.id && !!localStorage.getItem(`bsd_analysis_v3_${match.id}`);

  const getConfidenceStars = (prob: number) => {
    if (prob > 0.8) return 3;
    if (prob > 0.65) return 2;
    return 1;
  };

  const getAiSummarySnippet = () => {
    if (!analysisText) return "Sincronizando análisis táctico de profundidad...";
    
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
        "bg-brand-bg-secondary/40 backdrop-blur-xl rounded-[2rem] border p-6 hover:border-brand-green/30 transition-all group overflow-hidden relative flex flex-col cursor-pointer",
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
             <span className="text-[7.5px] font-black text-brand-yellow uppercase tracking-[0.3em]">AI BANKER SELECTION</span>
           </div>
        </div>
      )}

      {/* Freeze Indicator Badge */}
      {isFrozen && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 bg-brand-green/20 border-x border-b border-brand-green/30 rounded-b-2xl z-20 backdrop-blur-md">
           <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
           <span className="text-[7.5px] font-black text-brand-green uppercase tracking-[0.3em]">BSD-ENTROPY V3 LOCKED</span>
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
        <div className="flex items-center justify-between gap-4 mb-6 relative">
          <div className="flex flex-col items-center flex-1 max-w-[40%]">
            <TeamLogo name={match.homeTeam} logoUrl={match.homeLogo} size="lg" className="mb-3 ring-4 ring-white/[0.03] shadow-2xl group-hover:scale-105 transition-transform" />
            <span className="text-xs font-black text-center line-clamp-1 uppercase tracking-tight">{match.homeTeam}</span>
          </div>
          
          <div className="flex flex-col items-center justify-center">
            <div className="text-2xl font-black font-display text-brand-text-white/40 tracking-tighter mb-1 select-none">
              {prediction?.scoreline || (projectedScore !== '?-?' ? projectedScore : "1-0")}
            </div>
            <div className="px-2 py-0.5 rounded-full bg-brand-green/10 border border-brand-green/20">
              <span className="text-[7px] font-black text-brand-green uppercase tracking-[0.2em]">PROYECTO</span>
            </div>
          </div>

          <div className="flex flex-col items-center flex-1 max-w-[40%]">
            <TeamLogo name={match.awayTeam} logoUrl={match.awayLogo} size="lg" className="mb-3 ring-4 ring-white/[0.03] shadow-2xl group-hover:scale-105 transition-transform" />
            <span className="text-xs font-black text-center line-clamp-1 uppercase tracking-tight">{match.awayTeam}</span>
          </div>
        </div>

        {/* Integrated AI Logic Arguments (Mini summary) */}
        <div className="mb-4 flex items-start gap-2 bg-black/20 p-3 rounded-2xl border border-white/5 group-hover:border-brand-green/10 transition-colors">
          <AlertCircle className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
          <div className="text-[10px] leading-relaxed text-brand-text-muted italic line-clamp-2">
            {dataLoading || analyzing ? "Optimizando argumentos tácticos..." : getAiSummarySnippet()}
          </div>
        </div>

        {/* Market & Probability */}
        <div className="bg-brand-bg-primary/50 p-4 rounded-2xl border border-white/5 mb-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 flex">
            {prediction?.recommendations?.value_detected && (
              <div className="py-0.5 px-2 bg-brand-yellow/20 border-l border-b border-brand-yellow/30 rounded-bl-lg animate-pulse shadow-[0_0_15px_rgba(238,152,0,0.3)]">
                <span className="text-[7px] font-black text-brand-yellow tracking-widest uppercase">Oportunidad de Valor</span>
              </div>
            )}
            <div className="py-0.5 px-2 bg-brand-green/10 border-l border-b border-brand-green/20 rounded-bl-lg">
              <span className="text-[7px] font-black text-brand-green tracking-widest uppercase">
                {prediction?.source || 'Ensemble V2'}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-end mb-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-text-muted">Mercado Favorito</span>
                <span className="text-[7px] font-bold px-1 bg-white/5 text-brand-text-muted rounded border border-white/10 uppercase tracking-tighter">Probabilístico</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase text-brand-green">
                  {prediction?.recommendations?.opportunity_market || finalMarket}
                </span>
                <span className="text-[11px] font-mono font-black text-brand-text-muted">
                  @{typeof odds === 'number' ? odds.toFixed(2) : odds}
                </span>
              </div>
            </div>
            <span className="text-2xl font-mono font-black text-brand-green">
              {probPercent}%
            </span>
          </div>
          <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${probPercent}%` }}
              className="h-full bg-brand-green rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)]"
            />
          </div>
        </div>

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
            {isExpanded ? 'Ocultar Análisis Pro' : 'Ver Análisis Pro'}
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
                <div className="space-y-1">
                  <h3 className="text-3xl font-display font-black text-brand-text-white uppercase leading-none tracking-tighter">
                    Análisis <br/> Especializado
                  </h3>
                  <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.4em]">Algoritmo Predictivo BSD Core V3.0</p>
                </div>

                <div className="flex items-center gap-4 text-brand-green mb-4">
                  <div className="w-10 h-10 rounded-full border-2 border-brand-green/30 flex items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full border-2 border-brand-green/20 animate-ping opacity-20" />
                    <Target className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-[0.3em]">Veredicto Táctico Final</span>
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
                    <div className="relative p-8 bg-gradient-to-br from-brand-bg-secondary to-brand-bg-primary rounded-[2.5rem] border border-brand-green/10 shadow-2xl overflow-hidden group/modal-analysis">
                       {/* Accent Line */}
                       <div className="absolute left-0 top-10 bottom-10 w-1.5 bg-brand-green rounded-full opacity-60 shadow-[0_0_15px_rgba(34,197,94,0.5)]" />
                       
                       <div className="prose prose-invert max-w-none prose-sm md:prose-base analysis-markdown">
                          <ReactMarkdown>
                            {analysisText || "**Análisis BSD:** Cargando parámetros de profundidad estadística..."}
                          </ReactMarkdown>
                       </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                       {[
                         { label: 'Expectativa Goles', val: projectedScore !== '?-?' ? projectedScore : "1.1", icon: Target, color: 'text-brand-green' },
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

                    {/* Post-Match Refinement Section */}
                    {match.status === 'FINISHED' && (
                      <div className="mt-8 p-6 bg-brand-green/5 border border-brand-green/20 rounded-3xl">
                        <div className="flex items-center gap-3 mb-4">
                          <ShieldCheck className="w-5 h-5 text-brand-green" />
                          <h4 className="text-xs font-black uppercase text-white tracking-widest">Refinamiento de Veredicto BSD</h4>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                            <span>Resultado Real</span>
                            <span className="text-brand-green font-mono">{match.homeScore} - {match.awayScore}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                            <span>Estado de Predicción</span>
                            <span className="text-brand-green font-mono">EN AUDITORÍA</span>
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
