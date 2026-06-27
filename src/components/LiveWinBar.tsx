import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Event, Prediction } from '../types';
import { cn } from '../types';
import { AlertTriangle, HelpCircle, Sparkles } from 'lucide-react';

interface LiveWinBarProps {
  match: Event;
  prediction: Prediction | null;
  isLoading?: boolean;
}

export function LiveWinBar({ match, prediction, isLoading }: LiveWinBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // If loading or prediction is null, show a beautiful skeleton loader
  if (isLoading || !prediction) {
    return (
      <div className="w-full bg-[#0f0f0f] border-b border-white/5 px-4 md:px-6 py-4 relative z-40 select-none animate-pulse">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Header Skeleton */}
          <div className="flex justify-between items-center">
            <div className="h-4 bg-white/5 rounded w-1/4" />
            <div className="h-6 bg-white/5 rounded w-16 mx-auto" />
            <div className="h-4 bg-white/5 rounded w-1/4" />
          </div>
          {/* Bar Skeleton */}
          <div className="h-7 bg-white/5 rounded-full w-full" />
        </div>
      </div>
    );
  }

  // Calculate percentages
  const homeProb = prediction.homeWinProb ?? 0.33;
  const drawProb = prediction.drawProb ?? 0.34;
  const awayProb = prediction.awayWinProb ?? 0.33;

  const total = homeProb + drawProb + awayProb || 1;
  const homePct = Math.round((homeProb / total) * 100);
  const drawPct = Math.round((drawProb / total) * 100);
  const awayPct = 100 - homePct - drawPct;

  // Determine colors based on winner (higher win probability gets green, other gets red)
  const isHomeWinner = homePct > awayPct;
  const isAwayWinner = awayPct > homePct;

  // Colors: green for segment with higher probability (winner), gray for draw, red for lower probability (loser)
  let homeColor = 'bg-[#4a4a4a]'; // Fallback if equal
  let awayColor = 'bg-[#4a4a4a]';

  if (isHomeWinner) {
    homeColor = 'bg-[#00ff88] text-black font-black'; // winner gets green
    awayColor = 'bg-[#ff3344] text-white'; // loser gets red
  } else if (isAwayWinner) {
    homeColor = 'bg-[#ff3344] text-white'; // loser gets red
    awayColor = 'bg-[#00ff88] text-black font-black'; // winner gets green
  } else {
    // If exact equal probability, we can color both green or both neutral gray
    homeColor = 'bg-[#00ff88]/80 text-black font-black';
    awayColor = 'bg-[#00ff88]/80 text-black font-black';
  }

  const drawColor = 'bg-[#222222] text-white/70'; // draw gets dark gray

  // Checks for UI states
  const isFallback = prediction.source?.toUpperCase() === 'FALLBACK';
  const rawConf = prediction.confidence ?? 60;
  // Support both fraction (0-1) and percentage (0-100)
  const isLowConfidence = rawConf < 0.5 || (rawConf > 1 && rawConf < 50);

  // Animation config
  const isLive = match.status === 'LIVE';
  const springTransition = (isLive 
    ? { type: "spring", stiffness: 80, damping: 15, mass: 1 } 
    : { type: "tween", duration: 0.8, ease: "easeInOut" }) as any;

  return (
    <div 
      className={cn(
        "w-full bg-[#0d0d0d] border-b border-white/5 px-4 md:px-6 py-4 relative z-40 select-none transition-opacity duration-300",
        isLowConfidence ? "opacity-60" : "opacity-100"
      )}
    >
      <div className="max-w-3xl mx-auto space-y-3">
        
        {/* Top Header Row (Minuto En Vivo / Score / Indicators) */}
        <div className="flex items-center justify-between gap-4 text-xs font-mono">
          
          {/* Left Side: Status / Minute */}
          <div className="flex items-center gap-2">
            {isLive ? (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-red/10 border border-brand-red/20 rounded-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-red"></span>
                </span>
                <span className="text-[10px] font-black text-brand-red uppercase tracking-wider">
                  {match.currentMinute}' EN VIVO
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-bold text-white/50 tracking-wider">
                {match.status === 'FINISHED' ? 'FINALIZADO' : 'PROGRAMADO'}
              </span>
            )}

            {/* Low Confidence warning badge */}
            {isLowConfidence && (
              <span className="flex items-center gap-1 px-2 py-1 bg-brand-yellow/10 border border-brand-yellow/20 rounded-md text-[10px] font-bold text-brand-yellow">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Baja confianza</span>
              </span>
            )}
          </div>

          {/* Center Side: Score Overlay */}
          <div className="flex items-center gap-1 bg-black/60 px-3 py-1 rounded-full border border-white/5 font-display shadow-lg">
            <span className="text-white/60 text-[9px] font-black uppercase tracking-wider mr-1.5">Marcador</span>
            <span className="font-black text-white text-sm tracking-tight font-tabular">
              {match.homeScore}
            </span>
            <span className="text-white/30 text-xs font-semibold px-0.5">-</span>
            <span className="font-black text-white text-sm tracking-tight font-tabular">
              {match.awayScore}
            </span>
          </div>

          {/* Right Side: Tooltips & Source */}
          <div className="flex items-center gap-2 relative">
            {isFallback ? (
              <div 
                className="relative cursor-pointer"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
              >
                <span className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] text-white/70 border border-white/5 select-none transition-all">
                  <span>Estimación Genérica</span>
                  <HelpCircle className="w-3 h-3 text-white/40" />
                </span>

                {showTooltip && (
                  <div className="absolute right-0 top-full mt-2 w-56 p-2.5 bg-black border border-white/10 rounded-xl shadow-2xl text-[10px] leading-relaxed text-white/80 z-50 pointer-events-none backdrop-blur-md">
                    <div className="absolute top-0 right-4 w-2 h-2 -mt-1 bg-black border-t border-l border-white/10 rotate-45" />
                    Estimación genérica — datos en proceso
                  </div>
                )}
              </div>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-[#00ff88]/10 text-[#00ff88] rounded-md text-[10px] font-black uppercase tracking-wider select-none">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Modelo BSD Activo</span>
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Horizontal Probabilities Bar */}
        <div className="relative w-full h-8 bg-white/5 rounded-xl overflow-hidden flex shadow-inner">
          
          {/* Home Segment */}
          {homePct > 0 && (
            <motion.div
              layout
              initial={{ width: 0 }}
              animate={{ width: `${homePct}%` }}
              transition={springTransition}
              className={cn(
                "h-full flex items-center justify-center min-w-0 transition-colors duration-300 relative",
                homeColor
              )}
            >
              {homePct >= 12 ? (
                <span className="text-[10px] font-black truncate px-1 uppercase tracking-tight">
                  {homePct}% L
                </span>
              ) : (
                <span className="absolute -top-12 left-2 text-[10px] font-bold text-white/60">L: {homePct}%</span>
              )}
            </motion.div>
          )}

          {/* Draw Segment */}
          {drawPct > 0 && (
            <motion.div
              layout
              initial={{ width: 0 }}
              animate={{ width: `${drawPct}%` }}
              transition={springTransition}
              className={cn(
                "h-full flex items-center justify-center border-x border-black/25 min-w-0 transition-colors duration-300 relative",
                drawColor
              )}
            >
              {drawPct >= 12 ? (
                <span className="text-[10px] font-black truncate px-1 uppercase tracking-tight">
                  {drawPct}% E
                </span>
              ) : (
                <span className="absolute -top-12 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/60">E: {drawPct}%</span>
              )}
            </motion.div>
          )}

          {/* Away Segment */}
          {awayPct > 0 && (
            <motion.div
              layout
              initial={{ width: 0 }}
              animate={{ width: `${awayPct}%` }}
              transition={springTransition}
              className={cn(
                "h-full flex items-center justify-center min-w-0 transition-colors duration-300 relative",
                awayColor
              )}
            >
              {awayPct >= 12 ? (
                <span className="text-[10px] font-black truncate px-1 uppercase tracking-tight">
                  {awayPct}% V
                </span>
              ) : (
                <span className="absolute -top-12 right-2 text-[10px] font-bold text-white/60">V: {awayPct}%</span>
              )}
            </motion.div>
          )}
        </div>

        {/* Desktop-friendly team name labels below the bar for extra legibility */}
        <div className="flex justify-between items-center px-1 text-[9px] font-black uppercase tracking-wider text-white/40">
          <span className="truncate max-w-[120px] sm:max-w-[180px]">{match.homeTeam}</span>
          <span>Empate</span>
          <span className="truncate max-w-[120px] sm:max-w-[180px] text-right">{match.awayTeam}</span>
        </div>

      </div>
    </div>
  );
}
