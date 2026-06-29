import { useEffect, useRef } from 'react';

type HotkeyCallback = (event: KeyboardEvent) => void;

interface HotkeyMap {
  [combo: string]: HotkeyCallback;
}

export function useHotkeys(hotkeyMap: HotkeyMap, deps: any[] = []) {
  const mapRef = useRef<HotkeyMap>(hotkeyMap);

  // Sync reference to avoid stale closures
  useEffect(() => {
    mapRef.current = hotkeyMap;
  }, [hotkeyMap, ...deps]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta'];
      if (modifierKeys.includes(event.key)) return;

      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');

      let keyName = (event.key || '').toLowerCase();
      if (keyName === 'escape') keyName = 'esc';
      
      parts.push(keyName);
      const combo = parts.join('+');

      // Check if target is an editable input or textarea
      const target = event.target as HTMLElement | null;
      const isInput = !!(
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
      );

      // Smart skip navigation shortcuts inside input fields to preserve native typing
      const navigationShortcuts = [
        'ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4', 'ctrl+5', 'ctrl+6',
        'ctrl+b', 'ctrl+d', 'ctrl+z'
      ];

      if (isInput && navigationShortcuts.includes(combo)) {
        return;
      }

      // If mapped, prevent default browser action and execute handler
      if (mapRef.current[combo]) {
        event.preventDefault();
        mapRef.current[combo](event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
