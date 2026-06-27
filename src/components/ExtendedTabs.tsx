import React, { useEffect, useState } from 'react';
import { api, getImgUrl } from '../services/api';
import { MessageSquare, Tv, Crosshair, RefreshCw, AlertCircle, PlayCircle, ExternalLink, Globe } from 'lucide-react';
import { cn, Broadcast } from '../types';
import { ShotmapVisualization } from './ShotmapVisualization';

export function SocialTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getSocialItems({ event: eventId }).then(data => {
      if (active) {
        setItems(data || []);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-green" />
        <p className="text-[10px] uppercase font-bold tracking-widest">Cargando feeds...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4 bg-brand-bg-card rounded-[2rem] border border-brand-border/30">
        <MessageSquare className="w-12 h-12 opacity-20" />
        <p className="text-[10px] uppercase font-bold tracking-widest text-center">Sin actualizaciones sociales recientes</p>
      </div>
    );
  }

  const getYoutubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  return (
    <div className="space-y-4">
      {items.map((item, i) => {
        const ytEmbedUrl = item.type === 'video' ? getYoutubeEmbedUrl(item.url) : null;
        
        return (
          <div key={item.id || i} className="block bg-brand-bg-card border border-brand-border/30 rounded-2xl p-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0 p-3 bg-brand-bg-secondary rounded-xl">
                {item.type === 'video' ? <PlayCircle className="w-6 h-6 text-brand-red" /> : <MessageSquare className="w-6 h-6 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-brand-text-white">{item.author || item.source || 'Social Feed'}</span>
                  {item.created_at && <span className="text-[10px] text-brand-text-muted">{new Date(item.created_at).toLocaleDateString()}</span>}
                </div>
                <p className={`text-sm text-brand-text-muted leading-relaxed ${!ytEmbedUrl ? 'line-clamp-4' : ''}`}>
                  {item.text || item.title || item.snippet}
                </p>
                {ytEmbedUrl && (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden mt-3 bg-brand-bg-primary">
                    <iframe
                      src={ytEmbedUrl}
                      className="absolute inset-0 w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BroadcastsTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getEventBroadcasts(eventId).then(data => {
      if (active) {
        setItems(data || []);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-green" />
        <p className="text-[10px] uppercase font-bold tracking-widest">Sincronizando Satélites...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4 bg-brand-bg-card rounded-[2rem] border border-brand-border/30">
        <Tv className="w-12 h-12 opacity-20" />
        <p className="text-[12px] font-bold text-center">No hay emisiones confirmadas para este evento.</p>
        <p className="text-[10px] text-center max-w-sm">Los derechos de TV pueden variar según la localización geográfica y la disponibilidad del proveedor.</p>
      </div>
    );
  }

  // Agrupar por país (usando country_code)
  const byCountry = items.reduce((acc, curr) => {
    const country = curr.country_code || 'INT';
    if (!acc[country]) acc[country] = [];
    acc[country].push(curr);
    return acc;
  }, {} as Record<string, Broadcast[]>);

  return (
    <div className="space-y-6">
      {Object.entries(byCountry).map(([country, broadcasts]) => (
        <div key={country} className="bg-brand-bg-card border border-brand-border/30 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="bg-brand-bg-primary/40 px-6 py-4 border-b border-brand-border/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-brand-green" />
              <h3 className="font-black text-[10px] uppercase tracking-widest text-brand-text-white">Cobertura: {country}</h3>
            </div>
            <span className="text-[9px] font-mono font-bold text-brand-text-muted bg-white/5 px-2 py-0.5 rounded-full">{broadcasts.length} Canales</span>
          </div>
          <div className="divide-y divide-brand-border/10">
            {broadcasts.map((b, i) => (
              <div key={b.id || i} className="p-5 px-6 flex items-center justify-between hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-brand-bg-secondary rounded-2xl flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform">
                    <img 
                      src={getImgUrl('league', b.league_id) || ''} 
                      onError={(e) => { (e.target as any).src = ''; (e.target as any).style.display = 'none'; }}
                      className="w-8 h-8 object-contain"
                    />
                    <Tv className="w-6 h-6 text-brand-text-muted absolute group-hover:text-brand-green transition-colors" />
                  </div>
                  <div className="flex flex-col">
                    <div className="font-black text-xs text-brand-text-white uppercase tracking-tight">{b.channel_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-brand-text-muted font-medium">{new Date(b.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="w-1 h-1 bg-brand-border rounded-full" />
                      <span className="text-[10px] text-brand-green font-bold uppercase tracking-wider">Live HD</span>
                    </div>
                  </div>
                </div>
                <a 
                  href={b.channel_link || `https://www.google.com/search?q=${encodeURIComponent(b.home_team + ' vs ' + b.away_team + ' en vivo ' + b.channel_name)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={cn(
                    "p-3 rounded-xl transition-all border",
                    b.channel_link 
                      ? "bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-black border-transparent" 
                      : "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow hover:text-black border-brand-yellow/20"
                  )}
                  title={b.channel_link ? "Ver transmisión oficial" : "Buscar transmisión 🔍"}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShotmapTab({ eventId, homeTeam, awayTeam }: { eventId: string; homeTeam?: string; awayTeam?: string }) {
  const [shots, setShots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getShotmap(eventId).then(data => {
      if (active) {
        setShots(data || []);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-green" />
        <p className="text-[10px] uppercase font-bold tracking-widest">Cargando mapa de tiros...</p>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4 bg-brand-bg-card rounded-[2rem] border border-brand-border/30">
        <Crosshair className="w-12 h-12 opacity-20" />
        <p className="text-[12px] font-bold text-center">El mapa de tiros no está disponible para este partido.</p>
        <p className="text-[10px] text-center max-w-sm">Esta función solo está disponible en las ligas con cobertura de datos avanzada.</p>
      </div>
    );
  }

  return (
    <ShotmapVisualization 
      shots={shots} 
      homeTeamName={homeTeam} 
      awayTeamName={awayTeam} 
    />
  );
}
