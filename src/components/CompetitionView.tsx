import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Globe, TrendingUp, Info, X, Target, Shield, Zap, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, logoCache, getImgUrl } from '../services/api';
import { Competition, cn } from '../types';
import { TableRowSkeleton, Skeleton } from './Skeleton';
import { Footer } from './Footer';
import { useTeamModal } from '../contexts/TeamModalContext';

interface LeagueDetails { current_season?: { id: number; name?: string }; all_seasons?: { id: number; name: string }[]; }
interface StandingEntry { position?: number; rank?: number; team_id?: string; id?: string; team?: { id?: string; name?: string; logo?: string }; team_name?: string; team_logo?: string; name?: string; logo?: string; image_path?: string; played?: number; won?: number; drawn?: number; lost?: number; gf?: number; goals_for?: number; ga?: number; goals_against?: number; pts?: number; points?: number; form?: string; xg?: number; xga?: number; overall?: { played?: number; won?: number; draw?: number; lost?: number; goals_for?: number; goals_against?: number }; }
interface FixtureEntry { id?: string; homeTeam?: string; awayTeam?: string; homeTeamId?: string; awayTeamId?: string; homeScore?: number; awayScore?: number; startTime?: string; date?: string; }

const curatedLeagues: Competition[] = [
  { id: "8", name: "Premier League", country: "England", logoUrl: getImgUrl('league', '8') || "https://media.api-sports.io/football/leagues/39.png", teams: [] },
  { id: "18", name: "La Liga", country: "Spain", logoUrl: getImgUrl('league', '18') || "https://media.api-sports.io/football/leagues/140.png", teams: [] },
  { id: "23", name: "Serie A", country: "Italy", logoUrl: getImgUrl('league', '23') || "https://media.api-sports.io/football/leagues/135.png", teams: [] },
  { id: "15", name: "Bundesliga", country: "Germany", logoUrl: getImgUrl('league', '15') || "https://media.api-sports.io/football/leagues/78.png", teams: [] },
  { id: "11", name: "Ligue 1", country: "France", logoUrl: getImgUrl('league', '11') || "https://media.api-sports.io/football/leagues/61.png", teams: [] },
  { id: "16", name: "Primeira Liga", country: "Portugal", logoUrl: getImgUrl('league', '16') || "https://media.api-sports.io/football/leagues/94.png", teams: [] },
  { id: "14", name: "Eredivisie", country: "Netherlands", logoUrl: getImgUrl('league', '14') || "https://media.api-sports.io/football/leagues/88.png", teams: [] },
  { id: "123", name: "LigaPro Ecuador", country: "Ecuador", logoUrl: getImgUrl('league', '123') || "https://media.api-sports.io/football/leagues/290.png", teams: [] },
  { id: "34", name: "Copa Libertadores", country: "International", logoUrl: getImgUrl('league', '34') || "https://media.api-sports.io/football/leagues/13.png", teams: [] },
  { id: "157", name: "Major League Soccer", country: "USA", logoUrl: getImgUrl('league', '157') || "https://media.api-sports.io/football/leagues/253.png", teams: [] }
];

export function CompetitionView() {
  const [allLeagues, setAllLeagues] = useState<Competition[]>(curatedLeagues);
  const [selectedLeague, setSelectedLeague] = useState<Competition>(curatedLeagues[0]);
  const [leagueDetails, setLeagueDetails] = useState<LeagueDetails | null>(null);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const { openTeamModal } = useTeamModal();

  // 1. Cargar todas las ligas disponibles de la API al montar
  useEffect(() => {
    async function fetchLeagues() {
      try {
        const leagues = await api.getLeagues();
        if (leagues && leagues.length > 0) {
          const curatedIds = curatedLeagues.map(l => l.id);
          const others = leagues.filter(l => !curatedIds.includes(l.id));
          setAllLeagues([...leagues.filter(l => curatedIds.includes(l.id)), ...others]);
        }
      } catch (err) {
        // Silent error fetching leagues
      }
    }
    fetchLeagues();
  }, []);

  // 2. Efecto para cargar detalles de liga y resetear temporada al cambiar de liga
  useEffect(() => {
    if (!selectedLeague) return;
    let active = true;
    async function loadLeagueMeta() {
      try {
        const details = await api.getLeagueDetails(selectedLeague.id);
        if (active && details) {
          setLeagueDetails(details);
          if (details.current_season) {
            setSelectedSeasonId(String(details.current_season.id));
          }
        }
      } catch (err) {
        // Silent error loading league meta
      }
    }
    loadLeagueMeta();
    return () => { active = false; };
  }, [selectedLeague.id]);

  // 3. Efecto para cargar clasificaciones cuando cambia la liga o la temporada
  useEffect(() => {
    if (!selectedLeague.id) return;
    let active = true;
    async function loadStandings() {
      setLoadingStandings(true);
      try {
        const data = await api.getStandings(selectedLeague.id, selectedSeasonId || undefined);
        if (active) {
          setStandings(data || []);
          if (data && Array.isArray(data)) {
            data.forEach((team: StandingEntry) => {
              const teamId = String(team.team_id || team.id || team.team?.id);
              const logo = team.team_logo || team.team?.logo || team.logo || team.image_path;
              if (teamId && logo && !logoCache[teamId]) {
                logoCache[teamId] = logo;
              }
            });
          }
        }
      } catch (err) {
        // Silent error loading standings
      } finally {
        if (active) setLoadingStandings(false);
      }
    }
    loadStandings();
    return () => { active = false; };
  }, [selectedLeague.id, selectedSeasonId]);

  // Cálculo de métricas agregadas reales
  const metrics = React.useMemo(() => {
    if (!standings || standings.length === 0) return { avgXG: 'N/A', efficiency: 'N/A', avgGoals: 'N/A', avgShots: 'N/D' };
    
    let totalXG = 0;
    let totalGoals = 0;
    let totalPlayed = 0;
    let teamsWithXG = 0;
    
    standings.forEach(t => {
      const played = t.played ?? t.overall?.played ?? 0;
      const xg = t.xg || 0;
      const goals = t.gf ?? t.goals_for ?? t.overall?.goals_for ?? 0;
      
      totalPlayed += played;
      totalGoals += goals;
      
      if (xg > 0) {
        totalXG += xg;
        teamsWithXG++;
      }
    });
    
    return {
      avgXG: teamsWithXG > 0 ? (totalXG / teamsWithXG).toFixed(2) : 'N/A',
      avgGoals: totalPlayed > 0 ? (totalGoals / totalPlayed).toFixed(2) : 'N/A',
      efficiency: (totalXG > 0) ? (totalGoals / totalXG).toFixed(2) : 'N/A',
      avgShots: 'N/D' // Not typically available in standings endpoint
    };
  }, [standings]);

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full">
      {/* League Selector */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-brand-border bg-brand-bg-primary/30 overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto flex flex-row md:flex-col shrink-0 touch-scroll-x md:touch-scroll">
        <div className="p-4 space-y-4 w-full flex-none w-auto md:w-full min-w-max md:min-w-0">
          <div className="relative group sticky left-4 md:static z-10 w-48 md:w-full">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted group-focus-within:text-brand-green transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar liga..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-bg-card border border-brand-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-brand-text-white focus:outline-none focus:ring-1 focus:ring-brand-green/50 transition-all"
            />
          </div>

          <div className="md:space-y-1 flex flex-row md:flex-col space-x-2 md:space-x-0">
            <h3 className="hidden md:block text-[10px] text-brand-text-muted font-bold uppercase tracking-widest px-2 mb-2 mt-4">Competiciones</h3>
            {(searchQuery ? allLeagues.filter(l => (l.name || '').toLowerCase().includes(searchQuery.toLowerCase())) : allLeagues).map(league => (
              <button
                key={league.id}
                onClick={() => setSelectedLeague(league)}
                className={cn(
                  "shrink-0 w-48 md:w-full text-left p-2 md:p-3 rounded-xl transition-all flex items-center space-x-3 group",
                  selectedLeague.id === league.id 
                    ? "bg-brand-green/10 border border-brand-green/20 ring-1 ring-brand-green/50" 
                    : "border border-transparent hover:bg-brand-bg-hover"
                )}
              >
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-brand-border group-hover:border-brand-green/20 overflow-hidden shrink-0">
                  {league.logoUrl ? (
                    <img src={league.logoUrl} alt={league.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Trophy className={cn("w-4 h-4", selectedLeague.id === league.id ? "text-brand-green" : "text-brand-text-muted")} />
                  )}
                </div>
                <div className="min-w-0 notranslate" translate="no">
                  <p className="text-xs font-bold text-brand-text-white truncate">{league.name}</p>
                  <p className="text-[9px] text-brand-text-muted uppercase tracking-tighter truncate">{league.country}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Standings Table */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 touch-scroll pb-24 h-full">
        <AnimatePresence mode="wait">
          {selectedLeague && (
            <motion.div
              key={selectedLeague.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center space-x-4">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center border-2 border-brand-border shadow-lg p-2 overflow-hidden shrink-0">
                      {selectedLeague.logoUrl ? (
                        <img src={selectedLeague.logoUrl} alt={selectedLeague.name} className="w-full h-full object-contain" />
                      ) : (
                        <Trophy className="w-8 h-8 text-brand-text-muted" />
                      )}
                   </div>
                   <div className="notranslate" translate="no">
                      <h2 className="text-2xl md:text-3xl font-black text-brand-text-white tracking-widest uppercase italic">{selectedLeague.name}</h2>
                      <p className="text-brand-green text-[10px] font-black tracking-[0.2em] flex items-center mt-1 uppercase italic">
                         <Globe className="w-3 h-3 mr-2" />
                         {selectedLeague.country}
                      </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {leagueDetails?.all_seasons && leagueDetails.all_seasons.length > 0 && (
                    <div className="relative group">
                      <select 
                        value={selectedSeasonId}
                        onChange={(e) => setSelectedSeasonId(e.target.value)}
                        className="bg-brand-bg-card border border-brand-border rounded-xl px-4 py-2.5 text-xs font-bold text-brand-text-white focus:outline-none focus:ring-1 focus:ring-brand-green appearance-none pr-10 cursor-pointer min-w-[140px]"
                      >
                        {leagueDetails.all_seasons.map((s: { id: number; name: string }) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <History className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted pointer-events-none" />
                    </div>
                  )}

                  <div className="flex items-center space-x-3 glass-card px-4 py-2.5 rounded-xl border border-brand-border/30">
                    <div className="text-right">
                      <p className="text-[8px] text-brand-text-muted uppercase font-black tracking-[0.2em]">Live Status</p>
                      <p className="text-[10px] text-brand-green font-black uppercase tracking-widest">Active</p>
                    </div>
                    <div className="w-2 h-2 bg-brand-green rounded-full animate-pulse shadow-[0_0_10px_rgba(78,222,163,0.8)]" />
                  </div>
                </div>
              </div>

               <div className="glass-card rounded-[2rem] border border-brand-border overflow-hidden shadow-2xl relative min-h-[400px]">
                 {loadingStandings ? (
                   <div className="p-1 space-y-1">
                     {[...Array(10)].map((_, i) => (
                       <TableRowSkeleton key={i} />
                     ))}
                   </div>
                 ) : (
                   <>
                     <div className="hidden md:block">
                       <div className="tabla-wrapper">
                         <table className="w-full text-left min-w-[600px]">
                         <thead>
                           <tr className="text-[10px] text-brand-text-muted uppercase font-black tracking-[0.2em] border-b border-brand-border bg-brand-bg-primary/80 italic">
                         <th className="p-4 w-16 text-center">#</th>
                         <th className="p-4">Squad / Organization</th>
                         <th className="p-4 text-center">GP</th>
                         <th className="p-4 text-center">W</th>
                         <th className="p-4 text-center">D</th>
                         <th className="p-4 text-center">L</th>
                         <th className="p-4 text-center hidden md:table-cell">GF</th>
                         <th className="p-4 text-center hidden md:table-cell">GA</th>
                         <th className="p-4 text-center">PTS</th>
                         <th className="p-4 text-center">Last 5 Form</th>
                       </tr>
                     </thead>
                    <tbody className="text-sm">
                      {standings?.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-12 text-center text-brand-text-muted">
                            <p>No se encontraron datos de clasificación para esta liga.</p>
                          </td>
                        </tr>
                      ) : (
                        standings?.map((team, i) => {
                          const pos = team.position || team.rank || (i + 1);
                          const name = team.team_name || team.team?.name || team.name || `Equipo ${i+1}`;
                          const logo = team.team_logo || team.team?.logo || team.logo || team.image_path;
                          
                          const played = team.played ?? team.overall?.played ?? 0;
                          const won = team.won ?? team.overall?.won ?? 0;
                          const drawn = team.drawn ?? team.overall?.draw ?? 0;
                          const lost = team.lost ?? team.overall?.lost ?? 0;
                          const gf = team.gf ?? team.goals_for ?? team.overall?.goals_for ?? 0;
                          const ga = team.ga ?? team.goals_against ?? team.overall?.goals_against ?? 0;
                          const pts = team.pts ?? team.points ?? 0;
                          
                          let formArray: string[] = [];
                          if (typeof team.form === 'string') {
                            formArray = team.form.split('').filter(char => ['W', 'D', 'L'].includes(char));
                          } else if (Array.isArray(team.form)) {
                            formArray = team.form;
                          }

                          return (
                          <motion.tr 
                            key={team.team_id || team.id || i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => openTeamModal(team)}
                            className="border-b border-brand-border/50 last:border-0 hover:bg-brand-bg-hover/80 transition-all cursor-pointer group/row relative"
                          >
                            <td className="p-3 text-center">
                               <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-green scale-y-0 group-hover/row:scale-y-100 transition-transform origin-center" />
                               <span className={cn(
                                 "w-6 h-6 mx-auto flex items-center justify-center rounded-md font-display font-bold text-[10px]",
                                 pos === 1 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" : 
                                 pos <= 4 ? "bg-brand-green/20 text-brand-green border border-brand-green/30" : 
                                 "text-brand-text-muted"
                               )}>
                                 {pos}
                               </span>
                            </td>
                            <td className="p-3">
                               <div className="flex items-center space-x-3">
                                 <div className="w-6 h-6 bg-white rounded flex items-center justify-center overflow-hidden shrink-0 border border-brand-border shadow-sm group-hover/row:scale-110 transition-transform">
                                    {(getImgUrl('team', team.team_id || team.id || team.team?.id) || logo) ? (
                                      <img src={getImgUrl('team', team.team_id || team.id || team.team?.id) || logo} alt={name} className="w-full h-full object-contain p-0.5" />
                                    ) : (
                                      <span className="text-[10px] text-gray-400 font-bold">{name.substring(0, 2).toUpperCase()}</span>
                                    )}
                                 </div>
                                 <span className="text-brand-text-white font-bold text-xs truncate max-w-[120px] md:max-w-none group-hover/row:text-brand-green transition-colors notranslate" translate="no">{name}</span>
                               </div>
                            </td>
                            <td className="p-3 text-center text-xs text-brand-text-muted">{played}</td>
                            <td className="p-3 text-center text-xs text-brand-text-muted">{won}</td>
                            <td className="p-3 text-center text-xs text-brand-text-muted">{drawn}</td>
                            <td className="p-3 text-center text-xs text-brand-text-muted">{lost}</td>
                            <td className="p-3 text-center text-xs text-brand-text-muted hidden md:table-cell">{gf}</td>
                            <td className="p-3 text-center text-xs text-brand-text-muted hidden md:table-cell">{ga}</td>
                            <td className="p-3 text-center text-sm font-mono font-bold text-brand-text-white">{pts}</td>
                            <td className="p-3">
                               <div className="flex items-center justify-center space-x-0.5">
                                 {formArray.slice(-5).map((res: string, idx: number) => {
                                   let statusColor = 'text-gray-500 bg-gray-500/10 border-gray-500/20';
                                   if (res === 'W') { statusColor = 'text-brand-green bg-brand-green/10 border-brand-green/20'; }
                                   if (res === 'L') { statusColor = 'text-brand-red bg-brand-red/10 border-brand-red/20'; }
                                   if (res === 'D') { statusColor = 'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/20'; }
                                   
                                   return (
                                     <span 
                                       key={idx} 
                                       className={cn("w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border shrink-0", statusColor)}
                                       title={res === 'W' ? 'Victoria' : res === 'L' ? 'Derrota' : 'Empate'}
                                     >
                                       {res === 'W' ? '💎' : res === 'L' ? '🧨' : res === 'D' ? '🤝' : '🔘'}
                                     </span>
                                   );
                                 })}
                                 {formArray.length === 0 && <span className="text-[8px] text-brand-text-muted italic opacity-50">--</span>}
                               </div>
                            </td>
                          </motion.tr>
                        )})
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>

                <div className="md:hidden space-y-2 mt-4">
                  {standings?.length === 0 ? (
                    <div className="p-8 text-center text-brand-text-muted bg-brand-bg-card/50 rounded-xl border border-brand-border/50">
                      <p>No se encontraron datos de clasificación para esta liga.</p>
                    </div>
                  ) : (
                    standings?.map((team, i) => (
                      <div key={team.team_id || team.id || i} 
                        onClick={() => openTeamModal(team)}
                        className="bg-brand-bg-card rounded-2xl border border-brand-border p-4 active:bg-brand-bg-hover transition-colors cursor-pointer">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <span className="w-6 h-6 rounded bg-brand-bg-primary flex items-center justify-center text-xs font-bold">
                              {team.position || team.rank || i+1}
                            </span>
                            <span className="text-sm font-bold text-brand-text-white truncate max-w-[150px]">
                              {team.team_name || team.team?.name || team.name}
                            </span>
                          </div>
                          <span className="text-lg font-mono font-bold text-brand-text-white">{team.pts ?? team.points ?? 0} pts</span>
                        </div>
                        <div className="grid grid-cols-5 gap-2 text-center text-xs text-brand-text-muted">
                          <div><span className="block text-brand-text-white font-bold">{team.played ?? team.overall?.played ?? 0}</span>PJ</div>
                          <div><span className="block text-brand-text-white font-bold">{team.won ?? team.overall?.won ?? 0}</span>V</div>
                          <div><span className="block text-brand-text-white font-bold">{team.drawn ?? team.overall?.draw ?? 0}</span>E</div>
                          <div><span className="block text-brand-text-white font-bold">{team.lost ?? team.overall?.lost ?? 0}</span>D</div>
                          <div><span className="block text-brand-text-white font-bold">{team.gf ?? team.goals_for ?? team.overall?.goals_for ?? 0}:{team.ga ?? team.goals_against ?? team.overall?.goals_against ?? 0}</span>GF:GC</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <LeagueStatCard 
                    icon={<TrendingUp className="w-4 h-4 text-brand-green" />} 
                    label="Media Goles" 
                    value={metrics.avgGoals} 
                    sub="Por Partido" 
                  />
                  <LeagueStatCard 
                    icon={<Info className="w-4 h-4 text-brand-yellow" />} 
                    label="Media Tiros" 
                    value={metrics.avgShots} 
                    sub="No disponible" 
                  />
                  <LeagueStatCard 
                    icon={<Globe className="w-4 h-4 text-brand-blue" />} 
                    label="Eficiencia" 
                    value={metrics.efficiency} 
                    sub="Goles vs xG" 
                  />
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 pt-12 border-t border-brand-border/10">
          <Footer />
        </div>
      </div>
    </div>
  );
}

function LeagueStatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-brand-bg-card p-4 rounded-2xl border border-brand-border flex items-center space-x-4 shadow-lg">
       <div className="w-10 h-10 bg-brand-bg-primary rounded-xl flex items-center justify-center border border-brand-border">
          {icon}
       </div>
       <div>
          <p className="text-[10px] text-brand-text-muted uppercase font-bold">{label}</p>
          <div className="flex items-baseline space-x-1">
             <span className="text-xl font-display font-bold text-brand-text-white">{value}</span>
             <span className="text-[10px] text-brand-text-muted italic">{sub}</span>
          </div>
       </div>
    </div>
  );
}
