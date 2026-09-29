import React from 'react';
import spendDeskLogoPng from '../assets/images/spenddesk_logo.png';

interface SpendDeskLogoProps {
  className?: string;
  variant?: 'full' | 'icon' | 'app-icon' | 'horizontal-image';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const SpendDeskLogo: React.FC<SpendDeskLogoProps> = ({
  className = '',
  variant = 'full',
  size = 'md',
}) => {
  // Brand logo green (#10B77F) matching uploaded logo PNG
  const primaryColor = '#10B77F';

  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }[size];

  const textSizes = {
    sm: 'text-base font-extrabold tracking-tight',
    md: 'text-lg sm:text-xl font-black tracking-tight',
    lg: 'text-2xl font-black tracking-tight',
    xl: 'text-3xl font-black tracking-tight',
  }[size];

  // Exact uploaded PNG logo image element
  const logoImage = (
    <img
      src={spendDeskLogoPng}
      alt="SpendDesk Logo"
      className="w-full h-full object-contain select-none"
    />
  );

  if (variant === 'icon') {
    return (
      <div className={`shrink-0 ${iconDimensions} ${className}`}>
        {logoImage}
      </div>
    );
  }

  if (variant === 'app-icon') {
    return (
      <div className={`shrink-0 ${iconDimensions} rounded-2xl bg-white p-1 shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden ${className}`}>
        {logoImage}
      </div>
    );
  }

  if (variant === 'horizontal-image') {
    return (
      <div className={`shrink-0 h-9 sm:h-10 flex items-center gap-2 ${className}`}>
        <div className="h-full aspect-square">{logoImage}</div>
        <span className="text-xl font-black tracking-tight" style={{ color: primaryColor }}>
          SpendDesk
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <div className={`shrink-0 ${iconDimensions} flex items-center justify-center overflow-hidden`}>
        {logoImage}
      </div>
      <div className="flex items-center select-none">
        <span
          className={`${textSizes} leading-none font-sans tracking-tight`}
          style={{ color: primaryColor }}
        >
          Spend<span className="font-black" style={{ color: primaryColor }}>Desk</span>
        </span>
      </div>
    </div>
  );
};
