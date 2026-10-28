import React from 'react'

interface DingooLogoProps {
  className?: string
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function DingooLogo({ className = '', showText = true, size = 'md' }: DingooLogoProps) {
  const iconSizes = {
    sm: 'size-7',
    md: 'size-8 sm:size-9',
    lg: 'size-11 sm:size-12',
  }

  const textSizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl sm:text-4xl',
  }

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Tactile Dingoo Icon Stamp */}
      <div
        className={`${iconSizes[size]} relative rounded-xl bg-gradient-to-br from-[#FF6B53] to-[#EA3E24] p-[2.5px] shadow-[0_4px_10px_rgba(234,62,36,0.28)] flex-shrink-0 transition-transform hover:scale-105 active:scale-95`}
      >
        <div className="w-full h-full rounded-[9px] bg-[#FAF8F5] flex items-center justify-center relative overflow-hidden">
          {/* Subtle grid lines */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#1e1815_1px,transparent_1px)] [background-size:6px_6px]" />
          
          {/* Bold stylized D */}
          <span className="font-display font-black text-[#1E1815] text-sm sm:text-base leading-none tracking-tighter relative z-10 pl-0.5">
            D
          </span>

          {/* Tiny bingo star accent */}
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#FFD159] border border-white/60 shadow-xs" />
        </div>
      </div>

      {showText && (
        <span
          className={`font-display font-bold tracking-tight text-[oklch(20%_0.014_255)] ${textSizes[size]}`}
        >
          dingoo<span className="text-[oklch(68%_0.21_24)]">.</span>
        </span>
      )}
    </div>
  )
}
