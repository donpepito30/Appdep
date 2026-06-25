import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TVChannel, Broadcast } from '../types';
import { Tv, Globe, Search, RefreshCw, Calendar, ExternalLink, Filter } from 'lucide-react';
import { Footer } from './Footer';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../types';

export function TVGuideView() {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'broadcasts' | 'channels'>('broadcasts');
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab, countryFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'channels') {
        const data = await api.getTVChannels(countryFilter || undefined, searchTerm || undefined);
        setChannels(data);
      } else {
        const today = new Date();
        const future = new Date(today);
        future.setDate(today.getDate() + 7);
        
        const data = await api.getGlobalBroadcasts({
          countryCode: countryFilter || undefined,
          dateFrom: today.toISOString(),
          dateTo: future.toISOString()
        });
        setBroadcasts(data);
      }
    } catch (error) {
      console.error("Error loading TV data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBroadcasts = broadcasts.filter(b => 
    b.home_team.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.away_team.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.channel_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-brand-bg-primary overflow-hidden">
      <div className="p-6 md:p-8 border-b border-brand-border shrink-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-black italic tracking-tighter text-brand-text-white uppercase leading-none">
              GUÍA DE <span className="text-brand-green">TRANSMISIÓN</span>
            </h2>
            <p className="text-brand-text-muted text-[10px] uppercase font-bold tracking-[0.3em] mt-2">Cobertura oficial y canales autorizados</p>
          </div>

          <div className="flex bg-brand-bg-card p-1 rounded-2xl border border-brand-border/30">
            <button 
              onClick={() => setActiveTab('broadcasts')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'broadcasts' ? "bg-brand-green text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text-white"
              )}
            >
              Emisiones
            </button>
            <button 
              onClick={() => setActiveTab('channels')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'channels' ? "bg-brand-green text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text-white"
              )}
            >
              Canales
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted group-focus-within:text-brand-green transition-colors" />
            <input 
              type="text" 
              placeholder={activeTab === 'channels' ? "Buscar canal..." : "Buscar equipo o canal..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-brand-bg-card border border-brand-border rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-brand-green/30 transition-all text-brand-text-white"
            />
          </div>
          <div className="relative group">
            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted group-focus-within:text-brand-green transition-colors" />
            <select 
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-full bg-brand-bg-card border border-brand-border rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-brand-green/30 transition-all text-brand-text-white appearance-none"
            >
              <option value="">Todos los países</option>
              <option value="PT">Portugal (PT)</option>
              <option value="ES">España (ES)</option>
              <option value="UK">Reino Unido (UK)</option>
              <option value="BR">Brasil (BR)</option>
            </select>
          </div>
          <button 
            onClick={loadData}
            className="hidden lg:flex items-center justify-center gap-2 bg-brand-bg-card border border-brand-border rounded-2xl py-3 px-6 hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-brand-green", loading && "animate-spin")} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">Actualizar</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 scroll-smooth pb-32">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-64 flex flex-col items-center justify-center space-y-4"
            >
              <div className="w-12 h-12 border-t-2 border-brand-green rounded-full animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-text-muted">Buscando señales...</p>
            </motion.div>
          ) : activeTab === 'channels' ? (
            <motion.div 
              key="channels"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {channels.map(channel => (
                <div key={channel.id} className="bg-brand-bg-card border border-brand-border/30 rounded-[2rem] p-6 hover:border-brand-green/30 transition-all group shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-brand-bg-primary rounded-2xl flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform">
                      <Tv className="w-8 h-8 text-brand-text-muted group-hover:text-brand-green transition-colors" />
                    </div>
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-brand-text-muted uppercase tracking-widest">{channel.country_code}</div>
                  </div>
                  <h3 className="text-lg font-black text-brand-text-white uppercase tracking-tight mb-1">{channel.name}</h3>
                  <p className="text-[10px] text-brand-text-muted font-medium mb-4 uppercase tracking-tighter">Señal disponible</p>
                  
                  <a 
                    href={channel.link || `https://www.google.com/search?q=${encodeURIComponent(channel.name + ' ver en vivo online')}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={cn(
                      "mt-2 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      channel.link 
                        ? "bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-black" 
                        : "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow hover:text-black"
                    )}
                  >
                    <ExternalLink className="w-4 h-4" />
                    {channel.link ? "Sitio Oficial" : "Buscar Señal 🔍"}
                  </a>
                </div>
              ))}
              {channels.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <Tv className="w-16 h-16 mx-auto opacity-10" />
                  <p className="text-brand-text-muted uppercase text-xs font-black tracking-widest">No se encontraron canales</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="broadcasts"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              {filteredBroadcasts.map(broadcast => (
                <div key={broadcast.id} className="bg-brand-bg-card border border-brand-border/30 rounded-2xl md:rounded-[2rem] p-4 md:p-6 hover:border-brand-green/30 transition-all group overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-green/5 blur-3xl -mr-16 -mt-16 group-hover:bg-brand-green/10 transition-all" />
                  
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-4 md:gap-8 w-full md:w-auto">
                      <div className="hidden sm:flex flex-col items-center justify-center text-center min-w-[70px]">
                        <span className="text-xl font-mono font-black text-brand-text-white">{new Date(broadcast.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[9px] text-brand-text-muted font-bold uppercase tracking-widest mt-1">{new Date(broadcast.scheduled_start_time).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
                      </div>

                      <div className="flex items-center flex-1 md:flex-none justify-between sm:justify-start gap-4 md:gap-10">
                        <div className="flex flex-col items-center text-center w-24 md:w-32">
                           <div className="w-10 h-10 md:w-16 md:h-16 bg-brand-bg-primary rounded-2xl flex items-center justify-center border border-white/5 mb-3">
                              <Globe className="w-5 h-5 md:w-8 md:h-8 text-brand-text-muted opacity-30" />
                           </div>
                           <span className="text-[10px] md:text-xs font-bold text-brand-text-white uppercase tracking-tight line-clamp-1">{broadcast.home_team}</span>
                        </div>
                        
                        <div className="flex flex-col items-center shrink-0">
                           <div className="px-3 py-1 bg-brand-green/10 rounded-full text-[8px] font-black text-brand-green uppercase tracking-widest mb-2">VS</div>
                           <span className="text-[9px] text-brand-text-muted font-mono whitespace-nowrap">{broadcast.league_name}</span>
                        </div>

                        <div className="flex flex-col items-center text-center w-24 md:w-32">
                           <div className="w-10 h-10 md:w-16 md:h-16 bg-brand-bg-primary rounded-2xl flex items-center justify-center border border-white/5 mb-3">
                              <Globe className="w-5 h-5 md:w-8 md:h-8 text-brand-text-muted opacity-30" />
                           </div>
                           <span className="text-[10px] md:text-xs font-bold text-brand-text-white uppercase tracking-tight line-clamp-1">{broadcast.away_team}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-6 border-t md:border-t-0 md:border-l border-brand-border/30 pt-4 md:pt-0 md:pl-8">
                       <div className="text-right">
                          <div className="text-[10px] font-black text-brand-green uppercase tracking-widest mb-1">{broadcast.channel_name}</div>
                          <div className="flex items-center justify-end gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                             <span className="text-[9px] text-brand-text-muted font-bold uppercase tracking-tighter">TRANSMISIÓN HD</span>
                          </div>
                       </div>
                       
                       {broadcast.channel_link ? (
                          <a 
                            href={broadcast.channel_link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-4 bg-brand-green/10 text-brand-green rounded-2xl hover:bg-brand-green hover:text-black transition-all shadow-lg"
                            title="Ver transmisión oficial"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                       ) : (
                          <a 
                            href={`https://www.google.com/search?q=${encodeURIComponent(broadcast.home_team + ' vs ' + broadcast.away_team + ' en vivo ' + broadcast.channel_name)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-4 bg-brand-yellow/10 text-brand-yellow rounded-2xl hover:bg-brand-yellow hover:text-black transition-all shadow-lg border border-brand-yellow/20"
                            title="Buscar transmisión alternativa 🔍"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                       )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredBroadcasts.length === 0 && (
                <div className="py-20 text-center space-y-4 glass-card rounded-[3rem] border border-brand-border/20">
                  <Calendar className="w-16 h-16 mx-auto opacity-10" />
                  <p className="text-brand-text-muted uppercase text-xs font-black tracking-widest">No hay emisiones programadas para estos criterios</p>
                </div>
              )}
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
