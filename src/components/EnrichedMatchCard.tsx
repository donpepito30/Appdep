import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Info, Target, Trophy, TrendingUp } from 'lucide-react';
import { Event, Stats } from '../types';
import { TeamLogo } from './TeamLogo';
import { api, logoCache, fallosLogos, nameCache, getImgUrl } from '../services/api';
import { cn } from '../types';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useTeamModal } from '../contexts/TeamModalContext';
import { useMatchStore } from '../hooks/useMatchStore';

export function formatXG(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  if (isNaN(value)) return '—';
  if (value === 0) return '0.0';
  return value.toFixed(1);
}

const TeamLogoPremium = ({ name, logoUrl }: { name: string, logoUrl?: string }) => {
  const [error, setError] = useState(false);
  const initials = (() => {
    if (!name) return '??';
    const parts = name?.split(' ') || [];
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  })();

  if (logoUrl && !error) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden border border-white/5 bg-black/40 flex items-center justify-center shrink-0">
        <img 
          src={logoUrl} 
          alt={name} 
          className="w-8 h-8 object-contain" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-full border border-brand-green/30 bg-brand-green/10 flex items-center justify-center font-display font-medium text-brand-green shrink-0 text-xs shadow-[0_0_8px_rgba(0,255,136,0.15)]">
      <span>{initials}</span>
    </div>
  );
};

interface BadgeData { label: string; conf: string; bgClass: string; stars: string; reasoning?: string; }

interface EnrichedMatchCardProps {
  match: Event;
  isUpcoming: boolean;
  selectedMatchId: string | null;
  setSelectedMatchId: (id: string) => void;
  badgeData: BadgeData | null;
  variant?: 'default' | 'probability';
}

export const EnrichedMatchCard: React.FC<EnrichedMatchCardProps> = memo(({ 
  match, 
  isUpcoming, 
  selectedMatchId, 
  setSelectedMatchId, 
  badgeData,
  variant = 'default' 
}) => {
  const isSelected = selectedMatchId === match.id;
  const { openTeamModal } = useTeamModal();
  const { getMarketProbabilities, v2Predictions, frozenPredictions } = useMatchStore();
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [homeFormStr, setHomeFormStr] = useState<string>('');
  const [awayFormStr, setAwayFormStr] = useState<string>('');
  const [goalStreakText, setGoalStreakText] = useState<string | null>(null);
  const [goalStreakColor, setGoalStreakColor] = useState<string>('');
  const [logos, setLogos] = useState<{ home?: string; away?: string }>({});
  
  const ref = useRef<HTMLButtonElement>(null);
  const entry = useIntersectionObserver(ref, { threshold: 0.1, freezeOnceVisible: true });
  const isInView = !!entry?.isIntersecting;

  useEffect(() => {
    if (!isInView) return;
    
    const abortController = new AbortController();

    const loadData = async () => {
      // 1. Obtener logos reales (usando cache centralizado de api.ts)
      const fetchLogo = async (teamId: string, side: 'home' | 'away', existingLogo?: string) => {
        // Primero: ¿Ya lo tenemos en el cache global como URL proxy?
        const proxyUrl = getImgUrl('team', teamId);
        if (proxyUrl && !fallosLogos.has(teamId)) {
          setLogos(prev => ({ ...prev, [side]: proxyUrl }));
          return;
        }

        // Segundo: Si no hay proxy, ver props o cache
        if (existingLogo) {
          if (!logoCache[teamId]) logoCache[teamId] = existingLogo;
          setLogos(prev => ({ ...prev, [side]: existingLogo }));
          return;
        }

        if (logoCache[teamId]) {
          setLogos(prev => ({ ...prev, [side]: logoCache[teamId]! }));
          return;
        }

        // Tercero: Petición individual solo si no hay rastro ni fallo previo
        if (fallosLogos.has(teamId)) return;
        
        try {
          const t = await api.getTeam(teamId, { signal: abortController.signal });
          const url = t?.logo || t?.logo_url || t?.image_path || null;
          if (url) setLogos(prev => ({ ...prev, [side]: url }));
        } catch (error: any) {
          if (error.name === 'AbortError') return;
          // api.getTeam ya gestiona fallosLogos
        }
      };

      if (match.homeTeamId) fetchLogo(match.homeTeamId, 'home', match.homeLogo);
      if (match.awayTeamId) fetchLogo(match.awayTeamId, 'away', match.awayLogo);

      // Usar nombres cacheados si el actual es genérico
      if (match.homeTeam === 'Unknown Home' && match.homeTeamId && nameCache[match.homeTeamId]) {
        // En este punto, useMatchStore ya debería haber actualizado el prop 'match'
      }

      // 2. Para LIVE: tratar de obtener estadísticas en tiempo real
      if (!isUpcoming && match.status === 'LIVE') {
        try {
          const data = await api.getStats(match.id, undefined, { signal: abortController.signal });
          if (data) setStats(data);
        } catch (error: any) {
          if (error.name === 'AbortError') return;
        }
      }

      // 3. Para UPCOMING o LIVE: Obtener forma y rachas reales
      if (match.homeTeamId || match.awayTeamId) {
        try {
          const [homeFix, awayFix] = await Promise.all([
            match.homeTeamId ? api.getFixtures(match.homeTeamId, 5, 60, { signal: abortController.signal }) : Promise.resolve([]),
            match.awayTeamId ? api.getFixtures(match.awayTeamId, 5, 60, { signal: abortController.signal }) : Promise.resolve([])
          ]);

          let hForm = '';
          let aForm = '';
          let hStats = { w: 0, d: 0, l: 0 };
          let aStats = { w: 0, d: 0, l: 0 };
          let streakM = 0;

          if (homeFix && homeFix.length > 0) {
            hForm = homeFix.map(f => {
              const isHome = String(f.homeTeamId) === match.homeTeamId;
              const gf = isHome ? f.homeScore! : f.awayScore!;
              const ga = isHome ? f.awayScore! : f.homeScore!;
              if (gf > ga) { hStats.w++; return 'W'; }
              if (gf < ga) { hStats.l++; return 'L'; }
              hStats.d++; return 'D';
            }).join('');

            // Calcular racha sin marcar
            let count = 0;
            for (const f of homeFix) {
              const isHome = String(f.homeTeamId) === match.homeTeamId;
              const gf = isHome ? f.homeScore! : f.awayScore!;
              if (gf === 0) count++;
              else break;
            }
            streakM = count;
          }

          if (awayFix && awayFix.length > 0) {
            aForm = awayFix.map(f => {
              const isHome = String(f.homeTeamId) === match.awayTeamId;
              const gf = isHome ? f.homeScore! : f.awayScore!;
              const ga = isHome ? f.awayScore! : f.homeScore!;
              if (gf > ga) { aStats.w++; return 'W'; }
              if (gf < ga) { aStats.l++; return 'L'; }
              aStats.d++; return 'D';
            }).join('');
          }

          setHomeFormStr(`${hStats.w}G ${hStats.d}E ${hStats.l}P|${hForm}`);
          setAwayFormStr(`${aStats.w}G ${aStats.d}E ${aStats.l}P|${aForm}`);
          
          if (streakM >= 2) {
            setGoalStreakText(`🧊 Local lleva ${streakM} partidos sin marcar`);
            setGoalStreakColor('text-brand-red');
          } else if (hForm.startsWith('WWW')) {
            setGoalStreakText(`💥 En racha: 3+ victorias seguidas`);
            setGoalStreakColor('text-brand-green');
          } else {
            setGoalStreakText(null);
          }
        } catch (error: any) {
          if (error.name === 'AbortError') return;
        }
      }
    };

    loadData();
    return () => { abortController.abort(); };
  }, [match.id, isUpcoming, match.status, match.homeTeamId, match.awayTeamId, isInView]);

  const homeXG = match.xgHome !== undefined ? match.xgHome : stats?.xgHome;
  const awayXG = match.xgAway !== undefined ? match.xgAway : stats?.xgAway;
  const possession = stats ? { home: stats.possessionHome, away: stats.possessionAway } : undefined;

  const formatearFechaHora = (isoString: string) => {
    if (!isoString) return "Fecha por confirmar";
    const fecha = new Date(isoString);
    if (isNaN(fecha.getTime())) return "Fecha por confirmar";
    return fecha.toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(',', '');
  };

  const ariaLabel = match.status === 'LIVE' 
    ? `Partido en vivo: ${match.homeTeam} contra ${match.awayTeam}, marcador ${match.homeScore} a ${match.awayScore}, minuto ${match.currentMinute || '?'}`
    : match.status === 'FINISHED'
    ? `Partido finalizado: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`
    : `Próximo partido: ${match.homeTeam} contra ${match.awayTeam}`;

  if (variant === 'probability') {
    const probValue = parseInt(badgeData?.conf || '0');
    return (
      <motion.button
        ref={ref}
        aria-label={ariaLabel}
        whileHover={{ x: 2, scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        onClick={() => setSelectedMatchId(match.id)}
        className={cn(
          "w-full text-left p-4 mb-2 rounded-2xl glass-card transition-all relative border overflow-hidden flex items-center justify-between h-20 group",
          isSelected 
            ? "border-brand-green/40 bg-brand-green/5 ring-1 ring-brand-green/20" 
            : "border-white/5 hover:border-white/10 hover:bg-white/5"
        )}
      >
        <div className={cn(
          "absolute left-0 top-3 bottom-3 w-1 rounded-r-md transition-all duration-300",
          isSelected ? "bg-brand-green shadow-[0_0_8px_#00ff88]" : "bg-transparent group-hover:bg-brand-green/30"
        )} />
        <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
          <div className="flex flex-col items-center justify-center text-[9px] md:text-[10px] font-mono font-bold text-brand-text-muted bg-black/40 w-10 h-10 xs:w-12 xs:h-12 rounded-lg md:rounded-xl border border-white/5 shrink-0">
            <span>{new Date(match.startTime).getHours().toString().padStart(2, '0')}</span>
            <span className="opacity-40 -mt-1">:</span>
            <span>{new Date(match.startTime).getMinutes().toString().padStart(2, '0')}</span>
          </div>
          <div className="flex items-center space-x-2 md:space-x-3 min-w-0">
            <div className="flex -space-x-3 shrink-0">
              <TeamLogo name={match.homeTeam} logoUrl={logos.home || match.homeLogo} size="md" className="w-12 h-12 md:w-14 md:h-14 ring-2 ring-brand-bg-card z-20" />
              <TeamLogo name={match.awayTeam} logoUrl={logos.away || match.awayLogo} size="md" className="w-12 h-12 md:w-14 md:h-14 ring-2 ring-brand-bg-card z-10" />
            </div>
            <div className="truncate flex flex-col min-w-0">
              <span className="text-[9px] md:text-[10px] font-display font-bold text-brand-text-white truncate uppercase tracking-tight notranslate" translate="no">{match.homeTeam}</span>
              <span className="text-[9px] md:text-[10px] font-display font-bold text-brand-text-white truncate uppercase tracking-tight notranslate opacity-60" translate="no">{match.awayTeam}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end justify-center px-4 flex-1 max-w-[35%] text-right">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[8px] font-black text-brand-text-muted uppercase tracking-[0.2em]">{badgeData?.label || 'BTTS'}</span>
            <span className={cn(
              "text-[11px] font-mono font-black",
              probValue >= 75 ? "text-brand-green" : probValue >= 60 ? "text-brand-yellow" : "text-brand-text-muted"
            )}>
              {probValue}%
            </span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: isInView ? `${probValue}%` : 0 }}
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                probValue >= 75 ? "bg-brand-green shadow-[0_0_8px_rgba(74,222,128,0.4)]" : probValue >= 60 ? "bg-brand-yellow" : "bg-brand-text-muted"
              )}
            />
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0 pl-2">
          <div className="text-[11px] font-mono font-black text-brand-green group-hover:scale-110 transition-transform">
            {(match as any).odds_avg ? `@${(match as any).odds_avg.toFixed(2)}` : '—'}
          </div>
          <div className="flex gap-0.5 mt-1">
            {badgeData?.stars.split('').map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-brand-yellow shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
            ))}
          </div>
        </div>
      </motion.button>
    );
  }

  const isLive = match.status === 'LIVE';
  const isFinished = match.status === 'FINISHED';
  const isScheduled = match.status === 'SCHEDULED' || isUpcoming;

  const isToday = (() => {
    try {
      const matchDate = new Date(match.startTime).toDateString();
      const todayDate = new Date().toDateString();
      return matchDate === todayDate;
    } catch {
      return false;
    }
  })();

  const formatMatchTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) {
        return `HOY ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return 'Hoy';
    }
  };

  const leagueLogoUrl = match.leagueId ? getImgUrl('league', match.leagueId) : null;

  const probs = getMarketProbabilities(match);
  const topMarketObj = probs[0]; // { market, label, prob }
  const probValue = Math.round((topMarketObj?.prob || 0) * 100);

  const prediction = frozenPredictions?.[match.id] || v2Predictions.find(p => p.event.id === match.id)?.prediction;
  const isValue = prediction?.recommendations?.value_detected || prediction?.valueAnalysis?.isValue === true || false;

  // Stars and background classes according to specs
  let stars = '⭐';
  let badgeBgClass = 'bg-white/5 text-brand-text-muted border border-white/10';
  if (probValue > 75) {
    stars = '⭐⭐⭐';
    badgeBgClass = 'bg-brand-green/20 text-brand-green border border-brand-green/40';
  } else if (probValue >= 60) {
    stars = '⭐⭐';
    badgeBgClass = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40';
  }

  // Left Border: 3px brand-green if LIVE, brand-blue if next today, transparent if future
  const borderLeftClass = isLive 
    ? "border-l-[3px] !border-l-brand-green" 
    : (isScheduled && isToday) 
      ? "border-l-[3px] !border-l-brand-blue" 
      : "border-l-[3px] !border-l-transparent";

  const showXG = homeXG !== undefined || awayXG !== undefined;
  const hXG = homeXG ?? 0.0;
  const aXG = awayXG ?? 0.0;
  const homeXgPct = (hXG + aXG) > 0 ? (hXG / (hXG + aXG)) * 100 : 50;
  const awayXgPct = 100 - homeXgPct;

  const abbreviateTeamName = (name: string) => {
    if (!name) return "";
    return name.length > 10 ? name.substring(0, 10) + "." : name;
  };

  return (
    <motion.button
      ref={ref}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => setSelectedMatchId(match.id)}
      className={cn(
        "group w-full text-left p-0 mb-4 rounded-2xl glass-card transition-all duration-200 relative border overflow-hidden flex flex-col cursor-pointer",
        borderLeftClass,
        isSelected 
          ? "border-brand-green/30 shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-brand-bg-card/90" 
          : "border-white/5 hover:border-white/10 hover:bg-white/5 shadow-xl"
      )}
    >
      {/* 1. HEADER de la tarjeta */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 md:px-5">
        <div className="flex items-center space-x-2">
          {leagueLogoUrl ? (
            <img 
              src={leagueLogoUrl} 
              alt="" 
              referrerPolicy="no-referrer"
              className="w-6 h-6 object-contain opacity-75 shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <Trophy className="w-4 h-4 text-brand-text-muted select-none" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted truncate max-w-[150px] xs:max-w-none">
            {match.leagueName}
          </span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isLive ? (
            <>
              <span className="text-xs font-mono font-bold text-brand-green flex items-center">
                {match.currentMinute || '45'}'
                <span className="relative flex h-2 w-2 ml-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green"></span>
                </span>
              </span>
              <span className="bg-brand-red text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1 shadow-[0_0_8px_rgba(255,51,68,0.3)] animate-pulse">
                LIVE
              </span>
            </>
          ) : isFinished ? (
            <span className="text-xs font-mono font-bold text-brand-text-muted bg-neutral-800/40 px-2 py-0.5 rounded border border-white/5 uppercase">
              Finalizado
            </span>
          ) : (
            <span className="text-xs font-mono font-bold text-brand-blue bg-brand-blue/10 px-2.5 py-0.5 rounded border border-brand-blue/20 uppercase tracking-tight">
              {formatMatchTime(match.startTime)}
            </span>
          )}
        </div>
      </div>

      {/* 2. CUERPO central */}
      <div className="flex items-center justify-between px-3 py-3 md:px-4 md:py-4 w-full">
        {/* Home Team */}
        <div className="flex items-center space-x-2.5 flex-1 min-w-0 justify-start">
          <TeamLogoPremium name={match.homeTeam} logoUrl={logos.home || match.homeLogo} />
          <span className="font-bold text-sm text-brand-text-white" translate="no">
            {abbreviateTeamName(match.homeTeam)}
          </span>
        </div>

        {/* Score/Time block */}
        {isLive || isFinished ? (
          <div className="flex items-center space-x-1 shrink-0 px-2.5">
            <span className={cn("text-lg font-black font-mono tracking-tight", isLive ? "text-brand-green" : "text-brand-text-white")}>
              {match.homeScore}
            </span>
            <span className="text-white/10 text-xs select-none">───</span>
            <span className={cn("text-lg font-black font-mono tracking-tight", isLive ? "text-brand-green" : "text-brand-text-white")}>
              {match.awayScore}
            </span>
          </div>
        ) : (
          <div className="text-xs font-semibold text-brand-text-white bg-white/5 px-2 py-0.5 rounded-full border border-white/10 shrink-0 mx-2 font-mono">
            {new Date(match.startTime).getHours().toString().padStart(2, '0')}:{new Date(match.startTime).getMinutes().toString().padStart(2, '0')}
          </div>
        )}

        {/* Away Team */}
        <div className="flex items-center space-x-2.5 flex-1 min-w-0 justify-end text-right">
          <span className="font-bold text-sm text-brand-text-white" translate="no">
            {abbreviateTeamName(match.awayTeam)}
          </span>
          <TeamLogoPremium name={match.awayTeam} logoUrl={logos.away || match.awayLogo} />
        </div>
      </div>

      {/* 3. BARRA xG comparativa (solo si hay datos xG) */}
      {showXG && (
        <div className="flex items-center gap-1 text-xs w-full px-4 pb-4 md:px-5">
          <span className="text-brand-green font-mono w-8 text-right">
            {formatXG(homeXG)}
          </span>
          <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-white/5">
            <div className="bg-brand-green" 
                 style={{ width: `${homeXgPct}%` }}></div>
            <div className="bg-blue-400" 
                 style={{ width: `${awayXgPct}%` }}></div>
          </div>
          <span className="text-blue-400 font-mono w-8">
            {formatXG(awayXG)}
          </span>
        </div>
      )}

      {/* 4. FOOTER de la tarjeta */}
      <div className="flex items-center justify-between border-t border-white/5 px-4 py-2.5 md:px-5 bg-black/15">
        {/* Left: Top market badge with probability + stars */}
        <div className="flex items-center space-x-2">
          <span className="text-xs shrink-0 select-none">{stars}</span>
          <span className={cn("text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded border inline-flex items-center gap-1", badgeBgClass)}>
            <span>{topMarketObj?.label || 'BTTS'} ·</span>
            <span className="font-mono">{probValue}%</span>
          </span>
        </div>

        {/* Right: Value badge */}
        {isValue && (
          <span className="flex items-center space-x-1.5 shrink-0 bg-brand-green/10 text-brand-green border border-brand-green/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(0,255,136,0.1)]">
            <span>💡</span>
            <span>Valor</span>
          </span>
        )}
      </div>
    </motion.button>
  );

});
