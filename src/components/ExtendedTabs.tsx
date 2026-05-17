import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { MessageSquare, Tv, Crosshair, RefreshCw, AlertCircle, PlayCircle, ExternalLink, Globe } from 'lucide-react';
import { cn } from '../types';

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
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getBroadcasts(eventId).then(data => {
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
        <p className="text-[10px] uppercase font-bold tracking-widest">Buscando Canales de TV...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-brand-text-muted space-y-4 bg-brand-bg-card rounded-[2rem] border border-brand-border/30">
        <Tv className="w-12 h-12 opacity-20" />
        <p className="text-[12px] font-bold text-center">No hay canales de TV registrados para este partido.</p>
        <p className="text-[10px] text-center max-w-sm">Los derechos de transmisión dependen de tu región y de la licencia oficial de BSD.</p>
      </div>
    );
  }

  // Agrupar por país
  const byCountry = items.reduce((acc, curr) => {
    const country = curr.country?.name || curr.country || 'Otros';
    if (!acc[country]) acc[country] = [];
    acc[country].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      {Object.entries(byCountry).map(([country, broadcasts]) => (
        <div key={country} className="bg-brand-bg-card border border-brand-border/30 rounded-[2rem] overflow-hidden">
          <div className="bg-white/5 px-6 py-4 border-b border-brand-border/30 flex items-center gap-3">
            <Globe className="w-5 h-5 text-brand-text-muted" />
            <h3 className="font-bold text-brand-text-white">{country}</h3>
          </div>
          <div className="divide-y divide-brand-border/30">
            {(broadcasts as any[]).map((b, i) => (
              <div key={b.id || i} className="p-4 px-6 flex items-center gap-4 hover:bg-white/5 transition-colors">
                {b.logo || b.channel?.logo ? (
                  <img src={b.logo || b.channel?.logo} alt={b.channel?.name || 'TV'} className="w-10 h-10 object-contain rounded bg-white/10 p-1" />
                ) : (
                  <div className="w-10 h-10 bg-brand-bg-secondary rounded flex items-center justify-center">
                    <Tv className="w-5 h-5 text-brand-text-muted" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-sm text-brand-text-white">{b.channel?.name || b.name || 'Canal de TV'}</div>
                  {b.platform && <div className="text-[10px] text-brand-text-muted uppercase tracking-wider mt-0.5">{b.platform}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShotmapTab({ eventId }: { eventId: string }) {
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
    <div className="space-y-6">
      <div className="bg-brand-bg-card border border-brand-border/30 rounded-[2rem] p-6 space-y-6 relative overflow-hidden">
        <h3 className="font-black text-sm uppercase tracking-widest text-brand-text-white flex items-center gap-2 mb-4">
          <Crosshair className="w-5 h-5 text-brand-green" />
          Mapa de Tiros xG
        </h3>
        
        {/* Pitch rendering can be implemented here using coordinates */}
        <div className="aspect-[1.5] w-full bg-brand-bg-secondary rounded-xl relative border border-brand-border/30 flex items-center justify-center overflow-hidden">
           {/* Half pitch line */}
           <div className="absolute w-px h-full bg-brand-border/50 left-1/2 -ml-[0.5px]"></div>
           <div className="absolute w-16 h-16 border border-brand-border/50 rounded-full left-1/2 top-1/2 -ml-8 -mt-8"></div>
           
           {/* Penalty areas */}
           <div className="absolute left-0 top-1/2 -mt-16 w-16 h-32 border border-brand-border/50 border-l-0"></div>
           <div className="absolute right-0 top-1/2 -mt-16 w-16 h-32 border border-brand-border/50 border-r-0"></div>

           {/* Plotting shots: x y are usually 0-100 */}
           {shots.map((shot, i) => {
              const teamClass = shot.is_home || shot.team === 'home' ? 'bg-brand-green' : 'bg-brand-red';
              const size = Math.max(6, Math.min(20, (shot.xg || 0.05) * 50));
              
              const isGoal = shot.outcome === 'goal' || shot.type === 'goal';
              const xPos = shot.x !== undefined ? `${shot.x}%` : '50%';
              const yPos = shot.y !== undefined ? `${shot.y}%` : '50%';

              return (
                <div 
                  key={shot.id || i} 
                  className={cn("absolute rounded-full shadow cursor-pointer hover:ring-2 ring-white z-10", teamClass, isGoal ? 'animate-pulse' : 'opacity-70')}
                  style={{ 
                    left: xPos, 
                    top: yPos, 
                    width: size, 
                    height: size, 
                    transform: 'translate(-50%, -50%)' 
                  }}
                  title={`Min: ${shot.minute}' | xG: ${shot.xg || 'N/A'}${isGoal ? ' | GOL' : ''}`}
                />
              )
           })}
        </div>

        <div className="flex gap-6 justify-center mt-6">
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-brand-text-muted">
            <span className="w-3 h-3 rounded-full bg-brand-green opacity-70"></span> Local
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-brand-text-muted">
            <span className="w-3 h-3 rounded-full bg-brand-red opacity-70"></span> Visita
          </div>
          <div className="flex items-center gap-2 text-[10px] text-brand-text-muted">
             <span className="w-4 h-4 rounded-full border border-white opacity-50 flex items-center justify-center">El tamaño representa xG</span>
          </div>
        </div>
      </div>
    </div>
  );
}
