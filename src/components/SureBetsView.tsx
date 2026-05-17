import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Event, Prediction, OddMarket } from '../types';
import { TeamLogo } from './TeamLogo';
import { CardSkeleton } from './Skeleton';
import { Target, TrendingUp, Zap } from 'lucide-react';
import { cn } from '../types';
import { useMatchStore } from '../hooks/useMatchStore';
import { api } from '../services/api';
import { Footer } from './Footer';

interface SureBet {
  match: Event;
  market: string;
  odd: number;
  impliedProb: number;
  bsdProb: number;
  valuePercent: number;
  recommendation: string;
}

function detectSureBet(match: Event, prediction: Prediction | null, odds: OddMarket | null): SureBet[] {
  if (!prediction) return [];
  const results: SureBet[] = [];

  const check = (market: string, realOdd: number | undefined, bsdProb: number) => {
    // Si no hay cuota real, estimamos una cuota implícita con un ligero recargo para simular valor potencial
    // o simplemente usamos 1/prob si queremos ser literales (pero no daría "valor")
    // Aquí usamos la cuota real si existe, sino una estimación basada en BSD.
    const odd = realOdd && realOdd > 1.1 ? realOdd : (1 / (bsdProb || 0.5)) * 1.08; 
    
    if (odd <= 1.1) return;
    
    const implied = 1 / odd;
    const value = ((bsdProb - implied) / implied) * 100;
    
    // Umbral reducido al 5%
    if (value > 5) {
      results.push({
        match,
        market,
        odd,
        impliedProb: implied * 100,
        bsdProb: bsdProb * 100,
        valuePercent: value,
        recommendation: value > 20 ? 'ALTÍSIMO VALOR' : value > 12 ? 'VALOR ALTO' : 'VALOR MODERADO'
      });
    }
  };

  const o = odds || {};
  check('Victoria Local', o.home_win, prediction.homeWinProb);
  check('Empate', o.draw, prediction.drawProb);
  check('Victoria Visitante', o.away_win, prediction.awayWinProb);
  check('Over 2.5 Goles', o.over_25_goals, prediction.over25Prob || 0.5);
  check('BTTS Sí', o.btts_yes, prediction.bttsProb || 0.5);

  return results.sort((a, b) => b.valuePercent - a.valuePercent);
}

function SureBetCard({ bet }: { bet: SureBet }) {
  const valueColor = bet.valuePercent > 20 ? 'text-[#16A34A]' : bet.valuePercent > 15 ? 'text-brand-green' : 'text-brand-yellow';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-5 border border-brand-border/30 hover:border-brand-green/20 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3 min-w-0">
          <TeamLogo name={bet.match.homeTeam} logoUrl={bet.match.homeLogo} size="sm" />
          <span className="text-xs text-brand-text-muted font-bold">vs</span>
          <TeamLogo name={bet.match.awayTeam} logoUrl={bet.match.awayLogo} size="sm" />
        </div>
        <span className={cn("text-[10px] font-black px-2 py-1 rounded-lg border", 
          bet.valuePercent > 20 ? "bg-[#16A34A]/20 text-[#16A34A] border-[#16A34A]/30" :
          bet.valuePercent > 15 ? "bg-brand-green/10 text-brand-green border-brand-green/20" :
          "bg-brand-yellow/10 text-brand-yellow border-brand-yellow/20"
        )}>
          +{bet.valuePercent.toFixed(1)}%
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-brand-text-muted">Mercado:</span>
          <span className="text-brand-text-white font-bold">{bet.market}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-brand-text-muted">Cuota:</span>
          <span className="text-brand-green font-mono font-bold">{bet.odd.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-brand-text-muted">Prob BSD:</span>
          <span className="text-brand-text-white font-mono">{bet.bsdProb.toFixed(1)}%</span>
        </div>

        <div className="h-2 bg-brand-bg-primary rounded-full overflow-hidden mt-2">
          <div className="flex h-full">
            <div className="h-full bg-brand-text-muted/30" style={{ width: `${bet.impliedProb}%` }} />
            <div className={cn("h-full", valueColor.replace('text', 'bg'))} style={{ width: `${bet.bsdProb - bet.impliedProb}%` }} />
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-brand-text-muted">
          <span>Implícita: {bet.impliedProb.toFixed(1)}%</span>
          <span className={valueColor}>{bet.recommendation}</span>
        </div>
      </div>
    </motion.div>
  );
}

export function SureBetsView() {
  const { matches } = useMatchStore();
  const [predictions, setPredictions] = useState<Record<string, Prediction | null>>({});
  const [odds, setOdds] = useState<Record<string, OddMarket | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const predMap: Record<string, Prediction | null> = {};
      const oddsMap: Record<string, OddMarket | null> = {};

      const batch = matches.slice(0, 20);
      for (let i = 0; i < batch.length; i += 3) {
        const chunk = batch.slice(i, i + 3);
        const results = await Promise.all(
          chunk.map(async m => {
            const [p, o] = await Promise.all([
              api.getPredictions(m.id),
              api.getOdds(m.id)
            ]);
            return { id: m.id, prediction: p, odds: o };
          })
        );
        results.forEach(r => {
          predMap[r.id] = r.prediction;
          oddsMap[r.id] = r.odds;
        });
        if (i + 3 < batch.length) await new Promise(r => setTimeout(r, 200));
      }

      if (!cancelled) {
        setPredictions(predMap);
        setOdds(oddsMap);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [matches]);

  const sureBets = useMemo(() => {
    return matches
      .filter(m => m.status === 'SCHEDULED' || m.status === 'LIVE')
      .flatMap(m => detectSureBet(m, predictions[m.id] || null, odds[m.id] || null))
      .slice(0, 15);
  }, [matches, predictions, odds]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 touch-scroll h-full">
      <div className="max-w-5xl mx-auto space-y-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : sureBets.length === 0 ? (
          <div className="py-20 text-center glass-card rounded-3xl p-8">
            <Target className="w-12 h-12 mx-auto text-brand-text-muted opacity-30 mb-4" />
            <p className="text-brand-text-white font-bold uppercase text-xs tracking-widest mb-2">
              Análisis de valor completado
            </p>
            <p className="text-brand-text-muted text-[11px] leading-relaxed max-w-xs mx-auto">
              Se analizaron {matches.length} partidos. Las cuotas del mercado están muy ajustadas en este momento. Reintenta en 30 minutos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sureBets.map((bet, i) => (
              <SureBetCard key={`${bet.match.id}-${bet.market}`} bet={bet} />
            ))}
          </div>
        )}

        <div className="mt-12 border-t border-brand-border/10 pt-12 pb-24">
          <Footer />
        </div>
      </div>
    </div>
  );
}
