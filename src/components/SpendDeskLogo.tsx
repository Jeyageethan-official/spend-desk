import React, { useState } from 'react';
import spendDeskIcon from '../assets/images/spenddesk_icon_1790441717122.jpg';
import spendDeskFullLogo from '../assets/images/spenddesk_full_logo_1790441732059.jpg';

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
  const [imageError, setImageError] = useState(false);

  // Exact SpendDesk brand green (#116b4e) from reference image
  const primaryColor = '#116b4e';

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

  // Fallback vector SVG if image fails to load
  const fallbackSvg = (
    <svg
      viewBox="0 0 100 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      <rect x="10" y="38" width="13" height="26" rx="2.5" fill={primaryColor} />
      <rect x="33" y="49" width="12" height="15" rx="2" fill={primaryColor} />
      <rect x="66" y="10" width="14" height="54" rx="3" fill={primaryColor} />
      <path
        d="M 10 70.5 C 10 67.5 12 65.5 15 65.5 L 63 65.5 C 71 65.5 75 62 75 56 C 75 50.5 70 47.5 61 45.5 L 50 43 C 37 40 31 35 31 25.5 C 31 15 41 9 53 9 C 62 9 69 12 73 16 L 70 24 C 66 20.5 60.5 18 53 18 C 47.5 18 41 21 41 25.5 C 41 30.5 45.5 33 55 35 L 66 37.5 C 80 40.5 86 46.5 86 56 C 86 68 76 75.5 63 75.5 L 15 75.5 C 12 75.5 10 73.5 10 70.5 Z"
        fill={primaryColor}
      />
    </svg>
  );

  const iconElement = !imageError ? (
    <img
      src={spendDeskIcon}
      alt="SpendDesk"
      referrerPolicy="no-referrer"
      onError={() => setImageError(true)}
      className="w-full h-full object-contain rounded-xl select-none"
    />
  ) : (
    fallbackSvg
  );

  if (variant === 'icon') {
    return (
      <div className={`shrink-0 ${iconDimensions} ${className}`}>
        {iconElement}
      </div>
    );
  }

  if (variant === 'app-icon') {
    return (
      <div className={`shrink-0 ${iconDimensions} rounded-2xl bg-white p-1 shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden ${className}`}>
        {iconElement}
      </div>
    );
  }

  if (variant === 'horizontal-image') {
    return (
      <div className={`shrink-0 h-9 sm:h-10 flex items-center ${className}`}>
        <img
          src={spendDeskFullLogo}
          alt="SpendDesk"
          referrerPolicy="no-referrer"
          className="h-full w-auto object-contain select-none"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <div className={`shrink-0 ${iconDimensions} rounded-xl overflow-hidden`}>
        {iconElement}
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
