import React from 'react';
import { ShieldCheck, Info, Scale, HeartHandshake } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-brand-bg-primary/50 border-t border-brand-border/10 px-4 md:px-8 py-6 md:py-8 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black tracking-tighter text-brand-green italic uppercase">MatchIntel Elite</span>
            <div className="h-3 w-[1px] bg-white/10 hidden md:block" />
            <span className="text-[9px] font-bold text-brand-text-muted uppercase tracking-[0.2em] hidden md:block">Analytics Intelligence</span>
          </div>
          <p className="text-[8px] text-brand-text-muted/60 uppercase font-medium tracking-tight text-center md:text-left max-w-sm">
            Plataforma de inteligencia deportiva. Uso bajo responsabilidad del usuario. +18 exclusivamente.
          </p>
        </div>

        <div className="flex items-center gap-6 text-[9px] font-black uppercase tracking-widest text-brand-text-muted">
          <span className="hover:text-brand-green transition-colors cursor-pointer">Protocolo</span>
          <span className="hover:text-brand-green transition-colors cursor-pointer">Privacidad</span>
          <span className="hover:text-brand-green transition-colors cursor-pointer">Contacto</span>
        </div>

        <div className="flex flex-col items-center md:items-end gap-1.5">
          <p className="text-[9px] font-mono text-brand-text-muted/50 uppercase">
            © 2026 MATCHINTEL • ELITE ANALYTICS
          </p>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
            <span className="text-[8px] font-bold text-brand-text-muted/80 tracking-widest uppercase">Nodes: Active</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
