import React from 'react';
import { BarChart3 } from 'lucide-react';

export function ManagerView() {
  return (
    <div className="p-6 text-center text-brand-text-muted">
      <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
      <h3 className="text-sm font-black uppercase tracking-widest text-brand-text-white mb-2">Análisis de Mánagers</h3>
      <p className="text-[10px] uppercase tracking-tighter">Procesando perfiles técnicos...</p>
    </div>
  );
}
