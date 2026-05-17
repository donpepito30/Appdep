import React from 'react';
import { motion } from 'motion/react';

export function FootballLoader() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <div className="relative">
        {/* Ball shadow */}
        <motion.div
          animate={{
            scale: [1, 0.6, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/40 blur-sm rounded-full"
        />
        
        {/* Bouncing Ball */}
        <motion.div
          animate={{
            y: [0, -40, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative w-12 h-12 flex items-center justify-center"
        >
          {/* Soccer ball SVG */}
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-brand-text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 2L14.5 9.5H21.5L16 14L18 21.5L12 17L6 21.5L8 14L2.5 9.5H9.5L12 2Z" fill="currentColor" className="opacity-20" />
            <path d="M12 7V17M7 12H17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </motion.div>
      </div>

      <div className="flex flex-col items-center space-y-2">
        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl md:text-5xl font-black text-brand-text-white tracking-tighter"
        >
          PRECISION<span className="text-brand-green">_BET</span>
        </motion.h1>
        
        <div className="flex items-center space-x-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              className="w-1.5 h-1.5 bg-brand-green rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
