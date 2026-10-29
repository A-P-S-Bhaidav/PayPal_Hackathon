import React from 'react';

interface AegisLogoProps {
  compact?: boolean;
  className?: string;
}

export const AegisLogo: React.FC<AegisLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div className="relative w-9 h-9 shrink-0 bg-[#050507] border-[1.5px] border-[#0047FF] flex items-center justify-center shadow-[2px_2px_0_#CCFF00]">
        <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none" aria-hidden="true">
          <path
            d="M20 4L33 10.2V20.5C33 28.4 27.4 34.4 20 36.4C12.6 34.4 7 28.4 7 20.5V10.2L20 4Z"
            fill="#0A0E1A"
            stroke="#0047FF"
            strokeWidth="2"
          />
          <path
            d="M20 8.5L28.5 12.6V20C28.5 25.5 24.8 29.8 20 31.4V8.5Z"
            fill="#0047FF"
            fillOpacity="0.38"
          />
          <path d="M13.5 24L20 11L26.5 24H22.8L20 18.2L17.2 24H13.5Z" fill="#F8FAFC" />
          <rect x="15" y="26.5" width="10" height="3" fill="#CCFF00" />
          <circle cx="32.5" cy="7.5" r="2.5" fill="#CCFF00" />
        </svg>
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-bold text-base tracking-tight text-[#F8FAFC]">
              AEGISPAY
            </span>
            <span className="px-1.5 py-0.5 bg-[#CCFF00] text-[#050507] font-mono text-[10px] font-extrabold tracking-wider">
              OS
            </span>
          </div>
          <span className="font-mono text-[9px] tracking-[0.16em] text-[#94A3B8] mt-1 uppercase">
            PayPal AI Kernel
          </span>
        </div>
      )}
    </div>
  );
};
