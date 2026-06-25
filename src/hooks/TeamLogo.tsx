import React, { useState } from 'react';
import { cn } from '../types';

interface TeamLogoProps {
  name: string;
  logoUrl?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function TeamLogo({ name, logoUrl, className, size = 'md' }: TeamLogoProps) {
  const [error, setError] = useState(false);

  const getInitials = (teamName?: string) => {
    if (!teamName) return '??';
    const parts = teamName.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return teamName.substring(0, 3).toUpperCase();
  };

  const getBgColor = (teamName?: string) => {
    if (!teamName) return '#222222';
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) {
      hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

  const sizeClasses = {
    xs: 'w-8 h-8 text-[10px]',
    sm: 'w-12 h-12 text-xs',
    md: 'w-16 h-16 text-sm',
    lg: 'w-14 h-14 sm:w-24 sm:h-24 text-base sm:text-2xl',
    xl: 'w-16 h-16 sm:w-32 sm:h-32 text-lg sm:text-3xl',
  };

  if (logoUrl && !error) {
    return (
      <div className={cn("rounded-xl overflow-hidden border border-brand-border bg-brand-bg-primary shrink-0", sizeClasses[size], className)}>
        <img 
          src={logoUrl} 
          alt={name} 
          className="w-full h-full object-contain p-1" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "rounded-xl border border-brand-border flex items-center justify-center font-display font-bold text-brand-text-white shrink-0",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: getBgColor(name) + '40' }} // 25% opacity
    >
      <span style={{ color: getBgColor(name) }}>{getInitials(name)}</span>
    </div>
  );
}
