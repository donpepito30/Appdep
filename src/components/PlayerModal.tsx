import React, { useState, useEffect } from 'react';
import { User, Activity, Star, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, getImgUrl } from '../services/api';
import { Player, cn } from '../types';

export function PlayerModal({ playerId, onClose }: { playerId: string | null, onClose: () => void }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setPlayer(null);
      return;
    }

    setLoading(true);
    // Use the search API to find the specific player (mock handles it)
    api.searchPlayers('').then(all => {
      const found = all.find(p => p.id === playerId);
      setPlayer(found || null);
      setLoading(false);
    });
  }, [playerId]);

  const photoUrl = player ? getImgUrl('player', player.id) || player.photoUrl : null;

  return (
    <AnimatePresence>
      {playerId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-brand-bg-card rounded-3xl border border-brand-border shadow-2xl overflow-hidden overflow-y-auto max-h-[90vh]"
          >
            {loading ? (
              <div className="p-20 flex justify-center">
                <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              </div>
            ) : player ? (
              <>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 bg-black/40 rounded-full text-brand-text-muted hover:text-brand-text-white transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="bg-gradient-to-b from-brand-green/20 to-transparent p-8 pt-12 text-center">
                  <div className="w-32 h-32 bg-brand-bg-primary rounded-3xl mx-auto overflow-hidden border-2 border-brand-green/30 shadow-2xl mb-4">
                    {photoUrl ? (
                      <img src={photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-full h-full p-8 text-brand-text-muted" />
                    )}
                  </div>
                  <h2 className="text-3xl font-display font-bold text-brand-text-white uppercase tracking-wider">{player.name}</h2>
                  <p className="text-brand-green font-medium">{player.currentTeam} • {player.position}</p>
                </div>

                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="space-y-1">
                      <div className="text-[10px] text-brand-text-muted uppercase">Goles</div>
                      <div className="text-xl font-display font-bold text-brand-text-white">{player.stats?.goals || 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-brand-text-muted uppercase">xG</div>
                      <div className="text-xl font-display font-bold text-brand-text-white">{player.stats?.xg?.toFixed(1) || '0.0'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-brand-text-muted uppercase">Asist.</div>
                      <div className="text-xl font-display font-bold text-brand-text-white">{player.stats?.assists || 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-brand-text-muted uppercase">Rating</div>
                      <div className="text-xl font-display font-bold text-brand-green">{player.stats?.avgRating?.toFixed(1) || '0.0'}</div>
                    </div>
                  </div>

                  {player.stats?.lastMatches && player.stats.lastMatches.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-brand-text-muted uppercase tracking-widest flex items-center space-x-2">
                      <Activity className="w-3 h-3" />
                      <span>Últimos Partidos</span>
                    </h4>
                    <div className="bg-brand-bg-primary/50 rounded-2xl border border-brand-border divide-y divide-brand-border">
                      {player.stats.lastMatches.map((match, i) => (
                        <div key={i} className="p-4 flex justify-between items-center">
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium text-brand-text-white">Competencia</p>
                            <p className="text-[10px] text-brand-text-muted font-mono uppercase">{match.date}</p>
                          </div>
                          <div className="flex items-center space-x-4">
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded",
                              match.result?.includes('W') ? "text-brand-green bg-brand-green/10" : "text-brand-red bg-brand-red/10"
                            )}>
                              {match.result}
                            </span>
                            <div className="flex items-center space-x-1">
                              <Star className="w-3 h-3 text-brand-yellow fill-brand-yellow" />
                              <span className="text-xs font-bold text-brand-text-white font-mono">{match.rating?.toFixed(1) || '0.0'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              </>
            ) : (
                <div className="p-20 text-center text-brand-text-muted">No se encontró información del jugador</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
