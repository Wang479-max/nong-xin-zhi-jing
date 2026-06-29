import React, { useState, useEffect, useMemo } from 'react';
import { Viewer, ImageryLayer, Entity, PolygonGraphics, CameraFlyTo, PolylineGraphics, CloudCollection, CumulusCloud, PointGraphics } from 'resium';
import { Color, Cartesian3, Cartesian2, OpenStreetMapImageryProvider, PolylineGlowMaterialProperty, CallbackProperty } from 'cesium';
import { DigitalTwinProps } from './shared/types';

const DATA_CENTER_LON = 120.1;
const DATA_CENTER_LAT = 30.25;

export default function CesiumMacroView({ plots, activePlotId, onSelectPlot, viewMode, isImmersive }: DigitalTwinProps & { viewMode: string }) {
  const [osmProvider, setOsmProvider] = useState<OpenStreetMapImageryProvider | null>(null);
  const [dronePositions, setDronePositions] = useState<CallbackProperty[]>([]);

  // Calculate plot coordinates based on plots
  const plotCoordinates = useMemo(() => {
    return plots.map((plot, i) => {
      const centerLongitude = 120.1551 + (i % 3) * 0.05;
      const centerLatitude = 30.2741 + Math.floor(i / 3) * 0.05;
      return {
        ...plot,
        centerLongitude,
        centerLatitude,
        path: [
          centerLongitude - 0.01, centerLatitude - 0.01,
          centerLongitude + 0.01, centerLatitude - 0.01,
          centerLongitude + 0.01, centerLatitude + 0.01,
          centerLongitude - 0.01, centerLatitude + 0.01,
        ]
      };
    });
  }, [plots]);

  useEffect(() => {
    setOsmProvider(new OpenStreetMapImageryProvider({
      url : 'https://a.tile.openstreetmap.org/'
    }));
    
    const positions = Array.from({ length: 5 }).map((_, i) => {
      return new CallbackProperty((timeResult, result) => {
        const seconds = Date.now() / 1000;
        const angle = seconds * 0.15 + (i * Math.PI * 2) / 5;
        const dLon = 120.1551 + Math.cos(angle) * 0.06;
        const dLat = 30.2741 + Math.sin(angle) * 0.06;
        return Cartesian3.fromDegrees(dLon, dLat, 500, undefined, result);
      }, false);
    });
    setDronePositions(positions);
  }, []);

  return (
    <div className="w-full h-full bg-slate-900 absolute inset-0">
      <Viewer
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        homeButton={false}
        geocoder={false}
        sceneModePicker={false}
        infoBox={false}
        selectionIndicator={false}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {osmProvider && <ImageryLayer imageryProvider={osmProvider} />}
        {viewMode === 'macro' && (
          <CameraFlyTo
            duration={2}
            destination={Cartesian3.fromDegrees(120.1551, 30.20, 15000)}
          />
        )}

        <CloudCollection noiseDetail={16.0}>
           <CumulusCloud position={Cartesian3.fromDegrees(120.15, 30.27, 2000)} scale={new Cartesian2(5000, 2000)} maximumSize={new Cartesian3(5000, 2000, 1000)} show={true} slice={0.3} />
           <CumulusCloud position={Cartesian3.fromDegrees(120.2, 30.3, 2500)} scale={new Cartesian2(6000, 3000)} maximumSize={new Cartesian3(6000, 3000, 1500)} show={true} slice={0.4} />
        </CloudCollection>

        {/* Data Center Marker */}
        <Entity name="Nexus Data Center" position={Cartesian3.fromDegrees(DATA_CENTER_LON, DATA_CENTER_LAT, 0)}>
           <PointGraphics pixelSize={20} color={Color.fromCssColorString('#0ea5e9')} outlineColor={Color.fromCssColorString('#bae6fd')} outlineWidth={4} />
        </Entity>

        {/* Drones */}
        {dronePositions.map((positionProperty, i) => {
           return (
             <Entity key={`drone-${i}`} position={positionProperty as any}>
                <PointGraphics pixelSize={8} color={Color.CYAN} outlineColor={Color.WHITE} outlineWidth={2} />
             </Entity>
           )
        })}
        
        {plotCoordinates.map((plot) => {
          const isSelected = activePlotId === plot.id;
          return (
            <React.Fragment key={plot.id}>
              {/* Plot Boundary */}
              <Entity
                name={plot.name}
                description={`Crop: ${plot.crop}, Area: ${plot.area} acres`}
                onClick={() => onSelectPlot(plot.id)}
              >
                <PolygonGraphics
                  hierarchy={Cartesian3.fromDegreesArray(plot.path)}
                  fill={true}
                  material={isSelected ? Color.CYAN.withAlpha(0.5) : Color.GREEN.withAlpha(0.3)}
                  outline={true}
                  outlineColor={isSelected ? Color.CYAN : Color.GREEN}
                  outlineWidth={4}
                />
              </Entity>
              
              {/* Data flow line */}
              <Entity>
                  <PolylineGraphics 
                      positions={Cartesian3.fromDegreesArrayHeights([
                          plot.centerLongitude, plot.centerLatitude, 0,
                          (plot.centerLongitude + DATA_CENTER_LON) / 2, (plot.centerLatitude + DATA_CENTER_LAT) / 2, 800,
                          DATA_CENTER_LON, DATA_CENTER_LAT, 0
                      ])}
                      width={isSelected ? 5 : 2}
                      material={new PolylineGlowMaterialProperty({
                          glowPower: 0.2,
                          color: isSelected ? Color.CYAN : Color.fromCssColorString('#10b981')
                      })}
                  />
              </Entity>
            </React.Fragment>
          );
        })}
      </Viewer>
    </div>
  );
}
