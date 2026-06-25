import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, ChevronDown, Sparkles, TrendingUp, Info } from 'lucide-react';
import { Event, Prediction, EnrichedEventData, cn, TeamForm } from '../types';
import { PredictionCard } from './PredictionCard';
import { dayLabels } from '../hooks/useMatchStore';
import { Footer } from './Footer';
import { computeLocalValue, calculatePoissonModel } from '../lib/prediction';
import { useUI } from '../contexts/UIContext';

interface PredictionsViewProps {
  groupedByDay: Record<'today' | 'tomorrow' | 'dayAfter' | 'later', Event[]>;
  v2Predictions: { event: Event, prediction: Prediction }[];
  enrichedData: Record<string, EnrichedEventData>;
  dayLabels: Record<string, string>;
  onSelectMatch?: (id: string) => void;
  getMarketProbabilities: (match: Event) => { market: string; label: string; prob: number }[];
  frozenPredictions: Record<string, Prediction>;
  teamForms: Record<string, TeamForm>;
}

export function PredictionsView({ 
  groupedByDay, 
  v2Predictions, 
  enrichedData, 
  dayLabels: propDayLabels, 
  onSelectMatch, 
  getMarketProbabilities,
  frozenPredictions,
  teamForms
}: PredictionsViewProps) {
  const { openModal } = useUI();
  const finalDayLabels = propDayLabels || dayLabels;
  const days: Array<'today' | 'tomorrow' | 'dayAfter'> = ['today', 'tomorrow', 'dayAfter'];

  const handleSelectMatch = (id: string) => {
    if (onSelectMatch) {
      onSelectMatch(id);
    } else {
      const m = (groupedByDay.today || [])
        .concat(groupedByDay.tomorrow || [], groupedByDay.dayAfter || [], groupedByDay.later || [])
        .find(match => match.id === id);
      if (m) {
        openModal('MatchAnalysisModal', { match: m });
      }
    }
  };

  // Crear mapa para buscar partidos por id de forma eficiente
  const matchMap = useMemo(() => {
    const map = new Map<string, Event>();
    Object.values(groupedByDay).forEach(list => {
      if (list) {
        list.forEach(m => map.set(m.id, m));
      }
    });
    return map;
  }, [groupedByDay]);

  // ============================================================
  // 1. OBTENER PREDICCIÓN PARA UN PARTIDO (CONGELADA > V2 > LOCAL)
  // ============================================================
  const getPredictionForMatch = (matchId: string): Prediction | null => {
    // Prioridad 1: Predicción congelada del servidor
    if (frozenPredictions?.[matchId]) {
      return frozenPredictions[matchId];
    }
    // Prioridad 2: V2 Predictions de la API (fallback)
    const v2Match = v2Predictions.find(p => p.event.id === matchId);
    if (v2Match?.prediction) {
      return v2Match.prediction;
    }
    // Prioridad 3: Cálculo local con Poisson + Ensemble
    const match = matchMap.get(matchId);
    if (match && teamForms) {
      const homeForm = teamForms[match.homeTeamId];
      const awayForm = teamForms[match.awayTeamId];
      if (homeForm && awayForm) {
        const localPred = calculatePoissonModel(homeForm, awayForm);
        return {
          ...localPred,
          source: 'LOCAL_POISSON'
        };
      }
    }
    return null;
  };

  // ============================================================
  // 2. CALCULAR TOP PICKS USANDO PREDICCIONES CONGELADAS
  // ============================================================
  const allUpcoming = [...groupedByDay.today, ...groupedByDay.tomorrow, ...groupedByDay.dayAfter];

  const topPicksWithValue = useMemo(() => {
    return allUpcoming
      .map(match => {
        // Obtener predicción congelada
        const pred = getPredictionForMatch(match.id);
        if (!pred) return null;

        // Obtener odds del partido
        const odds = enrichedData?.[match.id]?.odds || (match as any).odds;

        // Calcular probabilidades por mercado
        const probs = [
          { market: 'BTTS', label: 'Ambos Marcan', prob: pred.bttsProb || 0.5 },
          { market: 'OVER', label: 'Over 2.5', prob: pred.over25Prob || 0.5 },
          { market: '1X2', label: 'Local', prob: pred.homeWinProb },
          { market: '1X2', label: 'Empate', prob: pred.drawProb },
          { market: '1X2', label: 'Visitante', prob: pred.awayWinProb }
        ].filter(p => p.prob > 0);

        // Encontrar el mercado con mayor probabilidad
        const top = probs.reduce((prev, current) => (prev.prob > current.prob) ? prev : current);

        // Calcular valor real usando computeLocalValue
        const valueAnalysis = computeLocalValue(
          { homeTeam: match.homeTeam, awayTeam: match.awayTeam },
          probs,
          odds
        );

        // Puntuación combinada: probabilidad + bonus por valor
        let score = top.prob;
        if (valueAnalysis?.isValue && valueAnalysis.percentage > 8) {
          score += 0.15; // Bonus por valor real
        }

        return {
          match,
          top,
          valueAnalysis,
          score,
          prediction: pred
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score);
  }, [allUpcoming, frozenPredictions, enrichedData, v2Predictions]);

  // Top Pick Principal (el mejor)
  const topPick = topPicksWithValue[0] || null;

  // Otros Top Picks (siguientes 2)
  const otherTopPicks = topPicksWithValue.slice(1, 3);

  // ============================================================
  // 3. DETECTAR VALOR REAL EN TODOS LOS PARTIDOS
  // ============================================================
  const hasRealValue = useMemo(() => {
    return allUpcoming.some(match => {
      const pred = getPredictionForMatch(match.id);
      if (!pred) return false;
      
      const odds = enrichedData?.[match.id]?.odds || (match as any).odds;
      if (!odds) return false;

      const probs = [
        { market: 'BTTS', label: 'Ambos Marcan', prob: pred.bttsProb || 0.5 },
        { market: 'OVER', label: 'Over 2.5', prob: pred.over25Prob || 0.5 },
        { market: '1X2', label: 'Local', prob: pred.homeWinProb }
      ].filter(p => p.prob > 0);

      const value = computeLocalValue(
        { homeTeam: match.homeTeam, awayTeam: match.awayTeam },
        probs,
        odds
      );

      return value?.isValue === true && value.percentage > 8;
    });
  }, [allUpcoming, frozenPredictions, enrichedData]);

  // ============================================================
  // 4. FUNCIÓN PARA OBTENER PROBABILIDADES DE MERCADO (CONSISTENTE)
  // ============================================================
  const getMarketProbsForMatch = (match: Event) => {
    const pred = getPredictionForMatch(match.id);
    if (!pred) {
      // Fallback: usar getMarketProbabilities (comportamiento anterior)
      return getMarketProbabilities(match);
    }

    const hProb = pred.homeWinProb || 0;
    const dProb = pred.drawProb || 0;
    const aProb = pred.awayWinProb || 0;
    const win1X2 = Math.max(hProb, dProb, aProb);
    const label1X2 = hProb >= Math.max(dProb, aProb) ? 'Local' : (aProb >= dProb ? 'Visitante' : 'Empate');

    return [
      { market: 'BTTS', label: 'Ambos Marcan', prob: pred.bttsProb || 0.5 },
      { market: 'OVER', label: 'Over 2.5', prob: pred.over25Prob || 0.5 },
      { market: 'OVER15', label: 'Over 1.5', prob: pred.over15Prob || 0.7 },
      { market: 'OVER35', label: 'Over 3.5', prob: pred.over35Prob || 0.2 },
      { market: '1X2', label: label1X2, prob: win1X2 }
    ].sort((a, b) => b.prob - a.prob);
  };

  // ============================================================
  // 5. FORMATEAR FECHA
  // ============================================================
  const getFormattedDate = (category: string) => {
    const now = new Date();
    const target = new Date(now);
    if (category === 'tomorrow') target.setDate(now.getDate() + 1);
    if (category === 'dayAfter') target.setDate(now.getDate() + 2);
    return target.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  };

  // ============================================================
  // 6. RENDER - ESTADO DE CARGA
  // ============================================================
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

  // ============================================================
  // 7. RENDER - PRINCIPAL
  // ============================================================
  return (
    <div className="space-y-12 pb-20">
      {/* HEADER INFO */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 md:p-8 rounded-[2.5rem] border border-brand-border/40 bg-gradient-to-br from-brand-bg-secondary/40 to-brand-bg-primary/20 lg:col-span-3">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="custom-icon-wrapper w-14 h-14 bg-brand-green/10 border-brand-green/20 shrink-0">
              <Sparkles className="w-7 h-7 text-brand-green animate-pulse" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black text-brand-text-white uppercase tracking-tight leading-none mb-3">Pronósticos para hoy</h3>
              <p className="text-xs text-brand-text-muted leading-relaxed max-w-2xl">
                Nuestro motor de IA procesa miles de puntos de datos históricos, momentum en vivo y heurística táctica para generar métricas de probabilidad avanzada en cada encuentro.
              </p>
              <div className="flex flex-wrap gap-8 mt-8">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.2em] mb-1">Sincronización</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-black text-brand-green italic">OK</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-green shadow-[0_0_8px_rgba(78,222,163,0.8)] animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col border-l border-brand-border/40 pl-8">
                  <span className="text-[10px] font-black text-brand-text-muted uppercase tracking-[0.2em] mb-1">Eventos Procesados</span>
                  <span className="text-xl font-mono font-black text-white">{allUpcoming.length}</span>
                </div>
                {hasRealValue && (
                  <div className="flex flex-col border-l border-brand-green/40 pl-8">
                    <span className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em] mb-1">Valor Real Detectado</span>
                    <span className="text-xl font-mono font-black text-brand-green animate-pulse">🔍 OPORTUNIDAD</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 rounded-[2.5rem] border border-brand-yellow/20 bg-brand-yellow/[0.03] flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-yellow/5 blur-2xl -mr-12 -mt-12 rounded-full" />
          <div className="flex items-center gap-3 mb-4 relative">
            <div className="custom-icon-wrapper w-8 h-8 scale-90 border-brand-yellow/30 bg-brand-yellow/5">
              <TrendingUp className="w-4 h-4 text-brand-yellow" />
            </div>
            <span className="text-[10px] font-black text-brand-yellow uppercase tracking-[0.3em]">Tendencia</span>
          </div>
          <p className="text-xs text-brand-text-muted uppercase font-bold tracking-tight leading-relaxed relative">
            Los mercados de <span className="text-white border-b border-brand-yellow/30">Goles</span> y <span className="text-white border-b border-brand-yellow/30">Doble Oportunidad</span> presentan la mayor estabilidad hoy.
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
              {topPick.valueAnalysis?.isValue && topPick.valueAnalysis.percentage > 8 && (
                <span className="text-brand-green text-sm ml-2 font-mono">🔥 +{topPick.valueAnalysis.percentage.toFixed(1)}% VALOR</span>
              )}
            </h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {(() => {
              const match = topPick.match;
              const top = topPick.top;
              const prediction = topPick.prediction;
              const probs = getMarketProbsForMatch(match);
              const bttsData = probs.find(p => p.market === 'BTTS');
              const overData = probs.find(p => p.market === 'OVER');
              return (
                <PredictionCard
                  key={`featured-${match.id}`}
                  match={match}
                  featured={true}
                  prediction={prediction}
                  enriched={enrichedData?.[match.id]}
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

      {/* TOP PICKS SECTION */}
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
            {otherTopPicks.map(({ match, top, prediction, valueAnalysis }) => {
              const probs = getMarketProbsForMatch(match);
              const bttsData = probs.find(p => p.market === 'BTTS');
              const overData = probs.find(p => p.market === 'OVER');
              return (
                <PredictionCard
                  key={`top-${match.id}`}
                  match={match}
                  prediction={prediction}
                  enriched={enrichedData?.[match.id]}
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

      {/* DAY SECTIONS */}
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
                  const prediction = getPredictionForMatch(match.id);
                  const probs = getMarketProbsForMatch(match);
                  const marketData = probs.find(p => p.prob > 0.7) || probs[0];
                  const bttsData = probs.find(p => p.market === 'BTTS');
                  const overData = probs.find(p => p.market === 'OVER');
                  
                  return (
                    <PredictionCard
                      key={match.id}
                      match={match}
                      prediction={prediction}
                      enriched={enrichedData?.[match.id]}
                      topMarket={marketData?.label || 'BTTS'}
                      topProb={marketData?.prob || 0.5}
                      bttsProb={bttsData?.prob || 0}
                      over25Prob={overData?.prob || 0}
                      onSelect={handleSelectMatch}
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
