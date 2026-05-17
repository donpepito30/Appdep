import React, { useState } from 'react';
import { Activity, ShieldCheck, Globe, Wifi, Key, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { cn } from '../types';

export function DiagnosticView({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<{
    direct: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
    proxy: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
    key: { status: 'idle' | 'loading' | 'success' | 'error'; label: string; details?: string };
  }>({
    direct: { status: 'idle', label: 'Conectividad Directa' },
    proxy: { status: 'idle', label: 'Conexión vía Proxy' },
    key: { status: 'idle', label: 'Vigencia de API Key' },
  });

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
    const key = localStorage.getItem('BSD_API_KEY');
    setResults(prev => ({ ...prev, key: { ...prev.key, status: 'loading', details: key ? `Key: ****${key.slice(-4)}` : 'Sin Key' } }));
    if (!key) {
      setResults(prev => ({ ...prev, key: { ...prev.key, status: 'error', details: 'No hay API Key configurada' } }));
    } else {
        try {
            await api.getLeagues();
            setResults(prev => ({ ...prev, key: { ...prev.key, status: 'success', details: `${key.slice(0,4)}...${key.slice(-4)}` } }));
        } catch (e: any) {
            setResults(prev => ({ ...prev, key: { ...prev.key, status: 'error', details: 'Key inválida o rechazada' } }));
        }
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
        {item.status}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-brand-bg-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Activity className="w-5 h-5 text-brand-green" />
            <h2 className="text-lg font-display font-bold uppercase tracking-wider">Centro de Diagnóstico</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg-hover rounded-xl transition-colors">
            <X className="w-5 h-5 text-brand-text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <TestItem item={results.direct} />
          <TestItem item={results.proxy} />
          <TestItem item={results.key} />
          
          <div className="pt-4 space-y-3">
            <button 
              onClick={runDiagnostic}
              className="w-full bg-brand-green hover:bg-brand-green/90 text-black font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-green/20 flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Ejecutar Diagnóstico</span>
            </button>
            <p className="text-[10px] text-brand-text-muted text-center max-w-[280px] mx-auto italic leading-normal">
              Esta herramienta verifica la integridad de tu conexión con el motor de BSD Sports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
