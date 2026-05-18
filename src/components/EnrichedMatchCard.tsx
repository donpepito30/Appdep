import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Info } from 'lucide-react';
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
        whileHover={{ y: -1, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setSelectedMatchId(match.id)}
        className={cn(
          "w-full text-left p-4 mb-2 rounded-xl glass-card transition-all relative border overflow-hidden flex items-center justify-between h-20",
          isSelected 
            ? "border-brand-green/50 bg-brand-green/5 shadow-lg" 
            : "border-brand-border/30 hover:border-brand-green/30 hover:bg-white/5 shadow-sm"
        )}
      >
        {/* Left: Time + Logos + Names */}
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className="text-[9px] font-mono text-brand-text-muted shrink-0 bg-brand-bg-primary/50 px-2 py-1 rounded border border-white/5">
            {new Date(match.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="flex items-center space-x-3 min-w-0">
            <div className="flex -space-x-5 shrink-0 z-10">
              <div className="relative group/logo cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: logos.home || match.homeLogo, leagueId: match.leagueId }); }}>
                <TeamLogo name={match.homeTeam} logoUrl={logos.home || match.homeLogo} size="md" className="ring-2 ring-brand-bg-secondary group-hover/logo:scale-110 transition-transform" />
              </div>
              <div className="relative group/logo cursor-pointer" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: logos.away || match.awayLogo, leagueId: match.leagueId }); }}>
                <TeamLogo name={match.awayTeam} logoUrl={logos.away || match.awayLogo} size="md" className="ring-2 ring-brand-bg-secondary group-hover/logo:scale-110 transition-transform" />
              </div>
            </div>
            <div className="truncate flex flex-col">
              <span className="text-[9px] font-bold text-brand-text-white truncate uppercase tracking-tighter leading-none notranslate" translate="no">{match.homeTeam}</span>
              <span className="text-[9px] font-bold text-brand-text-white truncate uppercase tracking-tighter leading-none mt-1 notranslate" translate="no">{match.awayTeam}</span>
            </div>
          </div>
        </div>

        {/* Center: Market + Prob + Progress */}
        <div className="flex flex-col items-center justify-center px-4 flex-1 max-w-[40%]">
          <div className="flex items-center justify-between w-full mb-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[8px] font-black text-brand-text-muted uppercase tracking-widest truncate">{badgeData?.label || 'BTTS'}</span>
              {badgeData?.reasoning && (
                <div title={badgeData.reasoning} className="shrink-0">
                  <Info className="w-2.5 h-2.5 text-brand-blue opacity-60" />
                </div>
              )}
            </div>
            <span className={cn(
              "text-[9px] font-mono font-black",
              probValue >= 70 ? "text-brand-green" : probValue >= 50 ? "text-brand-yellow" : "text-brand-text-muted"
            )}>
              {badgeData?.conf || '0%'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-brand-bg-primary rounded-full overflow-hidden border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: isInView ? `${probValue}%` : 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full relative",
                probValue >= 70 ? "bg-brand-green" : probValue >= 50 ? "bg-brand-yellow" : "bg-brand-text-muted"
              )}
            >
               {probValue >= 70 && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
            </motion.div>
          </div>
        </div>

        {/* Right: Odds + Stars */}
        <div className="flex flex-col items-end shrink-0 space-y-1.5 pl-2">
          <div className="text-[10px] font-mono font-black text-brand-green bg-brand-green/5 px-1.5 py-0.5 rounded border border-brand-green/10">
            {(match as any).odds_avg ? `@${(match as any).odds_avg.toFixed(2)}` : 'INC'}
          </div>
          <div className="flex space-x-0.5">
            {badgeData?.stars.split('').map((s, i) => (
              <div 
                key={i} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  s === '⭐' ? "bg-brand-yellow shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "bg-white/5"
                )} 
              />
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
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => setSelectedMatchId(match.id)}
      className={cn(
        "group w-full text-left p-4 mb-3 rounded-2xl glass-card transition-all relative border overflow-hidden",
        isSelected 
          ? "border-brand-green/50 bg-brand-green/5 shadow-[0_10px_30px_rgba(78,222,163,0.1)]" 
          : "border-brand-border/30 hover:border-brand-green/30 hover:bg-white/5 shadow-md font-sans"
      )}
    >
      <div className="flex justify-between items-center mb-3 w-full">
        <div className="flex flex-row md:flex-col items-center flex-1 min-w-0 gap-3 md:gap-0 justify-start">
          <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-brand-bg-primary rounded-2xl flex items-center justify-center p-1.5 md:p-2 shadow-inner border border-brand-border/30 shrink-0 md:mb-3 transition-transform hover:scale-110 cursor-pointer relative group/logo" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: logos.home || match.homeLogo, leagueId: match.leagueId }); }}>
            <TeamLogo name={match.homeTeam} logoUrl={logos.home || match.homeLogo} size="lg" className="w-full h-full object-contain filter brightness-110" />
          </div>
          <span 
            className="text-[10px] sm:text-xs md:font-black text-left md:text-center text-brand-text-white uppercase tracking-tight truncate w-full px-1 notranslate font-semibold hover:text-brand-green cursor-pointer transition-colors" 
            translate="no"
            onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.homeTeamId, name: match.homeTeam, logo: logos.home || match.homeLogo, leagueId: match.leagueId }); }}
          >{match.homeTeam}</span>
        </div>
        
        <div className="flex flex-col items-center px-2 shrink-0">
          {isUpcoming && match.status === 'SCHEDULED' ? (
             <div className="text-[9px] font-black text-brand-text-muted bg-brand-bg-secondary/50 px-2 py-0.5 rounded-full border border-brand-border/30">
               VS
             </div>
          ) : (
             <div className="flex flex-col items-center">
               <div className="flex items-center space-x-1 sm:space-x-2 text-xl sm:text-2xl font-black text-brand-text-white tracking-tighter italic">
                 <span className={cn(match.homeScore > match.awayScore ? "text-brand-green" : "text-brand-text-white")}>{match.homeScore}</span>
                 <span className="text-brand-text-muted text-sm sm:text-lg font-light">-</span>
                 <span className={cn(match.awayScore > match.homeScore ? "text-brand-green" : "text-brand-text-white")}>{match.awayScore}</span>
               </div>
               {match.status === 'LIVE' && (
                 <span className="text-[8px] font-mono font-black text-brand-green animate-pulse mt-0.5">
                   {match.currentMinute}'{match.addedTime ? `+${match.addedTime}` : ''}
                 </span>
               )}
             </div>
          )}
        </div>

        <div className="flex flex-row-reverse md:flex-col items-center flex-1 min-w-0 gap-3 md:gap-0 justify-start text-right">
          <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-brand-bg-primary rounded-2xl flex items-center justify-center p-1.5 md:p-2 shadow-inner border border-brand-border/30 shrink-0 md:mb-3 transition-transform hover:scale-110 cursor-pointer relative group/logo" onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: logos.away || match.awayLogo, leagueId: match.leagueId }); }}>
            <TeamLogo name={match.awayTeam} logoUrl={logos.away || match.awayLogo} size="lg" className="w-full h-full object-contain filter brightness-110" />
          </div>
          <span 
            className="text-[10px] sm:text-xs md:font-black text-right md:text-center text-brand-text-white uppercase tracking-tight truncate w-full px-1 notranslate font-semibold hover:text-brand-green cursor-pointer transition-colors" 
            translate="no"
            onClick={(e) => { e.stopPropagation(); openTeamModal({ id: match.awayTeamId, name: match.awayTeam, logo: logos.away || match.awayLogo, leagueId: match.leagueId }); }}
          >{match.awayTeam}</span>
        </div>
      </div>

      {/* Stats e Indicadores */}
      <div className="bg-brand-bg-secondary/50 rounded-xl p-3 space-y-2 border border-brand-border/20">
        {(homeXG !== undefined || awayXG !== undefined) && !isUpcoming && (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[8px] font-black text-brand-text-muted uppercase px-0.5 tracking-widest">
              <span>xG {(homeXG || 0).toFixed(2)}</span>
              <span className="hidden md:inline">Análisis Táctico</span>
              <span>xG {(awayXG || 0).toFixed(2)}</span>
            </div>
            <div className="flex h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((homeXG || 0.1) / (((homeXG || 0.1) + (awayXG || 0.1)))) * 100}%` }}
                className="bg-brand-green shadow-[0_0_8px_rgba(78,222,163,0.5)] h-full" 
              />
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((awayXG || 0.1) / (((homeXG || 0.1) + (awayXG || 0.1)))) * 100}%` }}
                className="bg-brand-red shadow-[0_0_8px_rgba(255,122,115,0.5)] h-full" 
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex flex-col items-start">
            <div className="text-[7px] text-brand-text-muted font-bold uppercase mb-1">{homeFormStr.split('|')[0] || ''}</div>
            <div className="flex items-center space-x-1">
              {(homeFormStr.split('|')[1] || '').split('').map((f, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-2 h-2 rounded-full",
                    f === 'W' ? "bg-brand-green" : f === 'L' ? "bg-brand-red" : "bg-brand-yellow"
                  )} 
                />
              ))}
            </div>
          </div>
          
          <div className="text-[8px] text-brand-text-muted font-mono bg-black/20 px-2 py-0.5 rounded border border-brand-border/30">
             {isUpcoming ? formatearFechaHora(match.startTime) : (match.status === 'FINISHED' ? 'FINALIZADO' : 'EN JUEGO')}
          </div>

          <div className="flex flex-col items-end">
            <div className="text-[7px] text-brand-text-muted font-bold uppercase mb-1">{awayFormStr.split('|')[0] || ''}</div>
            <div className="flex items-center space-x-1">
              {(awayFormStr.split('|')[1] || '').split('').map((f, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-2 h-2 rounded-full",
                    f === 'W' ? "bg-brand-green" : f === 'L' ? "bg-brand-red" : "bg-brand-yellow"
                  )} 
                />
              ))}
            </div>
          </div>
        </div>
        
        {goalStreakText && (
          <div className={cn("text-[8px] font-bold text-center py-1 rounded-lg bg-black/20 border border-brand-border/30", goalStreakColor)}>
            {goalStreakText}
          </div>
        )}
      </div>

      {badgeData && (
        <div className={cn(
          "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-bold uppercase tracking-widest shadow-lg border-l border-b border-white/10",
          badgeData.bgClass
        )}>
          {badgeData.label} {badgeData.stars}
        </div>
      )}
    </motion.button>
  );
});
