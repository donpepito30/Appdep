import React from 'react';
import { motion } from 'motion/react';
import { Calendar, ChevronDown, Sparkles, TrendingUp, Info } from 'lucide-react';
import { Event, cn } from '../types';
import { PredictionCard } from './PredictionCard';
import { dayLabels } from '../hooks/useMatchStore';
import { Footer } from './Footer';

interface PredictionsViewProps {
  groupedByDay: Record<'today' | 'tomorrow' | 'dayAfter' | 'later', Event[]>;
  dayLabels: Record<string, string>;
  onSelectMatch: (id: string) => void;
  getMarketProbabilities: (match: Event) => { market: string; label: string; prob: number }[];
}

export function PredictionsView({ groupedByDay, dayLabels: propDayLabels, onSelectMatch, getMarketProbabilities }: PredictionsViewProps) {
  // Use prop if provided, fallback to import
  const finalDayLabels = propDayLabels || dayLabels;
  const days: Array<'today' | 'tomorrow' | 'dayAfter'> = ['today', 'tomorrow', 'dayAfter'];

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
        <div className="w-16 h-16 rounded-full bg-brand-bg-secondary flex items-center justify-center border border-white/5 animate-pulse">
          <Calendar className="w-8 h-8 text-brand-text-muted" />
        </div>
        <p className="text-brand-text-muted font-black uppercase text-[10px] tracking-[0.3em]">Sincronizando calendario de predicciones...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Header Info */}
      <div className="glass-card p-6 rounded-[2rem] border border-brand-border/40 bg-brand-bg-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand-green/10 rounded-2xl">
            <Sparkles className="w-6 h-6 text-brand-green" />
          </div>
          <div>
            <h3 className="text-lg font-black text-brand-text-white uppercase tracking-tight">Predicciones Diarias IA</h3>
            <p className="text-xs text-brand-text-muted mt-1">
              Análisis multivariante basado en <span className="text-brand-green font-bold">Machine Learning</span> y Redes Bayesianas para los próximos 3 días.
            </p>
          </div>
        </div>
      </div>

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
                    {matches.length} PARTIDOS ANALIZADOS
                  </p>
                </div>
              </div>
              <ChevronDown className="w-5 h-5 text-brand-text-muted opacity-30" />
            </div>

            {matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {matches.map((match) => {
                  const probs = getMarketProbabilities(match);
                  // Find the market that is NOT 1X2 if possible or just use the highest one
                  const marketData = probs.find(p => p.prob > 0.7) || probs[0];
                  const bttsData = probs.find(p => p.market === 'BTTS');
                  const overData = probs.find(p => p.market === 'OVER');
                  
                  return (
                    <PredictionCard
                      key={match.id}
                      match={match}
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
