import React, { useState } from 'react';
import { Activity, ShieldCheck, Globe, Wifi, Key, X, CheckCircle2, AlertCircle, RefreshCw, BookOpen, Code2, Database } from 'lucide-react';
import { api } from '../services/api';
import { cn } from '../types';

export function DiagnosticView({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'status' | 'docs'>('status');
  const [results, setResults] = useState<{
    direct: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
    proxy: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
    key: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
  }>({
    direct: { status: 'idle', label: 'Conectividad Directa' },
    proxy: { status: 'idle', label: 'Conexión vía Proxy' },
    key: { status: 'idle', label: 'Vigencia de API Key (Servidor)' },
  });

  const endpoints = [
    { method: 'GET', path: '/events/live/', desc: 'Partidos en vivo en tiempo real.', highlight: true },
    { method: 'GET', path: '/predicciones/', desc: 'Listado de partidos con predicciones v2.' },
    { method: 'GET', path: '/eventos/{id}/predicción/', desc: 'Análisis detallado de IA v2 (xG, probabilidades, recomendaciones).' },
    { method: 'GET', path: '/events/{id}/stats/', desc: 'Estadísticas de posesión, tiros y ataques.' },
    { method: 'GET', path: '/events/{id}/shotmap/', desc: 'Mapa detallado de tiros con coordenadas y xG.' },
  ];

  const runDiagnostic = async () => {
    // 1. Direct Test
    setResults(prev => ({ ...prev, direct: { ...prev.direct, status: 'loading' } }));
    try {
      const resp = await fetch('https://sports.bzzoiro.com/api/v2/leagues/?limit=1', { method: 'HEAD' });
      setResults(prev => ({ ...prev, direct: { ...prev.direct, status: resp.ok ? 'success' : 'error', details: `HTTP ${resp.status}` } }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, direct: { ...prev.direct, status: 'error', details: e.message } }));
    }

    // 2. Proxy Test
    setResults(prev => ({ ...prev, proxy: { ...prev.proxy, status: 'loading' } }));
    try {
      await api.getLeagues();
      setResults(prev => ({ ...prev, proxy: { ...prev.proxy, status: 'success', details: 'OK' } }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, proxy: { ...prev.proxy, status: 'error', details: e.message } }));
    }

    // 3. Key Validation
    setResults(prev => ({ ...prev, key: { ...prev.key, status: 'loading', details: 'Validando...' } }));
    try {
      await api.getLeagues();
      setResults(prev => ({ ...prev, key: { ...prev.key, status: 'success', details: 'API Key del Servidor Activa y Válida' } }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, key: { ...prev.key, status: 'error', details: 'Inactiva, inválida o expirada' } }));
    }
  };

  const TestItem = ({ item }: { item: typeof results.direct }) => (
    <div className="flex items-center justify-between p-4 bg-brand-bg-primary/50 border border-brand-border rounded-xl">
      <div className="flex items-center space-x-3">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          item.status === 'loading' ? "animate-spin text-brand-green" :
          item.status === 'success' ? "bg-brand-green/20 text-brand-green" :
          item.status === 'error' ? "bg-brand-red/20 text-brand-red" : "bg-brand-text-muted/20 text-brand-text-muted"
        )}>
          {item.status === 'loading' ? <RefreshCw className="w-4 h-4" /> :
           item.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
           item.status === 'error' ? <AlertCircle className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-brand-text-white">{item.label}</span>
          <span className="text-[10px] text-brand-text-muted font-mono">{item.details || 'Pendiente...'}</span>
        </div>
      </div>
      <div className={cn(
        "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest",
        item.status === 'success' ? "text-brand-green" : item.status === 'error' ? "text-brand-red" : "text-brand-text-muted"
      )}>
        {item.status === 'success' ? 'Éxito' : item.status === 'error' ? 'Error' : item.status === 'loading' ? 'Cargando' : 'Inactivo'}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="w-full max-w-lg bg-brand-bg-card border border-brand-border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 md:p-8 border-b border-brand-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-green/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-brand-green" />
            </div>
            <div>
               <h2 className="text-xl font-display font-black uppercase tracking-wider text-brand-text-white leading-none">Terminal BSD</h2>
               <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest mt-1">Version 2.0.4 • API Sinc</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg-hover rounded-xl transition-colors">
            <X className="w-5 h-5 text-brand-text-muted" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-brand-border shrink-0">
          <button 
            onClick={() => setActiveTab('status')}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === 'status' ? "text-brand-green bg-brand-green/5" : "text-brand-text-muted hover:text-brand-text-white"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-3.5 h-3.5" />
              Estado Conexión
            </div>
            {activeTab === 'status' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green" />}
          </button>
          <button 
            onClick={() => setActiveTab('docs')}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === 'docs' ? "text-brand-green bg-brand-green/5" : "text-brand-text-muted hover:text-brand-text-white"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              API v2 Lib
            </div>
            {activeTab === 'docs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 touch-scroll">
          {activeTab === 'status' ? (
            <div className="space-y-4">
              <TestItem item={results.direct} />
              <TestItem item={results.proxy} />
              <TestItem item={results.key} />
              
              <div className="pt-4 space-y-3">
                <button 
                  onClick={runDiagnostic}
                  className="w-full bg-brand-green hover:bg-brand-green/90 text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-brand-green/20 flex items-center justify-center space-x-2 active:scale-[0.98]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="uppercase tracking-widest text-xs">Ejecutar Diagnóstico</span>
                </button>
                <div className="flex items-center gap-2 justify-center p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                   <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                   <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest leading-normal">
                      Cualquier error de conexión afectará la precisión de las predicciones IA.
                   </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
               <div className="p-5 bg-brand-bg-primary/50 border border-brand-border rounded-2xl">
                 <div className="flex items-center gap-3 mb-4">
                    <Database className="w-5 h-5 text-brand-green" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand-text-white">Motor de Datos BZZOIRO v2</h3>
                 </div>
                 <p className="text-[11px] text-brand-text-muted leading-relaxed">
                    La arquitectura v2 utiliza modelos híbridos para calcular xG e intensidades de juego en tiempo real. 
                    Toda la información se sincroniza cada 30 segundos con el nodo central.
                 </p>
               </div>

               <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-text-muted px-1">Endpoints de Consultoría</h4>
                  <div className="space-y-2">
                    {endpoints.map((ep, i) => (
                      <div key={i} className="p-4 bg-brand-bg-card border border-brand-border rounded-xl group hover:border-brand-green/30 transition-all">
                        <div className="flex items-center gap-2 mb-1.5">
                           <span className={cn(
                             "text-[8px] font-black px-1.5 py-0.5 rounded",
                             ep.method === 'GET' ? "bg-blue-500/20 text-blue-400" : "bg-brand-green/20 text-brand-green"
                           )}>{ep.method}</span>
                           <code className="text-[10px] font-mono font-bold text-brand-text-white group-hover:text-brand-green transition-colors">{ep.path}</code>
                        </div>
                        <p className="text-[9px] text-brand-text-muted font-medium italic">{ep.desc}</p>
                      </div>
                    ))}
                  </div>
               </div>

               <div className="p-4 border-2 border-dashed border-brand-border rounded-2xl flex flex-col items-center justify-center text-center space-y-2 opacity-60">
                  <Code2 className="w-6 h-6 text-brand-text-muted" />
                  <p className="text-[9px] font-bold text-brand-text-muted uppercase tracking-widest">Documentación Extendida disponible en <br/> ROOT/FOOTBALL_API_V2.md</p>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
