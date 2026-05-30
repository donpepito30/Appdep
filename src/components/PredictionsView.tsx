import React from 'react';
import { motion } from 'motion/react';
import { Calendar, ChevronDown, Sparkles, TrendingUp, Info } from 'lucide-react';
import { Event, Prediction, cn } from '../types';
import { PredictionCard } from './PredictionCard';
import { dayLabels } from '../hooks/useMatchStore';
import { Footer } from './Footer';

interface PredictionsViewProps {
  groupedByDay: Record<'today' | 'tomorrow' | 'dayAfter' | 'later', Event[]>;
  v2Predictions: { event: Event, prediction: Prediction }[];
  dayLabels: Record<string, string>;
  onSelectMatch: (id: string) => void;
  getMarketProbabilities: (match: Event) => { market: string; label: string; prob: number }[];
}

export function PredictionsView({ groupedByDay, v2Predictions, dayLabels: propDayLabels, onSelectMatch, getMarketProbabilities }: PredictionsViewProps) {
  // Use prop if provided, fallback to import
  const finalDayLabels = propDayLabels || dayLabels;
  const days: Array<'today' | 'tomorrow' | 'dayAfter'> = ['today', 'tomorrow', 'dayAfter'];

  // Logic to "Choose" Top Picks (highest probability or confidence)
  const allUpcoming = [...groupedByDay.today, ...groupedByDay.tomorrow, ...groupedByDay.dayAfter];
  const sortedPicks = allUpcoming
    .map(match => {
      const probs = getMarketProbabilities(match);
      const top = probs.reduce((prev, current) => (prev.prob > current.prob) ? prev : current);
      return { match, top };
    })
    .sort((a, b) => b.top.prob - a.top.prob);

  const topPick = sortedPicks[0];
  const otherTopPicks = sortedPicks.slice(1, 3);
  const topPicks = sortedPicks.filter(p => p.top.prob > 0.75).slice(0, 3);

  const getFormattedDate = (category: string) => {
    const now = new Date();
    const target = new Date(now);
    if (category === 'tomorrow') target.setDate(now.getDate() + 1);
    if (category === 'dayAfter') target.setDate(now.getDate() + 2);
    
    return target.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  };

  if (!groupedByDay || (groupedByDay.today.length === 0 && groupedByDay.tomorrow.length === 0 && groupedByDay.dayAfter.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="custom-icon-wrapper w-16 h-16 rounded-[2rem] bg-brand-bg-secondary flex items-center justify-center border border-white/5 animate-pulse">
          <Calendar className="w-8 h-8 text-brand-text-muted" />
        </div>
        <p className="text-brand-text-muted font-black uppercase text-[10px] tracking-[0.3em]">Cargando calendario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Header Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-[2rem] border border-brand-border/40 bg-brand-bg-primary/20 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="custom-icon-wrapper bg-brand-green/10">
              <Sparkles className="w-6 h-6 text-brand-green" />
            </div>
            <div>
              <h3 className="text-xl font-black text-brand-text-white uppercase tracking-tight">Pronósticos para hoy</h3>
              <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
                Análisis de rendimiento y métricas avanzadas para los próximos encuentros.
              </p>
              <div className="flex gap-4 mt-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Sinc</span>
                  <span className="text-sm font-mono font-black text-brand-green">OK</span>
                </div>
                <div className="flex flex-col border-l border-brand-border pl-4">
                  <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Eventos</span>
                  <span className="text-sm font-mono font-black text-white">{allUpcoming.length}</span>
                </div>
                {allUpcoming.some(m => v2Predictions[m.id]?.recommendations?.value_detected) && (
                  <div className="flex flex-col border-l border-brand-border pl-4">
                    <span className="text-[10px] font-black text-brand-red uppercase tracking-widest">Oportunidad</span>
                    <span className="text-sm font-mono font-black text-brand-red">ALERTA</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 rounded-[2rem] border border-brand-yellow/20 bg-brand-yellow/5 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-3">
              <div className="custom-icon-wrapper w-8 h-8 scale-75 border-brand-yellow/30">
                <TrendingUp className="w-4 h-4 text-brand-yellow" />
              </div>
              <span className="text-[10px] font-black text-brand-yellow uppercase tracking-widest">Tendencia del Día</span>
            </div>
            <p className="text-[11px] text-brand-text-muted uppercase font-bold tracking-tight leading-normal">
              Mercados de <span className="text-white">Goles</span> y <span className="text-white">Doble Oportunidad</span> presentan la mayor estabilidad hoy.
            </p>
        </div>
      </div>

      {/* FEATURED TOP PICK - THE BANKER */}
      {topPick && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="custom-icon-wrapper border-brand-yellow/30">
              <Sparkles className="w-4 h-4 text-brand-yellow" />
            </div>
            <h2 className="text-xl font-black text-brand-text-white tracking-wide uppercase">
              Selección <span className="text-brand-yellow italic">Principal</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {(() => {
              const match = topPick.match;
              const top = topPick.top;
              const v2Match = v2Predictions.find(p => p.event.id === match.id);
              const probs = getMarketProbabilities(match);
              const bttsData = probs.find(p => p.market === 'BTTS');
              const overData = probs.find(p => p.market === 'OVER');
              return (
                <PredictionCard
                  key={`featured-${match.id}`}
                  match={match}
                  featured={true}
                  prediction={v2Match?.prediction}
                  topMarket={top.label}
                  topProb={top.prob}
                  bttsProb={bttsData?.prob || 0.5}
                  over25Prob={overData?.prob || 0.5}
                  onSelect={onSelectMatch}
                />
              );
            })()}
          </div>
        </section>
      )}

      {/* TOP PICKS SECTION - "Escoger los próximos partidos" */}
      {otherTopPicks.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="custom-icon-wrapper border-brand-green/30">
              <TrendingUp className="w-4 h-4 text-brand-green" />
            </div>
            <h2 className="text-xl font-black text-brand-text-white tracking-wide uppercase">
              Predicciones <span className="text-brand-green">Destacadas</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {otherTopPicks.map(({ match, top }) => {
              const v2Match = v2Predictions.find(p => p.event.id === match.id);
              const probs = getMarketProbabilities(match);
              const bttsData = probs.find(p => p.market === 'BTTS');
              const overData = probs.find(p => p.market === 'OVER');
              return (
                <PredictionCard
                  key={`top-${match.id}`}
                  match={match}
                  prediction={v2Match?.prediction}
                  topMarket={top.label}
                  topProb={top.prob}
                  bttsProb={bttsData?.prob || 0.5}
                  over25Prob={overData?.prob || 0.5}
                  onSelect={onSelectMatch}
                />
              );
            })}
          </div>
        </section>
      )}

      {days.map((dayKey) => {
        const matches = groupedByDay[dayKey];
        const label = finalDayLabels[dayKey];
        const dateStr = getFormattedDate(dayKey);

        return (
          <section key={dayKey} className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-brand-green rounded-full shadow-[0_0_15px_rgba(34,197,94,0.5)]" />
                <div>
                  <h2 className="text-xl font-black text-brand-text-white tracking-wide uppercase">
                    {label} <span className="text-brand-text-muted font-mono font-medium ml-2">— {dateStr}</span>
                  </h2>
                  <p className="text-[10px] text-brand-text-muted font-bold tracking-widest uppercase mt-0.5">
                    {matches.length} ENCUENTROS
                  </p>
                </div>
              </div>
              <ChevronDown className="w-5 h-5 text-brand-text-muted opacity-30" />
            </div>

            {matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {matches.map((match) => {
                  const v2Match = v2Predictions.find(p => p.event.id === match.id);
                  const probs = getMarketProbabilities(match);
                  // Find the market that is NOT 1X2 if possible or just use the highest one
                  const marketData = probs.find(p => p.prob > 0.7) || probs[0];
                  const bttsData = probs.find(p => p.market === 'BTTS');
                  const overData = probs.find(p => p.market === 'OVER');
                  
                  return (
                    <PredictionCard
                      key={match.id}
                      match={match}
                      prediction={v2Match?.prediction}
                      topMarket={marketData.label}
                      topProb={marketData.prob}
                      bttsProb={bttsData?.prob || 0}
                      over25Prob={overData?.prob || 0}
                      onSelect={onSelectMatch}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="glass-card py-12 flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 opacity-60">
                <Info className="w-8 h-8 text-brand-text-muted mb-3" />
                <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">Sin partidos programados para este día</p>
              </div>
            )}
          </section>
        );
      })}

      <div className="mt-12 pt-12 border-t border-brand-border/10">
        <Footer />
      </div>
    </div>
  );
}
