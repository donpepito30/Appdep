import React, { useState } from 'react';
import { Target, Swords } from 'lucide-react';
import { cn } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { SureBetsView } from './SureBetsView';

export function BettingHub() {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-brand-bg-primary">
      {/* Header */}
      <div className="p-4 md:p-6 flex flex-col justify-center items-center border-b border-brand-border/30 bg-brand-bg-card/20 backdrop-blur-md shrink-0">
        <h2 className="text-2xl md:text-3xl font-display font-black text-brand-text-white uppercase tracking-wider mb-2">
          Herramientas <span className="text-brand-green">Apuestas</span>
        </h2>
        <div className="flex items-center space-x-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-brand-green text-black shadow-lg">
          <Target className="w-5 h-5" />
          <span>Value Bets</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <SureBetsView />
      </div>
    </div>
  );
}
