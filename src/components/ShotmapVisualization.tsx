import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crosshair, HelpCircle, SlidersHorizontal, Users } from 'lucide-react';
import { cn } from '../types';

export interface Shot {
  x: number;          // 0-100 (horizontal, 0=izquierda)
  y: number;          // 0-100 (vertical, 0=arriba)
  xg: number;         // 0-1 probabilidad de gol
  result: 'Goal' | 'SavedShot' | 'MissedShots' | 'BlockedShot';
  team: 'home' | 'away';
  player?: string;
  minute?: number;
}

interface ShotmapVisualizationProps {
  shots: any[]; // Accepts raw or normalized shots
  homeTeamName?: string;
  awayTeamName?: string;
}

export function ShotmapVisualization({
  shots: rawShots,
  homeTeamName = 'Local',
  awayTeamName = 'Visitante',
}: ShotmapVisualizationProps) {
  const [filter, setFilter] = useState<'both' | 'home' | 'away'>('both');
  const [hoveredShot, setHoveredShot] = useState<Shot | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Normalize raw shot data to fit our strict Shot interface
  const normalizedShots = useMemo(() => {
    if (!rawShots) return [];
    return rawShots.map((s: any): Shot => {
      // Check if already normalized
      if (s.result && (s.team === 'home' || s.team === 'away')) {
        return s as Shot;
      }

      const team = (s.is_home === true || s.isHome === true || s.team === 'home' || String(s.is_home) === 'true') ? 'home' : 'away';
      const xg = s.xg !== undefined ? s.xg : (s.xG !== undefined ? s.xG : (s.expectedGoals !== undefined ? s.expectedGoals : 0.05));
      
      let result: 'Goal' | 'SavedShot' | 'MissedShots' | 'BlockedShot' = 'MissedShots';
      const rawOutcome = String(s.outcome || s.result || s.type || '').toLowerCase();
      if (rawOutcome.includes('goal') || rawOutcome === 'goal' || s.is_goal || s.isGoal) {
        result = 'Goal';
      } else if (rawOutcome.includes('save') || rawOutcome.includes('saved')) {
        result = 'SavedShot';
      } else if (rawOutcome.includes('block') || rawOutcome.includes('blocked')) {
        result = 'BlockedShot';
      } else {
        result = 'MissedShots';
      }

      return {
        x: s.x !== undefined ? Number(s.x) : 50,
        y: s.y !== undefined ? Number(s.y) : 50,
        xg: Number(xg),
        result,
        team,
        player: s.player || s.playerName || s.player_name || 'Jugador',
        minute: s.minute !== undefined ? Number(s.minute) : undefined
      };
    });
  }, [rawShots]);

  // Compute Statistics for sidebar (on all normalized shots)
  const stats = useMemo(() => {
    const computeForTeam = (team: 'home' | 'away') => {
      const teamShots = normalizedShots.filter(s => s.team === team);
      const totalXG = teamShots.reduce((sum, s) => sum + s.xg, 0);
      const goals = teamShots.filter(s => s.result === 'Goal').length;
      const onTarget = teamShots.filter(s => s.result === 'Goal' || s.result === 'SavedShot').length;
      return {
        total: teamShots.length,
        xg: totalXG,
        goals,
        onTarget,
      };
    };

    return {
      home: computeForTeam('home'),
      away: computeForTeam('away'),
    };
  }, [normalizedShots]);

  // Filter shots for display
  const displayedShots = useMemo(() => {
    if (filter === 'both') return normalizedShots;
    return normalizedShots.filter(s => s.team === filter);
  }, [normalizedShots, filter]);

  // Map Shot to SVG Coordinates on our horizontal half-pitch:
  // Left side: Goal (x = 50)
  // Right side: Halfway line (x = 550)
  // Sidelines: Top (y = 40) and Bottom (y = 360)
  // SVG Viewbox: 0 0 600 400
  const getSVGCoords = (shot: Shot) => {
    // Determine horizontal position (distance to opponent's goal)
    // If raw coordinates have shots attacking either side, normalize so they always attack the left goal (x=0)
    // x values are 0-100, where 0 represents the goal line and 100 represents the halfway line (or vice versa depending on dataset)
    // To be perfectly safe, if raw x > 50, we assume it's attacking the other end and mirror it.
    const attackingXPct = shot.x > 50 ? (100 - shot.x) * 2 : shot.x * 2;
    const clampedXPct = Math.max(0, Math.min(100, attackingXPct));
    
    // Map to SVG x: 50 is goal line, 550 is halfway line (total width 500)
    const svgX = 50 + (clampedXPct / 100) * 500;

    // Determine vertical position:
    // If filter is 'both', we display Home shots on the bottom half, Away shots on the top half.
    // Otherwise, we display shots across the entire vertical field range.
    let yPct = shot.y;
    if (filter === 'both') {
      if (shot.team === 'home') {
        // Bottom half: 50% to 100%
        yPct = 50 + (shot.y / 100) * 50;
      } else {
        // Top half: 0% to 50%
        yPct = (shot.y / 100) * 50;
      }
    }
    const clampedYPct = Math.max(0, Math.min(100, yPct));
    
    // Map to SVG y: 40 is top sideline, 360 is bottom sideline (total height 320)
    const svgY = 40 + (clampedYPct / 100) * 320;

    return { x: svgX, y: svgY };
  };

  // Get color and style details for each shot result
  const getShotStyles = (result: Shot['result']) => {
    switch (result) {
      case 'Goal':
        return {
          fill: '#00ff88',
          stroke: '#ffffff',
          strokeWidth: 3,
          label: 'Gol',
          glow: 'url(#glow-green)',
        };
      case 'SavedShot':
        return {
          fill: '#00d4ff',
          stroke: 'rgba(0, 212, 255, 0.4)',
          strokeWidth: 1.5,
          label: 'Atajado',
          glow: 'url(#glow-blue)',
        };
      case 'BlockedShot':
        return {
          fill: '#ffcc00',
          stroke: 'rgba(255, 204, 0, 0.4)',
          strokeWidth: 1.5,
          label: 'Bloqueado',
          glow: 'url(#glow-yellow)',
        };
      case 'MissedShots':
      default:
        return {
          fill: '#666666',
          stroke: 'rgba(255, 255, 255, 0.2)',
          strokeWidth: 1.5,
          label: 'Desviado',
          glow: 'none',
        };
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-brand-bg-card border border-brand-border/30 rounded-[2rem] p-6 relative overflow-hidden">
      
      {/* Glow ambient background effect */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-brand-green/2 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-brand-blue/2 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Pitch View Column */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        
        {/* Header with control filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-green/10 text-brand-green rounded-xl border border-brand-green/10">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-widest text-brand-text-white">Mapa de Tiros Interactivo</h3>
              <p className="text-[10px] text-brand-text-muted font-mono uppercase tracking-wider mt-0.5">Analizador táctico de disparos y xG</p>
            </div>
          </div>

          {/* Toggle Control Group */}
          <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-xl border border-white/5 shadow-inner">
            <button
              onClick={() => setFilter('both')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                filter === 'both' 
                  ? "bg-brand-blue/15 text-brand-blue border border-brand-blue/20 shadow-md" 
                  : "text-white/45 hover:text-white/80 border border-transparent"
              )}
            >
              <Users className="w-3 h-3" />
              <span>Ambos</span>
            </button>
            <button
              onClick={() => setFilter('home')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                filter === 'home' 
                  ? "bg-brand-green/15 text-brand-green border border-brand-green/20 shadow-md" 
                  : "text-white/45 hover:text-white/80 border border-transparent"
              )}
            >
              {homeTeamName}
            </button>
            <button
              onClick={() => setFilter('away')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                filter === 'away' 
                  ? "bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/20 shadow-md" 
                  : "text-white/45 hover:text-white/80 border border-transparent"
              )}
            >
              {awayTeamName}
            </button>
          </div>
        </div>

        {/* The Soccer Pitch SVG Container */}
        <div className="relative w-full aspect-[1.5] bg-[#0c0c0c] rounded-2xl border border-brand-border/20 overflow-hidden shadow-2xl select-none group">
          
          <svg
            viewBox="0 0 600 400"
            className="w-full h-full"
            onMouseMove={(e) => {
              if (hoveredShot) {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPos({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }
            }}
          >
            {/* Ambient Glow Filters */}
            <defs>
              <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-blue" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-yellow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              {/* Pattern for net background behind goal */}
              <pattern id="goal-net" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M 4 0 L 0 4 M 0 0 L 4 4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
              </pattern>
            </defs>

            {/* Soccer Pitch Markings */}
            {/* Outer Pitch Boundary lines */}
            <rect
              x="50"
              y="40"
              width="500"
              height="320"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Goal Net Background (behind the goal line) */}
            <rect
              x="15"
              y="175"
              width="35"
              height="50"
              fill="url(#goal-net)"
            />

            {/* Portería (3 postes) */}
            <path
              d="M 50 175 L 15 175 L 15 225 L 50 225"
              fill="none"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Halfway line (Línea de medio campo) */}
            <line
              x1="550"
              y1="40"
              x2="550"
              y2="360"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Center Circle Semicircle (Línea de medio campo semicírculo) */}
            <path
              d="M 550 140 A 60 60 0 0 0 550 260"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Penalty Area (Área Grande) */}
            <rect
              x="50"
              y="100"
              width="120"
              height="200"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Penalty Arc (Semicírculo del área grande) */}
            <path
              d="M 170 164.3 A 50 50 0 0 1 170 235.7"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Goal Area (Área Pequeña) */}
            <rect
              x="50"
              y="150"
              width="40"
              height="100"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="2"
            />

            {/* Penalty Spot (Punto de penalti) */}
            <circle
              cx="135"
              cy="200"
              r="3.5"
              fill="rgba(255, 255, 255, 0.4)"
            />

            {/* Horizontal Split Line when viewing "Ambos" */}
            {filter === 'both' && (
              <g>
                <line
                  x1="50"
                  y1="200"
                  x2="550"
                  y2="200"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />
                <text
                  x="540"
                  y="190"
                  fill="rgba(255,255,255,0.2)"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="end"
                  fontWeight="bold"
                >
                  VISITANTE ▲
                </text>
                <text
                  x="540"
                  y="215"
                  fill="rgba(255,255,255,0.2)"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="end"
                  fontWeight="bold"
                >
                  LOCAL ▼
                </text>
              </g>
            )}

            {/* Render shots as circles */}
            {displayedShots.map((shot, i) => {
              const { x, y } = getSVGCoords(shot);
              const styles = getShotStyles(shot.result);
              
              // Map xG to radius: min 6px, max 24px
              const radius = 6 + Math.min(18, shot.xg * 18);

              return (
                <g key={i}>
                  {/* Outer pulse effect for goals */}
                  {shot.result === 'Goal' && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 4}
                      fill="none"
                      stroke="#00ff88"
                      strokeWidth="1.5"
                      className="animate-ping opacity-35"
                      style={{ transformOrigin: `${x}px ${y}px` }}
                    />
                  )}

                  {/* Main Interactive Shot Circle */}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={styles.fill}
                    stroke={styles.stroke}
                    strokeWidth={styles.strokeWidth}
                    filter={styles.glow}
                    className="cursor-pointer transition-all duration-300 hover:scale-125 hover:stroke-white hover:stroke-[3px]"
                    style={{ transformOrigin: `${x}px ${y}px` }}
                    onMouseEnter={(e) => {
                      setHoveredShot(shot);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const parentRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                      if (parentRect) {
                        setTooltipPos({
                          x: rect.left - parentRect.left + rect.width / 2,
                          y: rect.top - parentRect.top - 10,
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredShot(null);
                      setTooltipPos(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Interactive Tooltip Component */}
          <AnimatePresence>
            {hoveredShot && tooltipPos && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bg-black/95 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md pointer-events-none text-xs z-50 min-w-[160px]"
                style={{
                  left: `${tooltipPos.x}px`,
                  top: `${tooltipPos.y - 100}px`, // Place above the circle safely
                  transform: 'translateX(-50%)',
                }}
              >
                {/* Pointer indicator arrow */}
                <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-black border-r border-b border-white/10 rotate-45" />

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center gap-4">
                    <span className="font-black text-white truncate max-w-[120px]">
                      {hoveredShot.player}
                    </span>
                    {hoveredShot.minute !== undefined && (
                      <span className="text-[9px] font-mono font-black px-1.5 py-0.5 bg-white/10 text-white rounded">
                        {hoveredShot.minute}'
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      hoveredShot.team === 'home' ? 'bg-brand-green' : 'bg-brand-yellow'
                    )} />
                    <span className="text-[10px] font-mono text-white/50 uppercase tracking-wide">
                      {hoveredShot.team === 'home' ? homeTeamName : awayTeamName}
                    </span>
                  </div>

                  <div className="border-t border-white/5 pt-1.5 flex justify-between items-center">
                    <span className="text-[10px] text-white/50">Valor xG:</span>
                    <span className="font-mono font-bold text-[#00ff88]">
                      {Math.round(hoveredShot.xg * 100)}%
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/50">Resultado:</span>
                    <span className={cn(
                      "font-black text-[10px] uppercase tracking-wide",
                      hoveredShot.result === 'Goal' && 'text-brand-green',
                      hoveredShot.result === 'SavedShot' && 'text-brand-blue',
                      hoveredShot.result === 'BlockedShot' && 'text-brand-yellow',
                      hoveredShot.result === 'MissedShots' && 'text-white/40'
                    )}>
                      {getShotStyles(hoveredShot.result).label}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Legend Map guide */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
            <span className="text-white/40">Gama:</span>
            <span className="flex items-center gap-1.5 text-brand-green">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-green" /> Gol
            </span>
            <span className="flex items-center gap-1.5 text-brand-blue">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-blue" /> Parado
            </span>
            <span className="flex items-center gap-1.5 text-brand-yellow">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-yellow" /> Bloqueado
            </span>
            <span className="flex items-center gap-1.5 text-white/40">
              <span className="w-2.5 h-2.5 rounded-full bg-white/40" /> Desviado
            </span>
          </div>

          <div className="flex items-center gap-2 text-[9px] text-brand-text-muted font-mono uppercase">
            <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/20" />
            <span>El tamaño del círculo indica la probabilidad xG</span>
          </div>
        </div>
      </div>

      {/* Right Stats Summary Column */}
      <div className="lg:col-span-4 flex flex-col space-y-4 justify-between">
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
            <h4 className="font-black text-[11px] uppercase tracking-widest text-white/60 mb-3 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-brand-green" />
              <span>Resumen de Tiros</span>
            </h4>

            {/* Team Header Labels */}
            <div className="grid grid-cols-3 text-[10px] font-black uppercase tracking-widest text-brand-text-muted border-b border-white/5 pb-2 mb-3">
              <span>Métrica</span>
              <span className="text-right text-brand-green">{homeTeamName}</span>
              <span className="text-right text-brand-yellow">{awayTeamName}</span>
            </div>

            {/* Stats Table Rows */}
            <div className="space-y-3 font-mono">
              {/* Goals */}
              <div className="grid grid-cols-3 text-xs py-1 border-b border-white/[0.02]">
                <span className="text-white/60 font-medium">Goles</span>
                <span className="text-right text-white font-bold">{stats.home.goals}</span>
                <span className="text-right text-white font-bold">{stats.away.goals}</span>
              </div>

              {/* Total Shots */}
              <div className="grid grid-cols-3 text-xs py-1 border-b border-white/[0.02]">
                <span className="text-white/60 font-medium">Tiros Totales</span>
                <span className="text-right text-white font-bold">{stats.home.total}</span>
                <span className="text-right text-white font-bold">{stats.away.total}</span>
              </div>

              {/* Shots on Target */}
              <div className="grid grid-cols-3 text-xs py-1 border-b border-white/[0.02]">
                <span className="text-white/60 font-medium">A Portería</span>
                <span className="text-right text-white font-bold">{stats.home.onTarget}</span>
                <span className="text-right text-white font-bold">{stats.away.onTarget}</span>
              </div>

              {/* xG Total */}
              <div className="grid grid-cols-3 text-xs py-1">
                <span className="text-white/60 font-medium">xG Acumulado</span>
                <span className={cn(
                  "text-right font-bold",
                  stats.home.xg >= stats.away.xg ? 'text-brand-green' : 'text-white/60'
                )}>
                  {stats.home.xg.toFixed(2)}
                </span>
                <span className={cn(
                  "text-right font-bold",
                  stats.away.xg >= stats.home.xg ? 'text-brand-green' : 'text-white/60'
                )}>
                  {stats.away.xg.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Cumulative xG graphic bar */}
          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-brand-text-muted">
              <span>Distribución xG</span>
              <span className="font-mono text-brand-green">
                {(stats.home.xg + stats.away.xg) > 0 
                  ? `${Math.round((stats.home.xg / (stats.home.xg + stats.away.xg)) * 100)}% vs ${Math.round((stats.away.xg / (stats.home.xg + stats.away.xg)) * 100)}%`
                  : '50% vs 50%'}
              </span>
            </div>

            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden flex">
              {stats.home.xg === 0 && stats.away.xg === 0 ? (
                <div className="w-full h-full bg-white/10" />
              ) : (
                <>
                  <div 
                    className="h-full bg-brand-green transition-all duration-500" 
                    style={{ width: `${(stats.home.xg / (stats.home.xg + stats.away.xg)) * 100}%` }}
                  />
                  <div 
                    className="h-full bg-brand-yellow transition-all duration-500" 
                    style={{ width: `${(stats.away.xg / (stats.home.xg + stats.away.xg)) * 100}%` }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tip Advice panel on soccer metrics */}
        <div className="bg-brand-blue/5 border border-brand-blue/10 p-4 rounded-2xl flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
          <div className="text-[10px] leading-relaxed text-brand-blue/80">
            <p className="font-bold uppercase tracking-wider mb-1">Métrica de Probabilidad xG</p>
            <span>Expected Goals (xG) mide la probabilidad de que un disparo termine en gol en base a la distancia, el ángulo, la parte del cuerpo y los defensores circundantes.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
