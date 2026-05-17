import React, { useState } from 'react';
import { PlayerSearch } from './PlayerSearch';
import { ManagerView } from './ManagerView';
import { Users, BarChart3, Search } from 'lucide-react';
import { cn } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Footer } from './Footer';

export function MarketHub() {
  const [tab, setTab] = useState<'players' | 'managers'>('players');

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-brand-bg-primary">
      <div className="p-4 md:p-6 flex justify-center border-b border-brand-border/30 bg-brand-bg-card/20 backdrop-blur-md shrink-0">
        <div className="flex bg-brand-bg-primary/50 p-1 rounded-2xl border border-brand-border/50">
          <button
            onClick={() => setTab('players')}
            className={cn(
              "flex items-center space-x-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              tab === 'players' ? "bg-brand-green text-black" : "text-brand-text-muted hover:text-brand-text-white"
            )}
          >
            <Users className="w-5 h-5" />
            <span>Top Jugadores</span>
          </button>
          <button
            onClick={() => setTab('managers')}
            className={cn(
              "flex items-center space-x-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              tab === 'managers' ? "bg-brand-green text-black" : "text-brand-text-muted hover:text-brand-text-white"
            )}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Top Mánagers</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto touch-scroll pb-24 h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === 'players' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === 'players' ? 20 : -20 }}
            transition={{ duration: 0.3 }}
          >
            {tab === 'players' ? <PlayerSearch /> : <ManagerView />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-12 pt-12 border-t border-brand-border/10 px-4">
          <Footer />
        </div>
      </div>
    </div>
  );
}
