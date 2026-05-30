import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Info, Target, TrendingUp } from 'lucide-react';
import { Event, Stats } from '../types';
import { TeamLogo } from './TeamLogo';
import { api, logoCache, fallosLogos, nameCache, getImgUrl } from '../services/api';
import { cn } from '../types';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { useTeamModal } from '../contexts/TeamModalContext';

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

  return (
    <motion.button
      ref={ref}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.002 }}
      whileTap={{ scale: 0.998 }}
      onClick={() => setSelectedMatchId(match.id)}
      className={cn(
        "group w-full text-left p-0 mb-4 rounded-[2rem] glass-card transition-all relative border overflow-hidden",
        isSelected 
          ? "border-brand-green/30 shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-brand-bg-card/90" 
          : "border-white/5 hover:border-white/10 hover:bg-white/5 shadow-xl"
      )}
    >
      <div className="p-4 md:p-6 pb-2.5 md:pb-4">
        <div className="flex justify-between items-center gap-2.5 md:gap-4">
          <div className="flex flex-col items-center gap-1.5 md:gap-3 flex-1 min-w-0">
             <div className="w-16 h-16 xs:w-20 xs:h-20 bg-black/30 rounded-xl md:rounded-2xl p-1.5 md:p-2.5 border border-white/5 relative group-hover:scale-110 transition-transform duration-500">
                <TeamLogo name={match.homeTeam} logoUrl={logos.home || match.homeLogo} size="lg" className="w-full h-full object-contain" />
             </div>
             <span className="text-[8px] xs:text-[10px] font-display font-black text-center text-brand-text-white uppercase tracking-tighter leading-tight truncate w-full" translate="no">{match.homeTeam}</span>
          </div>

          <div className="flex flex-col items-center justify-center min-w-[70px] md:min-w-[80px]">
             {isUpcoming && match.status === 'SCHEDULED' ? (
                <div className="text-[8px] md:text-[10px] font-mono font-bold text-brand-text-muted bg-white/5 px-2 py-0.5 md:px-3 md:py-1 rounded-full border border-white/10">
                   {new Date(match.startTime).getHours().toString().padStart(2, '0')}:{new Date(match.startTime).getMinutes().toString().padStart(2, '0')}
                </div>
             ) : (
                <div className="flex flex-col items-center">
                   <div className="flex items-center gap-1.5 md:gap-2 text-2xl md:text-3xl font-mono font-black text-brand-text-white tracking-tighter">
                      <span className={cn(match.homeScore > match.awayScore ? "text-brand-green" : "")}>{match.homeScore}</span>
                      <span className="text-white/20 text-xl md:text-xl md:mx-0">:</span>
                      <span className={cn(match.awayScore > match.homeScore ? "text-brand-green" : "")}>{match.awayScore}</span>
                   </div>
                   {match.status === 'LIVE' && (
                     <div className="bg-brand-green/10 px-1.5 py-0.5 rounded border border-brand-green/20 mt-0.5">
                        <span className="text-[7px] md:text-[8px] font-mono font-black text-brand-green animate-pulse">
                          LIVE {match.currentMinute}'
                        </span>
                     </div>
                   )}
                </div>
             )}
          </div>

          <div className="flex flex-col items-center gap-1.5 md:gap-3 flex-1 min-w-0">
             <div className="w-16 h-16 xs:w-20 xs:h-20 bg-black/30 rounded-xl md:rounded-2xl p-1.5 md:p-2.5 border border-white/5 relative group-hover:scale-110 transition-transform duration-500">
                <TeamLogo name={match.awayTeam} logoUrl={logos.away || match.awayLogo} size="lg" className="w-full h-full object-contain" />
             </div>
             <span className="text-[8px] xs:text-[10px] font-display font-black text-center text-brand-text-white uppercase tracking-tighter leading-tight truncate w-full" translate="no">{match.awayTeam}</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-black/20 border-t border-white/5 space-y-3">
        {!isUpcoming && match.status === 'LIVE' && (
          <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
             <motion.div 
               className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#fff] z-10"
               animate={{ left: `${50 + ((stats?.momentum_score || 0) / 2)}%` }}
               transition={{ type: "spring", damping: 15 }}
             />
             <div className="absolute inset-0 bg-gradient-to-r from-brand-red/20 via-transparent to-brand-green/20" />
          </div>
        )}

        <div className="flex items-center justify-between text-[8px] font-mono font-bold text-brand-text-muted px-1">
           <div className="flex gap-1">
              {(homeFormStr.split('|')[1] || '').split('').map((f, i) => (
                <div key={i} className={cn("w-1.5 h-1.5 rounded-full", f === 'W' ? "bg-brand-green" : f === 'L' ? "bg-brand-red" : "bg-brand-yellow")} />
              ))}
           </div>
           
           <div className="uppercase tracking-[0.2em]">
              {isUpcoming ? formatearFechaHora(match.startTime) : (match.status === 'FINISHED' ? 'Finalizado' : 'En Curso')}
           </div>

           <div className="flex gap-1">
              {(awayFormStr.split('|')[1] || '').split('').map((f, i) => (
                <div key={i} className={cn("w-1.5 h-1.5 rounded-full", f === 'W' ? "bg-brand-green" : f === 'L' ? "bg-brand-red" : "bg-brand-yellow")} />
              ))}
           </div>
        </div>
      </div>

      {badgeData && (
        <div className={cn(
          "absolute top-2.5 right-2.5 md:top-4 md:right-4 px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg md:rounded-xl text-[7px] xs:text-[9px] font-black uppercase tracking-widest border shadow-lg",
          badgeData.bgClass === 'bg-brand-green text-black' 
            ? "bg-brand-green/20 border-brand-green/30 text-brand-green" 
            : "bg-brand-yellow/20 border-brand-yellow/30 text-brand-yellow"
        )}>
          {badgeData.label} <span className="hidden xs:inline">{badgeData.stars}</span>
        </div>
      )}
    </motion.button>
  );

});
