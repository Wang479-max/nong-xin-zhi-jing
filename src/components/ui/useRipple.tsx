import React, { useState, useCallback, MouseEvent } from 'react';

export interface Ripple {
  x: number;
  y: number;
  size: number;
  id: number;
}

export const useRipple = () => {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const addRipple = useCallback((event: MouseEvent<HTMLElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const newRipple = { x, y, size, id: Date.now() };
    setRipples((prevRipples) => [...prevRipples, newRipple]);

    setTimeout(() => {
      setRipples((prevRipples) => prevRipples.filter((r) => r.id !== newRipple.id));
    }, 600);
  }, []);

  return { ripples, addRipple };
};

export const RippleEffect = ({ ripples, isDark }: { ripples: Ripple[], isDark?: boolean }) => {
  if (ripples.length === 0) return null;
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full animate-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
            backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.4)',
            transform: 'scale(0)',
            opacity: 1,
          }}
        />
      ))}
    </div>
  );
};
