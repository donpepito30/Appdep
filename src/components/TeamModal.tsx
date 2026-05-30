import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Zap } from 'lucide-react';
import { getImgUrl, api } from '../services/api';
import { cn } from '../types';

export interface TeamModalProps {
  team: any;
  onClose: () => void;
}

export function TeamModal({ team, onClose }: TeamModalProps) {
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [teamStats, setTeamStats] = useState<any>(null);

  useEffect(() => {
    let active = true;
    async function loadTeamData() {
      setLoading(true);
      try {
        const teamId = team.team_id || team.team?.id || team.id;
        if (teamId) {
          const fetchedFixtures = await api.getFixtures(String(teamId), 5);
          if (active) setFixtures(fetchedFixtures || []);
          
          if ((team.played ?? team.overall?.played) === undefined && team.leagueId) {
            try {
               const st = await api.getStandings(team.leagueId);
               if (st && active && Array.isArray(st)) {
                 const match = st.find((row: any) => String(row.team_id || row.id || row.team?.id) === String(teamId));
                 if (match) {
                   setTeamStats(match);
                 }
               }
            } catch (e) {}
          }
        }
      } catch (err) {
        // Silent error loading fixtures
      } finally {
        if (active) setLoading(false);
      }
    }
    loadTeamData();
    return () => { active = false; };
  }, [team]);

  const name = team.team_name || team.team?.name || team.name || "Equipo";
  const logo = team.team_logo || team.team?.logo || team.logo || team.image_path;
  const teamId = team.team_id || team.team?.id || team.id;
  const proxyLogo = getImgUrl('team', teamId);
  
  const srcObj = teamStats || team;
  let played = srcObj.played ?? srcObj.overall?.played ?? 0;
  let won = srcObj.won ?? srcObj.overall?.won ?? 0;
  let drawn = srcObj.drawn ?? srcObj.overall?.draw ?? 0;
  let lost = srcObj.lost ?? srcObj.overall?.lost ?? 0;
  let gf = srcObj.gf ?? srcObj.goals_for ?? srcObj.overall?.goals_for ?? 0;
  let ga = srcObj.ga ?? srcObj.goals_against ?? srcObj.overall?.goals_against ?? 0;
  let pts = srcObj.pts ?? srcObj.points ?? 0;
  let xg = srcObj.xg || 0;
  let xga = srcObj.xga || 0;

  // Compute from fixtures if not provided
  // Removed custom computation per user request: data MUST come from league data

  // fallback if still undefined
  played = played || 0;
  won = won || 0;
  drawn = drawn || 0;
  lost = lost || 0;
  gf = gf || 0;
  ga = ga || 0;
  pts = pts || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-2xl bg-brand-bg-card border border-brand-border rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]"
      >
          {/* Header */}
          <div className="p-6 border-b border-brand-border flex items-center justify-between bg-brand-bg-primary/50">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center border border-brand-border overflow-hidden p-3 shadow-inner">
                <img src={proxyLogo} alt={name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
              <div>
                <h3 className="text-2xl font-black font-display tracking-tight text-brand-text-white uppercase">
                  {name}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest bg-brand-green/10 px-2 py-0.5 rounded border border-brand-green/20">
                    Posición {team.position || team.rank || '-'}
                  </span>
                  <span className="text-[10px] font-bold text-brand-text-white uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded border border-white/20">
                    {pts} Puntos
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-3 bg-brand-bg-primary hover:bg-brand-bg-hover rounded-xl border border-brand-border text-brand-text-muted hover:text-brand-text-white transition-all hover:scale-105 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 flex-1 space-y-6 scrollbar-hide">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-brand-bg-primary/30 p-4 rounded-2xl border border-brand-border flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  Partidos
                </span>
                <span className="text-2xl font-black text-brand-text-white">{played}</span>
              </div>
              <div className="bg-brand-bg-primary/30 p-4 rounded-2xl border border-brand-border flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-1">Victorias</span>
                <span className="text-2xl font-black text-brand-green">{won}</span>
              </div>
              <div className="bg-brand-bg-primary/30 p-4 rounded-2xl border border-brand-border flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-1">Empates</span>
                <span className="text-2xl font-black text-brand-yellow">{drawn}</span>
              </div>
              <div className="bg-brand-bg-primary/30 p-4 rounded-2xl border border-brand-border flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-1">Derrotas</span>
                <span className="text-2xl font-black text-brand-red">{lost}</span>
              </div>
            </div>

            {/* Attack & Defense Splito */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-brand-bg-primary/30 rounded-2xl p-4 border border-brand-border">
                <h4 className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-4 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-brand-red mr-2 animate-pulse" />
                  Poder Ofensivo
                </h4>
                <div className="space-y-4">
                  <StatRow label="Goles Marcados" value={gf} />
                  <StatRow label="Goles x/Partido" value={(gf/played || 0).toFixed(2)} />
                  <StatRow label="xG (Esperado)" value={xg.toFixed(2)} sub={xg === 0 ? "Simulado" : undefined} />
                  <div className="pt-2 border-t border-brand-border/50">
                    <div className="flex justify-between items-center text-[10px] text-brand-text-muted mb-1">
                      <span>Eficiencia</span>
                      <span>{xg > 0 ? (gf / xg).toFixed(2) : 'N/A'}x</span>
                    </div>
                    <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((gf/xg || 1) * 50, 100)}%` }}
                        className="h-full bg-brand-green shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-brand-bg-primary/30 rounded-2xl p-4 border border-brand-border">
                <h4 className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest mb-4 flex items-center">
                  <Shield className="w-3 h-3 mr-2 text-brand-blue" />
                  Muro Defensivo
                </h4>
                <div className="space-y-4">
                  <StatRow label="Goles Recibidos" value={ga} />
                  <StatRow label="GC x/Partido" value={(ga/played || 0).toFixed(2)} />
                  <StatRow label="xGA (Contra)" value={xga.toFixed(2)} />
                  <div className="pt-2 border-t border-brand-border/50">
                    <div className="flex justify-between items-center text-[10px] text-brand-text-muted mb-1">
                      <span>Solidez</span>
                      <span>{Math.max(100 - (ga * 2), 0)}%</span>
                    </div>
                    <div className="h-1.5 bg-brand-bg-primary rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(100 - (ga * 2), 0)}%` }}
                        className="h-full bg-brand-blue shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Matches */}
            <div className="space-y-4">
              <h4 className="text-[10px] text-brand-text-muted font-bold uppercase tracking-widest flex items-center">
                <Zap className="w-3 h-3 mr-2 text-brand-yellow" />
                Últimos Encuentros
              </h4>
              <div className="space-y-2">
                {loading ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-brand-green/20 border-t-brand-green rounded-full animate-spin" />
                  </div>
                ) : fixtures.length > 0 ? (
                  fixtures.slice(0, 5).map((fix, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-brand-bg-primary/20 border border-brand-border/50 hover:bg-brand-bg-hover transition-colors">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-brand-text-muted w-8 shrink-0">{new Date(fix.date || fix.startTime).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <span className={cn("text-xs truncate font-bold uppercase", String(fix.homeTeamId) === String(team.team_id || team.id) ? "text-brand-text-white" : "text-brand-text-muted")}>
                            {fix.homeTeam}
                          </span>
                          <span className="text-[10px] text-brand-text-muted shrink-0 text-center w-8 bg-black/20 rounded">
                            {fix.homeScore} - {fix.awayScore}
                          </span>
                          <span className={cn("text-xs truncate font-bold uppercase", String(fix.awayTeamId) === String(team.team_id || team.id) ? "text-brand-text-white" : "text-brand-text-muted")}>
                            {fix.awayTeam}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        {(() => {
                          const isHome = String(fix.homeTeamId) === String(team.team_id || team.id);
                          const won = isHome ? (fix.homeScore > fix.awayScore) : (fix.awayScore > fix.homeScore);
                          const draw = fix.homeScore === fix.awayScore;
                          if (draw) return <span className="text-[10px] text-brand-yellow font-bold bg-brand-yellow/10 px-2 py-0.5 rounded border border-brand-yellow/20">E</span>;
                          return won 
                            ? <span className="text-[10px] text-brand-green font-bold bg-brand-green/10 px-2 py-0.5 rounded border border-brand-green/20">V</span>
                            : <span className="text-[10px] text-brand-red font-bold bg-brand-red/10 px-2 py-0.5 rounded border border-brand-red/20">D</span>;
                        })()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center border border-brand-border/50 border-dashed rounded-xl bg-brand-bg-primary/10">
                    <p className="text-xs text-brand-text-muted italic">No hay historial reciente disponible</p>
                  </div>
                )}
              </div>
            </div>
          </div>
      </motion.div>
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string, value: string | number, sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 relative group">
      <div className="flex flex-col">
        <span className="text-xs text-brand-text-muted group-hover:text-brand-text-white transition-colors">{label}</span>
        {sub && <span className="text-[8px] text-brand-text-muted italic opacity-50">{sub}</span>}
      </div>
      <span className="text-sm font-mono font-bold text-brand-text-white">{value}</span>
    </div>
  );
}
