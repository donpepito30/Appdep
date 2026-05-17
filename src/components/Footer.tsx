import React from 'react';
import { ShieldCheck, Info, Scale, HeartHandshake } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-brand-bg-primary border-t border-brand-border/20 px-4 md:px-8 py-6 md:py-10 mt-auto">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          {/* Brand Identity Column */}
          <div className="lg:col-span-4 flex flex-col items-center lg:items-start">
            <h2 className="text-2xl font-black italic tracking-tighter text-brand-green mb-2">PRECISION_BET</h2>
            <p className="text-[9px] text-brand-text-muted uppercase tracking-[0.4em] font-bold mb-4 text-center lg:text-left">
              Advanced Predictive Analytics Engine
            </p>
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              <div className="px-2 py-1 bg-brand-bg-card border border-brand-border/30 rounded-lg text-[8px] font-mono text-brand-text-muted font-bold uppercase flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />
                API: Online
              </div>
              <div className="px-2 py-1 bg-brand-bg-card border border-brand-border/30 rounded-lg text-[8px] font-mono text-brand-text-muted font-bold uppercase text-brand-text-white/60">
                Model: 4.2.0-S
              </div>
            </div>
          </div>

          {/* Navigation/Policies Grid */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-3">
              <h4 className="text-[9px] font-black text-brand-text-white uppercase tracking-widest border-b border-brand-green/30 pb-1.5 inline-block">Seguridad</h4>
              <ul className="space-y-1.5 text-[9px] text-brand-text-muted font-medium">
                <li className="hover:text-brand-green transition-colors cursor-pointer">Protocolo AES-256</li>
                <li className="hover:text-brand-green transition-colors cursor-pointer">Audit Logs</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-[9px] font-black text-brand-text-white uppercase tracking-widest border-b border-brand-yellow/30 pb-1.5 inline-block">Legal</h4>
              <ul className="space-y-1.5 text-[9px] text-brand-text-muted font-black">
                <li className="hover:text-brand-yellow transition-colors cursor-pointer">Términos (LEGAL)</li>
                <li className="hover:text-brand-yellow transition-colors cursor-pointer">Privacidad</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-[9px] font-black text-brand-text-white uppercase tracking-widest border-b border-brand-blue/30 pb-1.5 inline-block">Soporte</h4>
              <ul className="space-y-1.5 text-[9px] text-brand-text-muted font-medium">
                <li className="hover:text-brand-blue transition-colors cursor-pointer">Documentación</li>
                <li className="hover:text-brand-blue transition-colors cursor-pointer">Contacto</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-[9px] font-black text-brand-text-white uppercase tracking-widest border-b border-brand-red/30 pb-1.5 inline-block">LABS</h4>
              <div className="bg-brand-bg-card p-2 rounded-lg border border-brand-border/30">
                <p className="text-[8px] text-brand-text-muted leading-tight uppercase font-bold">
                  Diseño <span className="text-brand-text-white italic">JR. CANCHINGRE</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Disclaimer */}
        <div className="bg-brand-bg-secondary/30 relative overflow-hidden rounded-2xl border border-brand-border/20 p-4 md:p-6 mb-8">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand-green opacity-30" />
          <h5 className="text-[9px] font-black text-brand-text-white uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
             <Scale className="w-3 h-3 text-brand-text-muted" /> NOTA TÉCNICA Y LEGAL
          </h5>
          <p className="text-[8px] md:text-[9px] text-brand-text-muted leading-relaxed text-justify uppercase tracking-tight opacity-60 font-medium">
            PRECISION_BET es una plataforma de inteligencia de datos deportivos. No somos un operador de juegos de azar ni recibimos apuestas. Los modelos neuronales son predictivos y basados en métricas xG y momentum. No garantizan resultados. Uso bajo responsabilidad del usuario. +18 años exclusivamente.
          </p>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-brand-border/10">
          <p className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">
            © 2026 PRECISION_BET ANALYTICS • ALL RIGHTS RESERVED
          </p>
          <div className="flex items-center gap-4">
             <span className="text-[9px] font-bold text-brand-text-muted tracking-tighter uppercase">API: <span className="text-brand-green">24ms</span></span>
             <span className="text-[9px] font-bold text-brand-text-muted tracking-tighter uppercase">ENV: <span className="text-brand-blue">PROD</span></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
