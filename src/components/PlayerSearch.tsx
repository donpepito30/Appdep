import React from 'react';
import { Search, User } from 'lucide-react';

export function PlayerSearch() {
  return (
    <div className="p-6 text-center text-brand-text-muted">
      <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
      <h3 className="text-sm font-black uppercase tracking-widest text-brand-text-white mb-2">Buscador de Jugadores</h3>
      <p className="text-[10px] uppercase tracking-tighter">Sincronizando base de datos de mercado...</p>
    </div>
  );
}
