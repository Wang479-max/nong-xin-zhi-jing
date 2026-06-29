export interface GeoPosition {
  longitude: number;
  latitude: number;
  height: number;
}

export interface DigitalTwinProps {
  plots: any[];
  activePlotId: string | null;
  onSelectPlot: (id: string) => void;
  onControlHardware: (type: 'irrigation' | 'ventilation' | 'heating' | 'lighting', action?: 'on' | 'off', zone?: string) => void;
  onFertilize: () => void;
  hardwareStatus: Record<string, boolean>;
  realtimeData: any;
  aiResult?: any;
  onExit?: () => void;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
}
