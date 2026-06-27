import React from 'react';
import { cn } from '../types';

export type IconVariant = 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'orange';
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

interface CustomIconWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: IconVariant;
  size?: IconSize;
  children: React.ReactNode;
}

export function CustomIconWrapper({
  variant = 'green',
  size = 'md',
  children,
  className,
  ...props
}: CustomIconWrapperProps) {
  // Map our semantic variant to our stylesheet modifier class
  const variantClass = {
    green: 'custom-icon-wrapper-green hover:border-brand-green/30',
    blue: 'custom-icon-wrapper-blue hover:border-brand-blue/30',
    yellow: 'custom-icon-wrapper-yellow hover:border-brand-yellow/30',
    red: 'custom-icon-wrapper-red hover:border-brand-red/30',
    purple: 'custom-icon-wrapper-purple hover:border-brand-purple/30',
    orange: 'custom-icon-wrapper-orange hover:border-brand-orange/30',
  }[variant];

  // Map sizing options
  const sizeClass = {
    sm: 'w-8 h-8 rounded-xl scale-90',
    md: 'w-10 h-10 rounded-2xl',
    lg: 'w-12 h-12 rounded-[1.25rem]',
    xl: 'w-16 h-16 rounded-[2rem]',
  }[size];

  return (
    <div
      className={cn(
        'custom-icon-wrapper',
        variantClass,
        sizeClass,
        className
      )}
      {...props}
    >
      <div className="relative z-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
