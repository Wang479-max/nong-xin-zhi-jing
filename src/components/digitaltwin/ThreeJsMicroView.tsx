import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Sparkles, Float, Html, Instances, Instance, Box, Cylinder, useProgress } from '@react-three/drei';
import { Camera } from 'lucide-react';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { DigitalTwinProps } from './shared/types';
import {
  getCropProfile,
  interpolateMorphology,
  scoreByStatus,
  estimateYieldKgPerMu,
  mulberry32,
  hashStringToSeed,
  type CropAgronomyProfile,
} from './cropAgronomy';
import * as THREE from 'three';
import gsap from 'gsap';

// 田块农艺参数全局调控（行距/株距/密度/垄沟/种子）——数字孪生虚实映射核心可调项
export interface AgronomyConfig {
  rowSpacingCm: number;   // 行距 (cm)
  plantSpacingCm: number; // 株距 (cm)
  densityFactor: number;  // 密度系数 (0.5-1.5)，统一缩放实际播种密度
  seed: number;           // 随机种子（可复现性：同种子+参数→完全一致田块）
  ridgeSpacingCm: number; // 垄距/畦距 (cm)
  ridgeHeightCm: number;  // 垄高 (cm)
  ridgeWidthCm: number;   // 垄顶宽 (cm)
}

// ==========================================
// 0. 自适应画质系统（按设备性能动态调节，保证流畅 + 兼顾逼真）
// ==========================================
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | QualityTier;
export const QUALITY_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_LABEL: Record<QualityTier, string> = { ultra: '极致', high: '高', medium: '中', low: '低' };

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  shadowsEnabled: boolean;
  shadowMapSize: number;
  leafShadow: boolean;
  starCount: number;
  bloomEnabled: boolean;
  bloomHeight: number;
  chromaticAberration: boolean;
  lod0Budget: number;   // 近景单块植株上限
  lod0Distance: number; // 距离 ≤ 该值 → LOD0（全细节）
  lod1Distance: number; // 距离 ≤ 该值 → LOD1，否则 LOD2
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  ultra:  { tier: 'ultra',  dpr: [1, 2],    shadowsEnabled: true,  shadowMapSize: 4096, leafShadow: true,  starCount: 2500, bloomEnabled: true,  bloomHeight: 300, chromaticAberration: true,  lod0Budget: 5400, lod0Distance: 45, lod1Distance: 90 },
  high:   { tier: 'high',   dpr: [1, 1.5],  shadowsEnabled: true,  shadowMapSize: 2048, leafShadow: false, starCount: 1500, bloomEnabled: true,  bloomHeight: 200, chromaticAberration: true,  lod0Budget: 3600, lod0Distance: 38, lod1Distance: 80 },
  medium: { tier: 'medium', dpr: [1, 1.25], shadowsEnabled: true,  shadowMapSize: 1024, leafShadow: false, starCount: 800,  bloomEnabled: true,  bloomHeight: 150, chromaticAberration: false, lod0Budget: 2400, lod0Distance: 30, lod1Distance: 70 },
  low:    { tier: 'low',    dpr: [1, 1],    shadowsEnabled: false, shadowMapSize: 512,  leafShadow: false, starCount: 0,    bloomEnabled: false, bloomHeight: 120, chromaticAberration: false, lod0Budget: 1400, lod0Distance: 24, lod1Distance: 60 },
};

// R3F 自有 reconciler 不会自动透传外层 Context，故 Provider 必须置于 Canvas 内部
const QualityContext = React.createContext<QualitySettings>(QUALITY_PRESETS.high);
const useQuality = () => React.useContext(QualityContext);

// 进场时根据硬件信息粗判起步档位（CPU 核数 / 内存 / GPU 型号 / 是否移动端）
export function detectInitialTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'high';
  const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
  if (isMobile) return 'low';
  const cores = (navigator as any).hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 4;
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
  } catch { /* ignore */ }
  const weakGpu = /intel|uhd|hd graphics|swiftshader|llvmpipe|microsoft basic/.test(gpu);
  const strongGpu = /rtx|radeon rx|geforce|apple m\d|quadro|arc a/.test(gpu);
  if (strongGpu && cores >= 8 && mem >= 8) return 'ultra';
  if (weakGpu || cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

// ==========================================
// 1. DYNAMIC TELEMETRY INTERCONNECTIONS
// ==========================================

// GSAP Cinematic Cam Rail Controller (5D Tracking Shots)
function CameraController({ activePlotId, plots, cameraPreset }: { activePlotId: string | null, plots: any[], cameraPreset: string }) {
  const { camera, controls } = useThree();
  
  useEffect(() => {
    if (!activePlotId) {
      // 电影级高视角全景，动态根据所有地块计算中心点与跨度，确保全视野覆盖（含所有土地及周边环境）
      const fieldSpan = Math.max(240, plots.length * 30 + 260); 
      const fovRad = ((camera as any).fov || 45) * (Math.PI / 180);
      // 根据视野跨度动态计算最佳观察距离
      const dist = fieldSpan / (2 * Math.tan(fovRad / 2));
      
      const targetCamY = Math.max(120, dist * 0.85);
      const targetCamZ = Math.max(180, dist * 1.35); 
      const targetCamX = dist * 0.4; // 侧向黄金偏置角
      
      gsap.to(camera.position, { x: targetCamX, y: targetCamY, z: targetCamZ, duration: 2.8, ease: "power2.inOut" });

      if (controls && (controls as any).target) {
          gsap.to((controls as any).target, { x: 0, y: 0, z: -15, duration: 2.5, ease: "power2.inOut" });
      }
      return;
    }

    const idx = plots.findIndex(p => p.id === activePlotId);
    if (idx === -1) return;
    const halfWidth = ((plots.length - 1) * 30) / 2;
    const targetX = idx * 30 - halfWidth; // Layout spacing calculation, 自适应居中对齐

    let targetCamPos = [targetX + 22, 16, 28];
    let targetLookAt = [targetX, 0, 0];

    switch (cameraPreset) {
      case 'canopy':
        // Zooming close into the plant leaf canopy
        targetCamPos = [targetX, 2.8, 7.2];
        targetLookAt = [targetX, 0.9, -1.8];
        break;
      case 'subsoil':
        // Underworld perspective staring at the soil strata split
        targetCamPos = [targetX - 8.5, -2.2, 12.5];
        targetLookAt = [targetX, -1.8, -1.5];
        break;
      case 'sensor':
        // Focus directly on the IoT smart sensor transceiver module
        targetCamPos = [targetX + 11.2, 4.2, 13.5];
        targetLookAt = [targetX + 7.5, 2.5, 11];
        break;
      case 'actuator':
        // Focus upwards at overhead LED lighting frames & central dynamic sprinkler
        targetCamPos = [targetX - 4.5, 4.8, 6.2];
        targetLookAt = [targetX, 2.0, 0];
        break;
      case 'overview':
      default:
        // Default tactical drone overview angle for monitoring
        targetCamPos = [targetX + 18, 13.5, 24];
        targetLookAt = [targetX, 0, 0];
        break;
    }

    gsap.to(camera.position, {
      x: targetCamPos[0],
      y: targetCamPos[1],
      z: targetCamPos[2],
      duration: 1.8,
      ease: "power3.inOut"
    });

    if (controls && (controls as any).target) {
      gsap.to((controls as any).target, {
        x: targetLookAt[0],
        y: targetLookAt[1],
        z: targetLookAt[2],
        duration: 1.8,
        ease: "power3.inOut"
      });
    }
  }, [activePlotId, cameraPreset, camera, controls, plots]);

  return null;
}

// Custom wind waving dynamic shader configuration
const WaveMaterial = new THREE.MeshStandardMaterial({
  color: '#22c55e',
  roughness: 0.7,
  metalness: 0.1
});
WaveMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.time = { value: 0 };
  shader.vertexShader = `
    uniform float time;
    ${shader.vertexShader}
  `.replace(
    `#include <begin_vertex>`,
    `
    #include <begin_vertex>
    // Procedural waving offset simulating localized crop micro-eddies
    float wave = sin(position.y * 3.0 + time * 3.8 + position.x * 12.0) * 0.12 * position.y;
    transformed.x += wave;
    transformed.z += wave * 0.5;
    `
  );
  WaveMaterial.userData.shader = shader;
};

// ==========================================
// 2. PROCEDURAL HIGH-FIDELITY CROPS
// ==========================================

// Highly detailed procedural wheat stalk plant structure
function WheatStalk({ position, scale, plotLod = 0 }: { position: [number, number, number], scale: number, plotLod?: number }) {
  const stemHeight = 1.4 * scale;

  if (plotLod === 2) {
    return (
      <group position={position}>
        <mesh position={[0, stemHeight / 2, 0]}>
          <cylinderGeometry args={[0.02, 0.03, stemHeight, 3]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.9} />
        </mesh>
      </group>
    );
  }

  if (plotLod === 1) {
    return (
      <group position={position}>
        <mesh position={[0, stemHeight / 2, 0]} castShadow>
          <cylinderGeometry args={[0.015, 0.025, stemHeight, 4]} />
          <meshStandardMaterial color="#eab308" roughness={0.8} />
        </mesh>
        <mesh position={[0.08, stemHeight / 2, 0]} rotation={[0, 0, 0.45]}>
          <boxGeometry args={[0.2, 0.01, 0.04]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.9} />
        </mesh>
        <mesh position={[0, stemHeight, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, 0.45, 4]} />
          <meshStandardMaterial color="#facc15" roughness={0.6} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Golden STEM */}
      <mesh position={[0, stemHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.025, stemHeight, 5]} />
        <meshStandardMaterial color="#eab308" roughness={0.8} />
      </mesh>
      {/* Slanted wheat green-golden leaves */}
      <mesh position={[0.08, stemHeight / 2, 0]} rotation={[0, 0, 0.45]} castShadow>
        <boxGeometry args={[0.2, 0.01, 0.04]} />
        <meshStandardMaterial color="#ca8a04" roughness={0.9} />
      </mesh>
      <mesh position={[-0.08, stemHeight * 0.7, 0]} rotation={[0, 0, -0.45]} castShadow>
        <boxGeometry args={[0.22, 0.01, 0.04]} />
        <meshStandardMaterial color="#b45309" roughness={0.9} />
      </mesh>
      {/* Golden Grain Beard Peak on top */}
      <mesh position={[0, stemHeight, 0]} castShadow>
         <cylinderGeometry args={[0.04, 0.06, 0.45, 6]} />
         <meshStandardMaterial color="#facc15" roughness={0.6} />
      </mesh>
      {/* Stylized tiny wheat fibers */}
      <mesh position={[0, stemHeight + 0.22, 0]} rotation={[0.2, 0, 0]}>
         <boxGeometry args={[0.01, 0.12, 0.01]} />
         <meshStandardMaterial color="#fef08a" />
      </mesh>
    </group>
  );
}

// Procedural high-realism Corn stalk with massive broad waving leaves & golden ears
function CornStalk({ position, scale, plotLod = 0 }: { position: [number, number, number], scale: number, plotLod?: number }) {
  const stalkHeight = 2.1 * scale;

  if (plotLod === 2) {
    return (
      <group position={position}>
        <mesh position={[0, stalkHeight / 2, 0]}>
          <cylinderGeometry args={[0.03, 0.05, stalkHeight, 3]} />
          <meshStandardMaterial color="#166534" roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (plotLod === 1) {
    return (
      <group position={position}>
        <mesh position={[0, stalkHeight / 2, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.057, stalkHeight, 4]} />
          <meshStandardMaterial color="#166534" roughness={0.6} />
        </mesh>
        <mesh rotation={[0.4, 0, 0.65]} position={[0.2, stalkHeight * 0.4, 0]}>
          <boxGeometry args={[0.5, 0.015, 0.12]} />
          <meshStandardMaterial color="#15803d" roughness={0.5} />
        </mesh>
        <group position={[0.09, stalkHeight * 0.52, 0.05]} rotation={[0, 0.3, -0.22]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.07, 0.35, 4]} />
            <meshStandardMaterial color="#eab308" roughness={0.4} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Thick Green Culm Stem */}
      <mesh position={[0, stalkHeight / 2, 0]} castShadow>
         <cylinderGeometry args={[0.03, 0.057, stalkHeight, 6]} />
         <meshStandardMaterial color="#166534" roughness={0.6} />
      </mesh>
      {/* Giant broad curled flanking leaves */}
      <group position={[0, stalkHeight * 0.4, 0]}>
        <mesh rotation={[0.4, 0, 0.65]} position={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.65, 0.015, 0.15]} />
          <meshStandardMaterial color="#15803d" roughness={0.5} />
        </mesh>
        <mesh rotation={[-0.4, 1.2, -0.65]} position={[-0.2, 0.1, 0]} castShadow>
          <boxGeometry args={[0.65, 0.015, 0.15]} />
          <meshStandardMaterial color="#166534" roughness={0.5} />
        </mesh>
      </group>
      {/* Dynamic Golden Corn Cob nestled on the leaf connection node */}
      <group position={[0.09, stalkHeight * 0.52, 0.05]} rotation={[0, 0.3, -0.22]}>
         {/* Maize Core */}
         <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.42, 6]} />
            <meshStandardMaterial color="#eab308" roughness={0.4} />
         </mesh>
         {/* Protective husk skin (translucent light green) */}
         <mesh position={[-0.02, -0.05, 0]} rotation={[0, 0, 0.15]}>
            <boxGeometry args={[0.04, 0.38, 0.12]} />
            <meshStandardMaterial color="#86efac" roughness={0.8} />
         </mesh>
      </group>
    </group>
  );
}

// 模拟田三号专属高精真实感大豆植株（茂密三出复叶、精致毛豆荚与微型紫色花蕾）
function SoybeanPlant({ position, scale, plotLod = 0 }: { position: [number, number, number], scale: number, plotLod?: number }) {
  const height = 0.85 * scale;

  if (plotLod === 2) {
    return (
      <group position={position}>
        <mesh position={[0, height / 2, 0]}>
          <cylinderGeometry args={[0.02, 0.03, height, 3]} />
          <meshStandardMaterial color="#2d5a27" roughness={0.8} />
        </mesh>
      </group>
    );
  }

  if (plotLod === 1) {
    return (
      <group position={position}>
        <mesh position={[0, height / 2, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.035, height, 4]} />
          <meshStandardMaterial color="#2d5a27" roughness={0.8} />
        </mesh>
        <mesh position={[0, height * 0.5, 0]} castShadow>
          <sphereGeometry args={[0.22, 4, 4]} />
          <meshStandardMaterial color="#15803d" roughness={0.65} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position}>
      {/* 豆株中央绿色茎秆 */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.035, height, 5]} />
        <meshStandardMaterial color="#2d5a27" roughness={0.8} />
      </mesh>
      
      {/* 丰满的三叶草型复叶球状丛，高低错落提升真实感 */}
      <group position={[0, height * 0.4, 0]}>
        <mesh position={[0.16, 0.1, 0.1]} rotation={[0.2, 0.3, 0.5]} castShadow>
          <sphereGeometry args={[0.23, 5, 5]} />
          <meshStandardMaterial color="#166534" roughness={0.6} />
        </mesh>
        <mesh position={[-0.16, 0.05, -0.1]} rotation={[-0.2, -0.3, -0.5]} castShadow>
          <sphereGeometry args={[0.25, 5, 5]} />
          <meshStandardMaterial color="#15803d" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.22, -0.16]} rotation={[0.4, 0, 0]} castShadow>
          <sphereGeometry args={[0.21, 5, 5]} />
          <meshStandardMaterial color="#14532d" roughness={0.7} />
        </mesh>
      </group>

      {/* 倒挂的饱满嫩绿毛豆荚（毛茸茸效果） */}
      <group position={[0, height * 0.35, 0]}>
        <mesh position={[0.11, -0.06, 0.13]} rotation={[0.3, 0.5, 0.8]} castShadow>
          <boxGeometry args={[0.045, 0.17, 0.045]} />
          <meshStandardMaterial color="#4ade80" roughness={0.9} />
        </mesh>
        <mesh position={[-0.13, -0.03, 0.09]} rotation={[-0.2, 0.2, -0.7]} castShadow>
          <boxGeometry args={[0.045, 0.17, 0.055]} />
          <meshStandardMaterial color="#22c55e" roughness={0.9} />
        </mesh>
      </group>

      {/* 精致的微型粉紫色大豆花蕊 */}
      <group position={[0, height * 0.55, 0]}>
        <mesh position={[0.07, 0.1, 0.02]} castShadow>
          <sphereGeometry args={[0.05, 4, 4]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[-0.09, 0.05, -0.04]} castShadow>
          <sphereGeometry args={[0.05, 4, 4]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// Detailed Fruit Orchard Tree (Trunk branch network + glowing red apples)
function OrchardTree({ position, scale, plotLod = 0 }: { position: [number, number, number], scale: number, plotLod?: number }) {
  const treeYScale = scale * 1.1;

  if (plotLod === 2) {
    return (
      <group position={position}>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.18, 0.35, 2.2, 3]} />
          <meshStandardMaterial color="#422006" roughness={0.95} />
        </mesh>
        <mesh position={[0, 2.4, 0]}>
          <sphereGeometry args={[1.1, 4, 4]} />
          <meshStandardMaterial color="#14532d" roughness={0.65} />
        </mesh>
      </group>
    );
  }

  if (plotLod === 1) {
    return (
      <group position={position}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.35, 2.2, 4]} />
          <meshStandardMaterial color="#422006" roughness={0.95} />
        </mesh>
        <mesh position={[0, 2.6, 0]} castShadow>
          <sphereGeometry args={[1.25, 6, 6]} />
          <meshStandardMaterial color="#14532d" roughness={0.65} />
        </mesh>
        <mesh position={[0.5, 2.2, 0.5]}>
          <sphereGeometry args={[0.15, 4, 4]} />
          <meshStandardMaterial color="#ef4444" roughness={0.25} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position}>
       {/* Organic textured solid wood trunk */}
       <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.35, 2.2, 7]} />
          <meshStandardMaterial color="#422006" roughness={0.95} />
       </mesh>
       {/* High density branching system */}
       <mesh position={[0.4, 1.9, 0.2]} rotation={[0, 0, -0.55]} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 1.2, 5]} />
          <meshStandardMaterial color="#422006" roughness={0.95} />
       </mesh>
       <mesh position={[-0.4, 2.0, -0.2]} rotation={[0, 0, 0.55]} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 1.2, 5]} />
          <meshStandardMaterial color="#422006" roughness={0.95} />
       </mesh>
       {/* Dense green foliage dome */}
       <mesh position={[0, 2.8, 0]} castShadow>
          <sphereGeometry args={[1.35, 10, 10]} />
          <meshStandardMaterial color="#14532d" roughness={0.65} />
       </mesh>
       {/* Scattered ripe harvest-ready organic Red Apple spheres */}
       <group position={[0, 2.8, 0]}>
         <mesh position={[0.6, -0.3, 0.6]} castShadow>
           <sphereGeometry args={[0.16, 6, 6]} />
           <meshStandardMaterial color="#ef4444" roughness={0.25} emissive="#991b1b" emissiveIntensity={0.6} />
         </mesh>
         <mesh position={[-0.7, -0.1, -0.5]} castShadow>
           <sphereGeometry args={[0.16, 6, 6]} />
           <meshStandardMaterial color="#ef4444" roughness={0.25} emissive="#991b1b" emissiveIntensity={0.6} />
         </mesh>
         <mesh position={[0.1, -0.6, -0.8]} castShadow>
           <sphereGeometry args={[0.15, 6, 6]} />
           <meshStandardMaterial color="#dc2626" roughness={0.2} emissive="#991b1b" emissiveIntensity={0.6} />
         </mesh>
         <mesh position={[-0.4, -0.5, 0.7]} castShadow>
           <sphereGeometry args={[0.15, 6, 6]} />
           <meshStandardMaterial color="#dc2626" roughness={0.2} />
         </mesh>
       </group>
    </group>
  );
}

// Crop Selector router using CPU-friendly structural loops
function PlotSideDecoration({ plotLod = 0 }: { plotLod?: number }) {
  if (plotLod === 2) {
    // LOD 2: Hide everything to save draw calls on extreme far distance plots
    return null;
  }

  if (plotLod === 1) {
    // LOD 1: Render only simple soil borders, skip detailed fences, bushes, flowers, and pumps
    return (
      <group>
        {/* 田埂边缘保护小石阶或泥埂 */}
        <mesh position={[0, -0.02, 12.1]} castShadow receiveShadow>
          <boxGeometry args={[16.2, 0.12, 0.35]} />
          <meshStandardMaterial color="#553c25" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.02, -12.1]} castShadow receiveShadow>
          <boxGeometry args={[16.2, 0.12, 0.35]} />
          <meshStandardMaterial color="#553c25" roughness={0.9} />
        </mesh>
        
        {/* 田埂左边和右边泥埂 */}
        <mesh position={[8.1, -0.02, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.35, 0.12, 24.2]} />
          <meshStandardMaterial color="#553c25" roughness={0.9} />
        </mesh>
        <mesh position={[-8.1, -0.02, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.35, 0.12, 24.2]} />
          <meshStandardMaterial color="#553c25" roughness={0.9} />
        </mesh>
      </group>
    );
  }

  // LOD 0: Render everything in premium high detail
  return (
    <group>
      {/* 田埂边缘保护小石阶或泥埂 */}
      <mesh position={[0, -0.02, 12.1]} castShadow receiveShadow>
        <boxGeometry args={[16.2, 0.12, 0.35]} />
        <meshStandardMaterial color="#553c25" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.02, -12.1]} castShadow receiveShadow>
        <boxGeometry args={[16.2, 0.12, 0.35]} />
        <meshStandardMaterial color="#553c25" roughness={0.9} />
      </mesh>
      
      {/* 田埂左边 and 右边泥埂 */}
      <mesh position={[8.1, -0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 0.12, 24.2]} />
        <meshStandardMaterial color="#553c25" roughness={0.9} />
      </mesh>
      <mesh position={[-8.1, -0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 0.12, 24.2]} />
        <meshStandardMaterial color="#553c25" roughness={0.9} />
      </mesh>

      {/* 田舍木栅栏与灌木丛生机点缀 */}
      {/* 后侧田埂边缘点缀：精美小围栏 */}
      <group position={[-7.0, 0, -11.6]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshStandardMaterial color="#854d0e" roughness={0.9} />
        </mesh>
        <mesh position={[1.5, 0.3, 0]} castShadow>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshStandardMaterial color="#854d0e" roughness={0.9} />
        </mesh>
        <mesh position={[0.75, 0.42, 0]} castShadow>
          <boxGeometry args={[1.58, 0.06, 0.04]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
      </group>
      
      <group position={[5.5, 0, -11.6]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshStandardMaterial color="#854d0e" roughness={0.9} />
        </mesh>
        <mesh position={[1.5, 0.3, 0]} castShadow>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshStandardMaterial color="#854d0e" roughness={0.9} />
        </mesh>
        <mesh position={[0.75, 0.42, 0]} castShadow>
          <boxGeometry args={[1.58, 0.06, 0.04]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
      </group>

      {/* 垄沟处的微型野花和灌木 */}
      {/* 每一个地块边缘随机构建几个小矮灌木和彩点野花，打破直线条呆板 */}
      <group position={[-7.5, 0, 8.5]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <sphereGeometry args={[0.35, 6, 6]} />
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </mesh>
        <mesh position={[0.2, 0.15, -0.3]} castShadow>
          <sphereGeometry args={[0.25, 5, 5]} />
          <meshStandardMaterial color="#166534" roughness={0.9} />
        </mesh>
        {/* 野花小红点、小蓝点 */}
        <mesh position={[0.1, 0.35, 0.1]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.2} />
        </mesh>
      </group>

      <group position={[7.5, 0, -6.5]}>
        <mesh position={[0, 0.18, 0]} castShadow>
          <sphereGeometry args={[0.3, 6, 6]} />
          <meshStandardMaterial color="#16a34a" roughness={0.8} />
        </mesh>
        <mesh position={[-0.1, 0.3, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.2} />
        </mesh>
      </group>

      {/* 经典的农用水泵或水阀接口设备，增加工业农业融合感 */}
      <group position={[-5.0, 0, 11.2]} rotation={[0, Math.PI / 4, 0]}>
        {/* 底座 */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.35, 0.24, 0.35]} />
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* 弯管 */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.25]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[0.1, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.2]} />
          <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function CinematicBackgroundDecorations({ plotsCount }: { plotsCount: number }) {
  // 根据地块总数，在两侧及后侧铺设防护林带、低多边形朦胧远山与数据传输公路，使整个全景呈现无限生机与高拟真度，拒绝黑白空虚
  const totalOffsetWidth = (plotsCount - 1) * 30;
  const halfWidth = plotsCount * 15 + 60;
  const startX = -halfWidth;
  const endX = halfWidth;
  
  return (
    <group position={[0, -0.15, -60]}>
      {/* 1. 远处的朦胧背景山脉 (High-fidelity low-poly far mountains) */}
      <group position={[0, 0, -50]}>
        {/* 左侧远山 */}
        <mesh position={[startX * 0.8, 8, -20]} rotation={[0, 0.5, 0]} castShadow>
          <coneGeometry args={[65, 35, 6]} />
          <meshStandardMaterial color="#14211a" roughness={1.0} flatShading />
        </mesh>
        {/* 中间主峰 */}
        <mesh position={[0, 12, -45]} rotation={[0, -0.3, 0]} castShadow>
          <coneGeometry args={[115, 65, 7]} />
          <meshStandardMaterial color="#0b1712" roughness={1.0} flatShading />
        </mesh>
        {/* 右侧远山 */}
        <mesh position={[endX * 0.8, 7, -25]} rotation={[0, -0.6, 0]} castShadow>
          <coneGeometry args={[55, 30, 6]} />
          <meshStandardMaterial color="#1a2b25" roughness={1.0} flatShading />
        </mesh>
      </group>

      {/* 2. 防护林带 (Windbreak greenbelt rows) */}
      <group position={[0, 0, 15]}>
        {/* Layer 1 */}
        {Array.from({ length: Math.max(30, plotsCount * 5) }).map((_, i) => {
          const xPos = startX - 20 + (i / (Math.max(30, plotsCount * 5) - 1)) * (endX - startX + 40);
          const zOffset = Math.sin(i * 2.1) * 6.5;
          const scale = 1.6 + Math.sin(i * 0.3) * 0.8;
          return (
            <group key={`l1-${i}`} position={[xPos, 0, zOffset]} scale={[scale, scale, scale]}>
              <mesh position={[0, 1.2, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.15, 2.4, 6]} />
                <meshStandardMaterial color="#3f2305" roughness={1.0} />
              </mesh>
              <mesh position={[0, 3.2, 0]} castShadow>
                <coneGeometry args={[0.8, 2.8, 6]} />
                <meshStandardMaterial color="#064e3b" roughness={0.9} />
              </mesh>
            </group>
          );
        })}
        {/* Layer 2 (Background denser layer) */}
        {Array.from({ length: Math.max(40, plotsCount * 6) }).map((_, i) => {
          const xPos = startX - 30 + (i / (Math.max(40, plotsCount * 6) - 1)) * (endX - startX + 60);
          const zOffset = -5 + Math.sin(i * 1.5) * 4.5;
          const scale = 1.8 + Math.sin(i * 0.5) * 0.6;
          return (
            <group key={`l2-${i}`} position={[xPos, 0, zOffset]} scale={[scale, scale, scale]}>
              <mesh position={[0, 1.2, 0]} castShadow>
                <cylinderGeometry args={[0.1, 0.2, 2.4, 6]} />
                <meshStandardMaterial color="#2d1702" roughness={1.0} />
              </mesh>
              <mesh position={[0, 3.5, 0]} castShadow>
                <coneGeometry args={[1.2, 3.5, 6]} />
                <meshStandardMaterial color="#022c22" roughness={0.9} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* 3. 科技路网与大地底座 - 增强真实质感 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 12]}>
        <planeGeometry args={[endX - startX + 220, 3.8]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} />
      </mesh>
      
      {/* 4. 无限地平线绿地延伸 - 消除底部的深空虚无感，增强厚重土地与草地质感 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <planeGeometry args={[3500, 3500]} />
        <meshStandardMaterial color="#0a2a1a" roughness={1.0} metalness={0} />
      </mesh>

      {/* 5. 零星草丛与植被 (Scattered bushes/grass on the ground) */}
      <group position={[0, -0.1, 35]}>
        {Array.from({ length: 80 }).map((_, i) => {
          const x = (Math.random() - 0.5) * (endX - startX + 150);
          const z = (Math.random() - 0.5) * 80;
          // Avoid placing right in the middle where plots are
          if (Math.abs(x) < 40 && z < 10 && z > -30) return null;
          const scale = 0.5 + Math.random() * 1.5;
          const rotY = Math.random() * Math.PI;
          return (
            <mesh key={`bush-${i}`} position={[x, 0.4 * scale, z]} rotation={[0, rotY, 0]} scale={[scale, scale, scale]} castShadow>
              <dodecahedronGeometry args={[0.5, 0]} />
              <meshStandardMaterial color={Math.random() > 0.5 ? "#064e3b" : "#022c22"} roughness={1.0} flatShading />
            </mesh>
          )
        })}
      </group>
    </group>
  );
}

// Crop Selector router using highly optimized InstancedMesh for 1000+ crops (国赛标准)
const wheatStemGeo = new THREE.CylinderGeometry(0.015, 0.025, 1.4, 5);
wheatStemGeo.translate(0, 0.7, 0);
const wheatLeafGeo = new THREE.BoxGeometry(0.22, 0.01, 0.04);
wheatLeafGeo.translate(0.11, 0, 0);

const cornStemGeo = new THREE.CylinderGeometry(0.03, 0.057, 2.1, 6);
cornStemGeo.translate(0, 1.05, 0);
const cornLeafGeo = new THREE.BoxGeometry(0.65, 0.015, 0.15);
cornLeafGeo.translate(0.325, 0, 0);

const WheatStemMaterial = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.8 });
const WheatLeafMaterial = new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.9 });
const CornStemMaterial = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.6 });
const CornLeafMaterial = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.5 });

// 穗部几何（抽穗期程序化生成）：基准高度 1 单位，实例按穗长缩放 Y
// 小麦穗——纺锤形麦穗(多棱角圆柱)；玉米果穗——较粗的棒状
const wheatEarGeo = new THREE.CylinderGeometry(0.035, 0.018, 1.0, 6, 4);
wheatEarGeo.translate(0, 0.5, 0);
const cornEarGeo = new THREE.CylinderGeometry(0.06, 0.05, 1.0, 8, 2);
cornEarGeo.translate(0, 0.5, 0);
const WheatEarMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
const CornEarMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });

const setupMaterialWithWind = (material: THREE.MeshStandardMaterial, isLeaf: boolean = false) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.globalGrowthStage = { value: 1.0 }; // Global modifier
    shader.uniforms.windIntensity = { value: 1.0 };
    shader.uniforms.windDir = { value: new THREE.Vector2(0.707, 0.707) };

    shader.vertexShader = `
      uniform float time;
      uniform float globalGrowthStage;
      uniform float windIntensity;
      uniform vec2 windDir;
      attribute float a_growthStage; // Per-instance
      attribute float a_pestFactor;  // Per-instance pest indicator
      varying float v_pestFactor;
      varying float v_growth;
      varying vec3 vWorldPos;

      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `
      #include <begin_vertex>

      v_pestFactor = a_pestFactor;

      float finalGrowth = a_growthStage * globalGrowthStage;
      v_growth = finalGrowth;

      // Growth animation (scale Y and X/Z based on growth stage)
      transformed.y *= max(0.1, finalGrowth);
      transformed.x *= mix(0.2, 1.0, finalGrowth);
      transformed.z *= mix(0.2, 1.0, finalGrowth);

      // Calculate world-like position for this instance vertex
      vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float globalY = instancePos.y + transformed.y;
      vWorldPos = instancePos + transformed;

      // 风场：沿可调风向 windDir 传播的行波，风力 windIntensity 调幅调频
      // 根部固定、顶部摆动（bendFactor 随高度与生育期增大）；不同生育期幅度差异化
      float windFreq = 1.5 * max(1.0, windIntensity * 0.5);
      float windAmplitude = 0.08 * windIntensity;
      float phase = dot(instancePos.xz, windDir) * 2.0;
      float wind = sin(time * windFreq + phase) * windAmplitude;

      float bendFactor = pow(max(0.0, globalY), 1.5) * 0.3 * finalGrowth;
      transformed.x += wind * bendFactor * windDir.x;
      transformed.z += wind * bendFactor * windDir.y;

      // 倒伏物理：风力超过阈值(2.0级)后茎秆顺风向大幅折弯、株高坍塌，
      // 模拟强风/暴雨下作物倒伏（含个体随机阈值，群体非整齐倒伏）
      float lodgeThreshold = 2.0 + (a_growthStage - 0.9) * 1.5;
      float lodge = smoothstep(lodgeThreshold, lodgeThreshold + 1.0, windIntensity);
      transformed.x += lodge * bendFactor * 3.2 * windDir.x;
      transformed.z += lodge * bendFactor * 3.2 * windDir.y;
      transformed.y -= lodge * pow(max(0.0, globalY), 1.4) * 0.8;
      `
    );

    if (isLeaf) {
      shader.fragmentShader = `
        varying float v_pestFactor;
        varying float v_growth;
        varying vec3 vWorldPos;

        // Simplex noise implementation for fragment shader
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                              0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                             -0.577350269189626,  // -1.0 + 2.0 * C.x
                              0.024390243902439); // 1.0 / 41.0
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m ;
          m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        ${shader.fragmentShader}
      `.replace(
        `#include <color_fragment>`,
        `
        #include <color_fragment>

        // 程序化叶脉：沿叶片走向的高频条纹噪声，叶尖→叶基颜色渐变（零贴图）
        float vein = snoise(vec2(vWorldPos.x * 60.0, vWorldPos.z * 8.0));
        diffuseColor.rgb *= 0.92 + 0.08 * smoothstep(0.0, 0.6, vein);
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, diffuseColor.rgb, clamp(vWorldPos.y * 0.6, 0.0, 1.0));

        // 近似次表面散射(SSS)：叶片透光泛绿，幼叶(低 v_growth)透光率更高，
        // 高位叶片受光更强 → 光线穿过叶片的透光感（不同生育期透光率差异化）
        float translucency = mix(0.34, 0.08, clamp(v_growth, 0.0, 1.0));
        float backlight = 0.5 + 0.5 * clamp(vWorldPos.y * 0.5, 0.0, 1.0);
        diffuseColor.rgb += vec3(0.10, 0.30, 0.06) * translucency * backlight;

        if (v_pestFactor > 0.0) {
          // 病斑：分形噪声模拟从点到面蔓延的病斑边缘
          float n = snoise(vWorldPos.xz * 15.0 + vWorldPos.y * 5.0);
          if (n > 0.4) {
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.15, 0.05), v_pestFactor * 0.8); // dark brown spots
          } else if (n > 0.2) {
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.5, 0.2), v_pestFactor * 0.5); // yellowish rings
          }
        }
        `
      );
    } else {
      shader.fragmentShader = `
        varying float v_pestFactor;
        varying vec3 vWorldPos;
        ${shader.fragmentShader}
      `.replace(
        `#include <color_fragment>`,
        `
        #include <color_fragment>
        `
      );
    }
    
    material.userData.shader = shader;
  };
};

setupMaterialWithWind(WheatStemMaterial, false);
setupMaterialWithWind(WheatLeafMaterial, true);
setupMaterialWithWind(CornStemMaterial, false);
setupMaterialWithWind(CornLeafMaterial, true);

// 全局风场状态（风力/风向），由控制面板写入、作物着色器逐帧读取（零 CPU 额外开销）
const windState = { speed: 1.0, dirDeg: 45 };

export interface FieldPlant { x: number; z: number; zBase: number; scale: number; status: string; yaw: number; }

// 确定性田块植株生成（纯函数）—— SmartFarmingField 渲染与"框选聚合统计"共用同一数据源，
// 保证屏幕框选的统计数字与画面所见完全一致、且可复现。
function generatePlantField(opts: { seed: number; rowSpacingCm: number; plantSpacingCm: number; densityFactor: number; plotLod: number; isOrchard: boolean; lod0Budget?: number; }): { plants: FieldPlant[]; rowSpacing: number; plantSpacing: number; } {
  const { seed, rowSpacingCm, plantSpacingCm, densityFactor, plotLod, isOrchard, lod0Budget = 5400 } = opts;
  const fieldW = 14, fieldL = 22;
  let rows = Math.max(2, Math.round((fieldW / (rowSpacingCm / 100)) * densityFactor));
  let cols = Math.max(2, Math.round((fieldL / (plantSpacingCm / 100)) * densityFactor));
  let budget = lod0Budget;
  if (plotLod === 1) budget = Math.min(900, Math.round(lod0Budget * 0.25));
  if (plotLod === 2) budget = 160;
  if (isOrchard) budget = 36;
  if (rows * cols > budget) {
    const f = Math.sqrt(budget / (rows * cols));
    rows = Math.max(2, Math.round(rows * f));
    cols = Math.max(2, Math.round(cols * f));
  }
  const rowSpacing = fieldW / rows;
  const plantSpacing = fieldL / cols;
  const baseSeed = seed >>> 0;
  const plants: FieldPlant[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rng = mulberry32((baseSeed ^ Math.imul(r + 1, 73856093) ^ Math.imul(c + 1, 19349663)) >>> 0);
      const x = (r - rows / 2) * rowSpacing + (rng() - 0.5) * rowSpacing * 0.2;
      const zBase = (c - cols / 2) * plantSpacing;
      const z = zBase + (rng() - 0.5) * plantSpacing * 0.2;
      const u1 = rng() || 1e-6, u2 = rng();
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const scale = THREE.MathUtils.clamp(1.0 + gauss * 0.12, 0.7, 1.3);
      let status = 'healthy';
      const noise = Math.sin(x * 0.8) + Math.cos(z * 0.8) + rng() * 0.5;
      if (noise > 1.8) status = 'drought';
      else if (noise < -1.5) status = 'nitrogen_deficient';
      else if (noise > 1.0 && rng() > 0.8) status = 'pest';
      plants.push({ x, z, zBase, scale, status, yaw: rng() * Math.PI });
    }
  }
  return { plants, rowSpacing, plantSpacing };
}

function SmartFarmingField({ crop, zHalf = 'all', plotLod = 0, isRaining = false, showAnomalies = false, targetGrowthStage = 1.0, agro }: { crop: string; zHalf?: 'front' | 'back' | 'all'; plotLod?: number; isRaining?: boolean; showAnomalies?: boolean, targetGrowthStage?: number, agro?: AgronomyConfig }) {
  const quality = useQuality();
  const isCorn = crop.includes('玉米');
  const isOrchard = crop.includes('苹果') || crop.includes('果') || crop.includes('林');
  const isSoybean = crop.includes('大豆') || crop.includes('豆');

  // 农艺生长模型：株高/茎粗/叶片数/叶倾角 全部来自真实田间数据 (cropAgronomy.ts)
  const profile = useMemo<CropAgronomyProfile>(() => getCropProfile(crop), [crop]);
  const morph = useMemo(() => interpolateMorphology(profile, targetGrowthStage), [profile, targetGrowthStage]);

  // 行距/株距/密度：优先使用全局调控值，否则回退到该作物的农艺标准值
  const rowSpacingCm = agro?.rowSpacingCm ?? profile.stdRowSpacingCm;
  const plantSpacingCm = agro?.plantSpacingCm ?? profile.stdPlantSpacingCm;
  const densityFactor = agro?.densityFactor ?? 1.0;

  // 叶倾角 → 叶片绕茎倾斜弧度；茎粗 → 实例 XZ 缩放（相对成熟期归一）
  const leafTiltRad = THREE.MathUtils.degToRad(morph.leafAngleDeg);
  const matureStemMm = profile.stages[profile.stages.length - 1].stemDiameterMm;
  const stemThicknessScale = THREE.MathUtils.clamp(morph.stemDiameterMm / matureStemMm, 0.35, 1.2);
  // 每株渲染叶片数：以农艺叶片数为基准，按 LOD 设性能上限（绘制调用不变，仍为单一 InstancedMesh）
  const leavesPerPlant = plotLod >= 2 ? 1 : plotLod === 1 ? 2 : Math.max(2, Math.min(4, Math.round(morph.leafCount / 2)));

  // 穗部：抽穗期(进度≥headingProgress)后出现，按穗长缩放、随成熟由青转黄；单一 InstancedMesh
  const earSpec = profile.ear;
  const showEars = !!earSpec && (isCorn || (!isOrchard && !isSoybean)) && targetGrowthStage >= (earSpec?.headingProgress ?? 0.7);
  const earLengthUnit = (earSpec?.earLengthCm ?? 8) / 100;
  const earRipeT = earSpec ? THREE.MathUtils.clamp((targetGrowthStage - earSpec.headingProgress) / Math.max(0.01, 1 - earSpec.headingProgress), 0, 1) : 0;

  const stemMeshRef = useRef<THREE.InstancedMesh>(null);
  const leafMeshRef = useRef<THREE.InstancedMesh>(null);
  const earMeshRef = useRef<THREE.InstancedMesh>(null);
  
  const currentGrowthRef = useRef(targetGrowthStage);

  useFrame((state, delta) => {
    // Smoothly interpolate growth stage
    currentGrowthRef.current = THREE.MathUtils.lerp(currentGrowthRef.current, targetGrowthStage, delta * 2.0);
    
    // Update global shader uniform
    const materials = [WheatStemMaterial, WheatLeafMaterial, CornStemMaterial, CornLeafMaterial];
    materials.forEach(mat => {
      if (mat.userData.shader) {
        if (mat.userData.shader && mat.userData.shader.uniforms) {
          if (mat.userData.shader.uniforms.globalGrowthStage) {
            mat.userData.shader.uniforms.globalGrowthStage.value = currentGrowthRef.current;
          }
          // 风力：面板风速 × 降雨增幅（降雨/大风时摆动更剧烈）
          if (mat.userData.shader.uniforms.windIntensity) {
            mat.userData.shader.uniforms.windIntensity.value = windState.speed * (isRaining ? 2.2 : 1.0);
          }
          // 风向：面板角度（0°=北/+Z，顺时针）→ 单位向量
          if (mat.userData.shader.uniforms.windDir) {
            const a = THREE.MathUtils.degToRad(windState.dirDeg);
            mat.userData.shader.uniforms.windDir.value.set(Math.sin(a), Math.cos(a));
          }
        }
      }
    });
  });

  // 1000+ plant matrix generation —— 行距/株距/密度按农艺参数驱动（与框选聚合共用同一确定性生成器）
  const { plantData, count } = useMemo(() => {
    const { plants } = generatePlantField({
      seed: agro?.seed ?? 20240628,
      rowSpacingCm, plantSpacingCm, densityFactor, plotLod, isOrchard,
      lod0Budget: quality.lod0Budget,
    });
    // 按前/后剖面半区筛选（front: zBase≥0, back: zBase<0）
    const filtered = zHalf === 'all' ? plants : plants.filter(p => (zHalf === 'front' ? p.zBase >= 0 : p.zBase < 0));
    return { plantData: filtered, count: filtered.length };
  }, [zHalf, isOrchard, plotLod, rowSpacingCm, plantSpacingCm, densityFactor, agro?.seed, quality.lod0Budget]);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    if (WaveMaterial.userData.shader) {
      WaveMaterial.userData.shader.uniforms.time.value = elapsed;
    }
    
    // Update wind and growth shader uniforms
    const materials = [WheatStemMaterial, WheatLeafMaterial, CornStemMaterial, CornLeafMaterial];
    materials.forEach(mat => {
      if (mat.userData.shader) {
        if (mat.userData.shader.uniforms && mat.userData.shader.uniforms.time) {
          mat.userData.shader.uniforms.time.value = elapsed;
        }
      }
    });
  });

    useEffect(() => {
    if (!stemMeshRef.current || !leafMeshRef.current) return;
    
    const dummy = new THREE.Object3D();
    const leafDummy = new THREE.Object3D();
    const earDummy = new THREE.Object3D();
    const colorObj = new THREE.Color();
    const earColor = new THREE.Color();
    const earGreen = new THREE.Color('#7a9a30');
    const earGold = new THREE.Color(isCorn ? '#d9b310' : '#d4a017');

    // Create Float32Arrays for our custom attributes
    const stemGrowthStageArray = new Float32Array(count);
    const leafGrowthStageArray = new Float32Array(count * leavesPerPlant);
    const stemPestFactorArray = new Float32Array(count);
    const leafPestFactorArray = new Float32Array(count * leavesPerPlant);

    plantData.forEach((plant, i) => {
      // Setup stem
      dummy.position.set(plant.x, 0, plant.z);

      // Morphology modifications based on status
      let morphScale = plant.scale;
      let tilt = 0;
      let pestFactor = 0.0;

      if (plant.status === 'drought') {
         morphScale *= 0.8; // stunted growth
         tilt = 0.2; // drooping
      } else if (plant.status === 'nitrogen_deficient') {
         morphScale *= 0.85;
      } else if (plant.status === 'pest') {
         pestFactor = 1.0;
      }

      // 茎粗按生育期农艺数据缩放 XZ；株高由生长着色器按生育期驱动
      const yaw = (plant as any).yaw ?? 0;
      dummy.scale.set(morphScale * stemThicknessScale, morphScale, morphScale * stemThicknessScale);
      dummy.rotation.set(tilt, yaw, 0);
      dummy.updateMatrix();
      stemMeshRef.current!.setMatrixAt(i, dummy.matrix);

      // Assign custom attribute values（基于植株坐标的确定性微差，保证可复现）
      stemGrowthStageArray[i] = 0.8 + (Math.abs(Math.sin(plant.x * 12.9898 + plant.z * 78.233)) % 1) * 0.2;
      stemPestFactorArray[i] = pestFactor;

      // Color base (white default will be tinted by material color, we just tint the instance)
      if (showAnomalies) {
        if (plant.status === 'healthy') {
          colorObj.setHex(0x113311); // very dark, almost invisible
        } else if (plant.status === 'drought') {
          colorObj.setHex(0xffaa00); // bright glowing orange
        } else if (plant.status === 'nitrogen_deficient') {
          colorObj.setHex(0x00ffff); // bright cyan
        } else if (plant.status === 'pest') {
          colorObj.setHex(0xff0044); // bright red
        }
      } else {
        if (plant.status === 'drought') colorObj.setHex(0xaaaa55); // yellowish dry
        else if (plant.status === 'nitrogen_deficient') colorObj.setHex(0xddeebb); // pale green
        // we handle pest spots via shader now, so pest can use standard color
        else colorObj.setHex(0xffffff); // healthy uses material base color
      }
      
      stemMeshRef.current!.setColorAt(i, colorObj);

      if (leafMeshRef.current) {
        // 多叶片沿茎秆分布；叶倾角(leafTiltRad)来自农艺生长模型并随生育期变化
        const h = isCorn ? 2.1 : 1.4;
        for (let k = 0; k < leavesPerPlant; k++) {
          const leafIdx = i * leavesPerPlant + k;
          // 沿茎自下而上均匀分布叶片
          const heightFrac = leavesPerPlant === 1 ? 0.5 : 0.32 + (k / (leavesPerPlant - 1)) * 0.5;
          // 叶片绕茎交错旋向，叶倾角越往上略收拢
          const yawK = yaw + k * (Math.PI * 0.7);
          const tiltK = leafTiltRad * (1 - heightFrac * 0.25) + tilt;
          const sign = k % 2 === 0 ? 1 : -1;
          leafDummy.position.set(plant.x, h * morphScale * heightFrac, plant.z);
          leafDummy.scale.set(morphScale, morphScale, morphScale);
          leafDummy.rotation.set(sign * tiltK * (isCorn ? 0.6 : 0.4), yawK, sign * tiltK);
          leafDummy.updateMatrix();
          leafMeshRef.current.setMatrixAt(leafIdx, leafDummy.matrix);
          leafMeshRef.current.setColorAt(leafIdx, colorObj);
          leafGrowthStageArray[leafIdx] = stemGrowthStageArray[i];
          leafPestFactorArray[leafIdx] = pestFactor;
        }
      }

      // 穗部：定位到茎秆顶端，按穗长缩放，随成熟由青转黄
      if (earMeshRef.current && showEars) {
        const h = isCorn ? 2.1 : 1.4;
        earDummy.position.set(plant.x, h * morphScale * targetGrowthStage, plant.z);
        earDummy.scale.set(morphScale, earLengthUnit * (0.6 + 0.4 * earRipeT), morphScale);
        earDummy.rotation.set(0, yaw, 0);
        earDummy.updateMatrix();
        earMeshRef.current.setMatrixAt(i, earDummy.matrix);
        earColor.copy(earGreen).lerp(earGold, earRipeT);
        // 干旱/缺氮穗部偏黄白，病害穗部偏暗
        if (plant.status === 'drought') earColor.lerp(new THREE.Color('#c9b27a'), 0.5);
        else if (plant.status === 'pest') earColor.multiplyScalar(0.7);
        earMeshRef.current.setColorAt(i, earColor);
      }
    });

    // Attach attributes to geometries
    if (stemMeshRef.current.geometry) {
      stemMeshRef.current.geometry.setAttribute('a_growthStage', new THREE.InstancedBufferAttribute(stemGrowthStageArray, 1));
      stemMeshRef.current.geometry.setAttribute('a_pestFactor', new THREE.InstancedBufferAttribute(stemPestFactorArray, 1));
    }
    
    if (leafMeshRef.current.geometry) {
      leafMeshRef.current.geometry.setAttribute('a_growthStage', new THREE.InstancedBufferAttribute(leafGrowthStageArray, 1));
      leafMeshRef.current.geometry.setAttribute('a_pestFactor', new THREE.InstancedBufferAttribute(leafPestFactorArray, 1));
    }

    stemMeshRef.current.instanceMatrix.needsUpdate = true;
    if (stemMeshRef.current.instanceColor) stemMeshRef.current.instanceColor.needsUpdate = true;
    if (leafMeshRef.current) {
      leafMeshRef.current.instanceMatrix.needsUpdate = true;
      if (leafMeshRef.current.instanceColor) leafMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (earMeshRef.current && showEars) {
      earMeshRef.current.instanceMatrix.needsUpdate = true;
      if (earMeshRef.current.instanceColor) earMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [plantData, isCorn, showAnomalies, leavesPerPlant, stemThicknessScale, leafTiltRad, showEars, earLengthUnit, earRipeT, targetGrowthStage]);

  // Fallback to old objects for Orchards and Soybeans for now, or use Instanced if needed
  if (isOrchard) {
    return (
      <group>
        {plantData.map((item, i) => (
          <OrchardTree key={i} position={[item.x, 0, item.z]} scale={item.scale} plotLod={plotLod} />
        ))}
      </group>
    );
  }

  if (isSoybean) {
    return (
      <group>
        {plantData.map((item, i) => (
          <SoybeanPlant key={i} position={[item.x, 0, item.z]} scale={item.scale} plotLod={plotLod} />
        ))}
      </group>
    );
  }

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      setHoveredIdx(e.instanceId);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    setHoveredIdx(null);
    document.body.style.cursor = 'auto';
  };
  
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      setSelectedIdx(e.instanceId === selectedIdx ? null : e.instanceId);
      const plant = plantData[e.instanceId];
      // Generate some mock soil data based on plant spatial coordinates for variety
      const soilMoisture = Math.min(100, Math.max(10, 60 + Math.sin(plant.x) * 20 + Math.cos(plant.z) * 10));
      const soilN = 80 + Math.sin(plant.z * 2.0) * 15;
      const score = scoreByStatus(plant.status);

      const event = new CustomEvent('farm-plant-click', {
        detail: {
          plant: {
            ...plant,
            crop: profile.cropName,
            variety: profile.variety,
            stage: morph.stageLabel,
            heightCm: (morph.heightCm * plant.scale).toFixed(1),
            stemDiameterMm: morph.stemDiameterMm.toFixed(1),
            leafCount: morph.leafCount,
            leafAngleDeg: morph.leafAngleDeg.toFixed(0),
            rootDepthCm: morph.rootDepthCm.toFixed(0),
            growthStage: targetGrowthStage,
            soilMoisture: soilMoisture.toFixed(1),
            soilN: soilN.toFixed(1),
            score: score.toFixed(1)
          }
        }
      });
      window.dispatchEvent(event);
    }
  };

  return (
    <group>
      <instancedMesh
        key={`stem-${count}`}
        ref={stemMeshRef}
        args={[isCorn ? cornStemGeo : wheatStemGeo, isCorn ? CornStemMaterial : WheatStemMaterial, count]}
        castShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
      <instancedMesh
        key={`leaf-${leavesPerPlant}-${count}`}
        ref={leafMeshRef}
        args={[isCorn ? cornLeafGeo : wheatLeafGeo, isCorn ? CornLeafMaterial : WheatLeafMaterial, count * leavesPerPlant]}
        castShadow={quality.leafShadow}
      />

      {/* 穗部 InstancedMesh（抽穗期出现，单批绘制） */}
      {showEars && (
        <instancedMesh
          key={`ear-${count}`}
          ref={earMeshRef}
          args={[isCorn ? cornEarGeo : wheatEarGeo, isCorn ? CornEarMaterial : WheatEarMaterial, count]}
          castShadow
        />
      )}

      {/* Optional Highlight for hovered item */}
      {hoveredIdx !== null && stemMeshRef.current && (
        <mesh position={[plantData[hoveredIdx].x, 0.05, plantData[hoveredIdx].z]} rotation={[-Math.PI/2, 0, 0]}>
          <ringGeometry args={[0.2, 0.25, 16]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Selected Plant Data HUD (国赛要求：单株级查询) */}
      {selectedIdx !== null && (
        <Html position={[plantData[selectedIdx].x, 2.5, plantData[selectedIdx].z]} center distanceFactor={15}>
          <div className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-900/50 rounded p-3 w-48 text-left pointer-events-none shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <h4 className="text-cyan-400 text-xs font-bold mb-2 border-b border-cyan-900 pb-1 flex justify-between">
              <span>植株 ID: {(selectedIdx + 1024).toString(16).toUpperCase()}</span>
              {plantData[selectedIdx].status === 'healthy' && <span className="text-emerald-400">健康</span>}
              {plantData[selectedIdx].status === 'drought' && <span className="text-amber-400">缺水干旱</span>}
              {plantData[selectedIdx].status === 'nitrogen_deficient' && <span className="text-lime-400">氮素缺乏</span>}
              {plantData[selectedIdx].status === 'pest' && <span className="text-rose-400">病虫害预警</span>}
            </h4>
            <div className="text-[10px] space-y-1 text-slate-300">
              <div className="flex justify-between"><span>品种:</span> <span className="text-white">{profile.variety}</span></div>
              <div className="flex justify-between"><span>生育期:</span> <span className="text-white">{morph.stageLabel}</span></div>
              <div className="flex justify-between"><span>实测株高:</span> <span className="text-white">{(morph.heightCm * plantData[selectedIdx].scale).toFixed(1)} cm</span></div>
              <div className="flex justify-between"><span>茎粗:</span> <span className="text-white">{morph.stemDiameterMm.toFixed(1)} mm</span></div>
              <div className="flex justify-between"><span>叶片数:</span> <span className="text-white">{morph.leafCount} 片</span></div>
              <div className="flex justify-between"><span>叶倾角:</span> <span className="text-white">{morph.leafAngleDeg.toFixed(0)}°</span></div>
              <div className="flex justify-between"><span>根系深度:</span> <span className="text-white">{morph.rootDepthCm.toFixed(0)} cm</span></div>
              {showEars && earSpec && (
                <>
                  <div className="flex justify-between"><span>穗长:</span> <span className="text-amber-300">{earSpec.earLengthCm} cm</span></div>
                  <div className="flex justify-between"><span>穗粒数:</span> <span className="text-amber-300">{Math.round(earSpec.grainsPerEar * (0.7 + earRipeT * 0.3) * plantData[selectedIdx].scale)} 粒</span></div>
                  <div className="flex justify-between"><span>单株穗数:</span> <span className="text-amber-300">{earSpec.earsPerPlant} 穗</span></div>
                </>
              )}
              <div className="flex justify-between mt-2 pt-1 border-t border-slate-700/50">
                <span>长势综合评分:</span>
                <span className={`font-bold ${plantData[selectedIdx].status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {scoreByStatus(plantData[selectedIdx].status).toFixed(1)}
                </span>
              </div>
            </div>
            {/* Connecting line */}
            <div className="absolute top-full left-1/2 w-px h-16 bg-gradient-to-b from-cyan-500 to-transparent -translate-x-1/2" />
          </div>
        </Html>
      )}
    </group>
  );
}

// ==========================================
// 3. SCIENTIFIC GEOLOGICAL PROFILE & ROOT ARCHITECTURE
// ==========================================

function RealisticTerrainMesh({ plotId, isSelected, topsoilRoughness, topsoilMetalness, moistureColorLerp, zOffset = 6 }: { plotId: string; isSelected: boolean; topsoilRoughness: number; topsoilMetalness: number; moistureColorLerp: string, zOffset?: number }) {
  const [elevationData, setElevationData] = useState<number[][] | null>(null);
  const geomRef = useRef<THREE.PlaneGeometry>(null);

  useEffect(() => {
    import('../../services/dataService').then(module => {
      module.default.getElevationData(plotId).then(data => {
        setElevationData(data);
      });
    });
  }, [plotId]);

  useEffect(() => {
    if (elevationData && geomRef.current) {
      const positions = geomRef.current.attributes.position;
      const size = elevationData.length;
      
      // We expect 32x32 vertices for our plane
      let i = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (i < positions.count) {
            const h = elevationData[y]?.[x] || 0;
            positions.setZ(i, h);
            i++;
          }
        }
      }
      geomRef.current.computeVertexNormals();
      positions.needsUpdate = true;
    }
  }, [elevationData]);

  if (!elevationData) return null;

  return (
    <mesh position={[0, 0.01, zOffset]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <planeGeometry ref={geomRef} args={[16.05, 12.05, 31, 31]} />
      <meshStandardMaterial 
        color={isSelected ? "#73482d" : "#5c3a24"} 
        roughness={topsoilRoughness} 
        metalness={topsoilMetalness}
      />
    </mesh>
  );
}

function GreenhouseGlassRoof({ plotLod = 0 }: { plotLod?: number }) {
  if (plotLod === 2) return null; // Completely hide far-away glass roof meshes to save performance
  return (
    <group position={[0, 1.2, 0]}>
      {/* Curved glass dome over the plot */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[9, 9, 24, plotLod === 1 ? 8 : 20, 1, false, 0, Math.PI]} />
        <meshPhysicalMaterial 
          color="#a5f3fc" 
          transparent={true} 
          opacity={0.15} 
          roughness={0.1} 
          transmission={0.9} 
          thickness={0.5} 
          side={THREE.DoubleSide} 
        />
      </mesh>
      {/* Structural framing */}
      {plotLod === 0 && (
        <lineSegments rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <edgesGeometry args={[new THREE.CylinderGeometry(9, 9, 24, 20, 1, false, 0, Math.PI)]} />
          <lineBasicMaterial color="#38bdf8" linewidth={2} opacity={0.6} transparent />
        </lineSegments>
      )}
    </group>
  );
}

// Realistic geological root paths
function OrganicRootCurve({ start, end, segments = 5 }: { start: [number, number, number], end: [number, number, number], segments?: number }) {
  const points = useMemo(() => {
    const list = [];
    const [sx, sy, sz] = start;
    const [ex, ey, ez] = end;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sx + (ex - sx) * t + (Math.sin(t * Math.PI) * (Math.random() - 0.5) * 0.6);
      const y = sy + (ey - sy) * t;
      const z = sz + (ez - sz) * t + (Math.cos(t * Math.PI) * (Math.random() - 0.5) * 0.6);
      list.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(list).getPoints(30);
  }, [start, end, segments]);

  return (
    <line>
      <bufferGeometry attach="geometry" onUpdate={self => self.setFromPoints(points)} />
      <lineBasicMaterial attach="material" color="#854d0e" linewidth={2.5} opacity={0.65} transparent />
    </line>
  );
}

// L-system 分形根系：禾本科须根，主根+多级侧根递归生成（向地性 + 噪声扰动）
// 根深由农艺模型 rootDepthCm 驱动；确定性种子 → 可复现。整套合并为单一 LineSegments(1 draw call)
function generateLSystemRoots(seed: number, depthM: number, density: number) {
  const rand = mulberry32(seed >>> 0);
  const pos: number[] = [];
  const col: number[] = [];
  const top = new THREE.Color('#a16207');   // 近地表浅褐
  const tip = new THREE.Color('#3f2a12');   // 深层暗褐
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  const pushSeg = (a: THREE.Vector3, b: THREE.Vector3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    tmpA.copy(top).lerp(tip, THREE.MathUtils.clamp(-a.y / depthM, 0, 1));
    tmpB.copy(top).lerp(tip, THREE.MathUtils.clamp(-b.y / depthM, 0, 1));
    col.push(tmpA.r, tmpA.g, tmpA.b, tmpB.r, tmpB.g, tmpB.b);
  };

  const grow = (p0: THREE.Vector3, dir0: THREE.Vector3, length: number, gen: number) => {
    if (gen > 4 || length < 0.05) return;
    const steps = Math.max(2, Math.floor(length / 0.14));
    const segLen = length / steps;
    let p = p0.clone();
    let dir = dir0.clone().normalize();
    for (let i = 0; i < steps; i++) {
      // L-system 产生式：方向 = 上级方向 + 随机扰动 + 向地性(重力拉向 -Y)
      dir.x += (rand() - 0.5) * 0.5;
      dir.y -= 0.18;
      dir.z += (rand() - 0.5) * 0.5;
      dir.normalize();
      const next = p.clone().add(dir.clone().multiplyScalar(segLen));
      pushSeg(p, next);
      // 侧根分支：密度越高分支越多，逐级缩短
      if (gen < 3 && rand() < density * 0.45) {
        const lat = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rand() * 2 - 1) * 1.3);
        lat.y -= 0.1;
        grow(next.clone(), lat, length * 0.5 * (0.6 + rand() * 0.4), gen + 1);
      }
      p = next;
    }
  };

  // 须根系：基部辐射多条不定根
  const primaries = 6 + Math.floor(density * 5);
  for (let i = 0; i < primaries; i++) {
    const a = (i / primaries) * Math.PI * 2 + rand() * 0.5;
    const start = new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    const dir = new THREE.Vector3(Math.cos(a) * 0.35, -1, Math.sin(a) * 0.35);
    grow(start, dir, depthM * (0.7 + rand() * 0.3), 0);
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col) };
}

function LSystemRootSystem({ seed, rootDepthCm, density = 1.0, position = [0, 0, 0] }: { seed: number; rootDepthCm: number; density?: number; position?: [number, number, number] }) {
  const geom = useMemo(() => {
    const depthM = THREE.MathUtils.clamp(rootDepthCm / 100, 0.3, 2.4); // 限制在土壤剖面内
    const { positions, colors } = generateLSystemRoots(seed, depthM, density);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [seed, rootDepthCm, density]);

  useEffect(() => () => geom.dispose(), [geom]);

  return (
    <lineSegments geometry={geom} position={position}>
      <lineBasicMaterial vertexColors transparent opacity={0.82} />
    </lineSegments>
  );
}

// 丰满的多层地质剖面（带精细真实的土壤物理反射调优、一键灌溉时表面质感水合饱和打湿变暗）
function VolumetricSoilStrata({ isSelected, plot, irrigationActive, realtimeData, showCrop, plotLod = 0, isRaining = false, showAnomalies = false, targetGrowthStage = 1.0, agro }: { isSelected: boolean; plot: any; irrigationActive: boolean; realtimeData?: any, showCrop?: boolean, plotLod?: number, isRaining?: boolean, showAnomalies?: boolean, targetGrowthStage?: number, agro?: AgronomyConfig }) {
  const frontSliceRef = useRef<THREE.Group>(null);
  const backSliceRef = useRef<THREE.Group>(null);

  const nVal = (isSelected && realtimeData?.soil_n != null) ? realtimeData.soil_n : (plot?.realtime?.nitrogen || 88.0);
  const pVal = (isSelected && realtimeData?.soil_p != null) ? realtimeData.soil_p : (plot?.realtime?.phosphorus || 74.5);
  const kVal = (isSelected && realtimeData?.soil_k != null) ? realtimeData.soil_k : (plot?.realtime?.potassium || 104.2);
  const moistureVal = (isSelected && realtimeData?.soil_hum != null) ? realtimeData.soil_hum : (plot?.realtime?.soil_hum || 62.4);

  // NPK养分柱高度
  const normalizedN = Math.min(3.8, (nVal / 220) * 3);
  const normalizedP = Math.min(3.8, (pVal / 220) * 3);
  const normalizedK = Math.min(3.8, (kVal / 220) * 3);

  // 科学计算法打湿程度，若开启物联网喷灌系统，表层粘土水分立刻接近饱和：
  const effectiveMoisture = (irrigationActive || isRaining) ? Math.max(moistureVal + (isRaining ? 40 : 25), 88) : moistureVal;

  // 科学计算：高饱和水合度下的有机腐殖泥土颜色（变深、变富油黑）
  const moistureColorLerp = useMemo(() => {
    const ratio = Math.min(1.0, Math.max(0.0, (effectiveMoisture - 20) / 70));
    const dryColor = new THREE.Color("#78350f"); // 干燥黄褐沙壤土
    const wetColor = new THREE.Color("#1a0b05"); // 湿润黑壤土
    return dryColor.clone().lerp(wetColor, ratio).getStyle();
  }, [effectiveMoisture]);

  // 物联网高压灌溉启动时，土表和垄沟土壤的物理粗糙度变小，反射率稍微变高以呈现水膜反射写实感
  const topsoilRoughness = (irrigationActive || isRaining) ? 0.38 : 0.94;
  const topsoilMetalness = (irrigationActive || isRaining) ? 0.22 : 0.02;

  // 程序化垄沟规格：优先取全局调控值，否则回退该作物农艺标准（一键切换种植规格的依据）
  const ridgeStd = getCropProfile(plot?.crop).ridge;
  // 根系农艺形态（根深随生育期变化，驱动 L-system 根系深度）
  const rootMorph = interpolateMorphology(getCropProfile(plot?.crop), targetGrowthStage);
  const ridgeSpacing = (agro?.ridgeSpacingCm ?? ridgeStd.spacingCm) / 100; // m
  const ridgeHeight = (agro?.ridgeHeightCm ?? ridgeStd.heightCm) / 100;    // m
  const ridgeWidth = (agro?.ridgeWidthCm ?? ridgeStd.widthCm) / 100;       // m
  const ridgeRadius = Math.max(0.05, ridgeWidth / 2);
  const ridgeHeightScaleZ = ridgeHeight / ridgeRadius; // 旋转后 local-Z → world-Y，独立控制垄高
  const ridgeCount = THREE.MathUtils.clamp(Math.round(14 / ridgeSpacing), 3, 28);

  useEffect(() => {
    if (frontSliceRef.current && backSliceRef.current) {
      if (isSelected) {
        // 剖面一键劈开动态展示
        gsap.to(frontSliceRef.current.position, { z: 5.5, y: -2.8, duration: 1.6, ease: "power4.out" });
        gsap.to(backSliceRef.current.position, { z: -5.5, y: -2.8, duration: 1.6, ease: "power4.out" });
      } else {
        // 复位严丝合缝贴合
        gsap.to(frontSliceRef.current.position, { z: 0, y: 0, duration: 1.3, ease: "power3.inOut" });
        gsap.to(backSliceRef.current.position, { z: 0, y: 0, duration: 1.3, ease: "power3.inOut" });
      }
    }
  }, [isSelected]);

  // LOD 2: 极简的单网格土壤模型，极大减小老旧电脑上的几何体计算与绘制开销
  if (plotLod === 2) {
    return (
      <group position={[0, -0.01, 0]}>
        <mesh position={[0, -1.2, 0]} receiveShadow>
          <boxGeometry args={[16.1, 2.4, 24]} />
          <meshStandardMaterial color="#553c25" roughness={1.0} />
        </mesh>
        {showCrop !== false && <SmartFarmingField crop={plot.crop} zHalf="all" plotLod={2} isRaining={isRaining} showAnomalies={showAnomalies} targetGrowthStage={targetGrowthStage} agro={agro} />}
      </group>
    );
  }

  return (
    <group position={[0, -0.01, 0]}>
      {/* 剖面劈裂其前部半区：包含表土、犁底层、基岩以及作物叶冠前部 */}
      <group ref={frontSliceRef}>
        {/* 第一层: 表层耕作层 (0 - 30cm) */}
        <mesh position={[0, -0.3, 6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 0.6, 12]} />
           <meshStandardMaterial color={new THREE.Color(moistureColorLerp).offsetHSL(0.01, 0.02, 0.02)} roughness={topsoilRoughness} metalness={topsoilMetalness} />
        </mesh>
        {/* 第二层: 粘土底土层 (30 - 80cm) */}
        <mesh position={[0, -1.2, 6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 1.2, 12]} />
           <meshStandardMaterial color="#8c471b" roughness={0.95} />
        </mesh>
        {/* 第三层: 基岩层 (80 - 150cm) */}
        <mesh position={[0, -2.45, 6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 1.3, 12]} />
           <meshStandardMaterial color="#475569" roughness={1.0} />
        </mesh>

        {/* 动态计算的高程网格写实地表 (前部) */}
        <RealisticTerrainMesh 
          plotId={plot?.id || 'plot_001'}
          isSelected={isSelected}
          topsoilRoughness={topsoilRoughness}
          topsoilMetalness={topsoilMetalness}
          moistureColorLerp={moistureColorLerp}
        />

        {/* 程序化垄沟隆起脊 (前部) —— 垄距/垄高/垄宽 参数化，与作物种植规格一致 */}
        {Array.from({ length: ridgeCount }).map((_, rIdx) => {
          const xPos = (rIdx - (ridgeCount - 1) / 2) * ridgeSpacing;
          return (
            <group key={rIdx} position={[xPos, 0.05, 6]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, ridgeHeightScaleZ]} receiveShadow castShadow>
                <cylinderGeometry args={[ridgeRadius, ridgeRadius * 1.25, 11.8, plotLod === 1 ? 4 : 8, 1, false]} />
                <meshStandardMaterial
                  color={isSelected ? "#855334" : "#6b442b"}
                  roughness={topsoilRoughness}
                  metalness={topsoilMetalness}
                />
              </mesh>
              {plotLod < 2 && Array.from({ length: plotLod === 1 ? 1 : 3 }).map((_, bIdx) => (
                <mesh
                  key={bIdx}
                  position={[
                    Math.sin((rIdx + bIdx) * 2.3) * ridgeRadius * 0.5,
                    ridgeHeight * 0.6,
                    -4.5 + bIdx * 4.5 + (Math.cos(bIdx * 1.5) * 0.4)
                  ]}
                  rotation={[Math.sin(rIdx * 1.7 + bIdx) * 3.1, Math.cos(rIdx * 2.1 + bIdx) * 3.1, 0]}
                  castShadow
                >
                  <dodecahedronGeometry args={[0.1 + Math.abs(Math.sin(rIdx + bIdx * 1.3)) * 0.1, 0]} />
                  <meshStandardMaterial
                    color={isSelected ? "#54331e" : "#452918"}
                    roughness={topsoilRoughness}
                    metalness={topsoilMetalness}
                  />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* 密集写实的碎大坷拉、矿物卵石 (前部) */}
        {plotLod === 0 && Array.from({ length: 15 }).map((_, sIdx) => {
          const randX = Math.sin(sIdx * 3.5) * 7.5;
          const randZ = 1.0 + Math.abs(Math.cos(sIdx * 4.8)) * 10.5;
          const size = 0.07 + Math.abs(Math.sin(sIdx * 1.2)) * 0.16;
          return (
            <mesh 
              key={`pebble-f-${sIdx}`} 
              position={[randX, 0.05, randZ]} 
              rotation={[Math.sin(sIdx) * 1.8, Math.cos(sIdx) * 2.5, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size, size, size]} />
              <meshStandardMaterial 
                color={sIdx % 3 === 0 ? "#8b5a2b" : sIdx % 3 === 1 ? "#5c3d24" : "#3d210f"} 
                roughness={0.92} 
              />
            </mesh>
          );
        })}

        {/* 自然散落的饱满杂草草丛 (前部) */}
        {plotLod === 0 && Array.from({ length: 12 }).map((_, gIdx) => {
          const rx = Math.cos(gIdx * 2.3) * 6.5;
          const rz = 1.0 + Math.abs(Math.sin(gIdx * 3.7)) * 10.5;
          const gHeight = 0.15 + Math.abs(Math.sin(gIdx)) * 0.3;
          return (
            <group key={`grass-f-${gIdx}`} position={[rx, 0.05, rz]}>
              <mesh rotation={[0, 0, 0.2]} castShadow>
                <boxGeometry args={[0.04, gHeight, 0.08]} />
                <meshStandardMaterial color="#16a34a" roughness={0.65} />
              </mesh>
              <mesh rotation={[0, Math.PI / 3, -0.15]} castShadow>
                <boxGeometry args={[0.04, gHeight * 0.9, 0.08]} />
                <meshStandardMaterial color="#15803d" roughness={0.65} />
              </mesh>
              <mesh rotation={[0, -Math.PI / 3, 0.1]} castShadow>
                <boxGeometry args={[0.04, gHeight * 1.1, 0.08]} />
                <meshStandardMaterial color="#22c55e" roughness={0.65} />
              </mesh>
            </group>
          );
        })}

        {/* 作物前部半区渲染 */}
        {showCrop !== false && <SmartFarmingField crop={plot.crop} zHalf="front" plotLod={plotLod} isRaining={isRaining} showAnomalies={showAnomalies} targetGrowthStage={targetGrowthStage} agro={agro} />}

        {/* L-system 分形根系：根深由农艺模型驱动，多株按行距排布 (选中时展示) */}
        {isSelected && plotLod === 0 && (
          <group position={[0, 0, 6]}>
            {[-4.5, -1.5, 1.5, 4.5].map((rx, k) => (
              <LSystemRootSystem
                key={rx}
                seed={(agro?.seed ?? 20240628) + k * 911}
                rootDepthCm={rootMorph.rootDepthCm}
                density={agro?.densityFactor ?? 1.0}
                position={[rx, 0, 0]}
              />
            ))}
          </group>
        )}
      </group>

      {/* 剖面劈裂其后部半区：包含表土、犁底层、基岩以及作物叶冠后部 */}
      <group ref={backSliceRef}>
        {/* 第一层: 表层耕作层 (0 - 30cm) */}
        <mesh position={[0, -0.3, -6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 0.6, 12]} />
           <meshStandardMaterial color={moistureColorLerp} roughness={topsoilRoughness} metalness={topsoilMetalness} />
        </mesh>
        {/* 第二层: 粘土底土层 (30 - 80cm) */}
        <mesh position={[0, -1.2, -6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 1.2, 12]} />
           <meshStandardMaterial color="#8c471b" roughness={0.95} />
        </mesh>
        {/* 第三层: 基岩层 (80 - 150cm) */}
        <mesh position={[0, -2.45, -6]} castShadow receiveShadow>
           <boxGeometry args={[16.1, 1.3, 12]} />
           <meshStandardMaterial color="#475569" roughness={1.0} />
        </mesh>

        {/* 动态计算的高程网格写实地表 (后部) */}
        <RealisticTerrainMesh 
          plotId={plot?.id || 'plot_001'}
          isSelected={isSelected}
          topsoilRoughness={topsoilRoughness}
          topsoilMetalness={topsoilMetalness}
          moistureColorLerp={moistureColorLerp}
          zOffset={-6}
        />

        {/* 程序化垄沟隆起脊 (后部) —— 与前部同规格，整田垄沟连续一致 */}
        {Array.from({ length: ridgeCount }).map((_, rIdx) => {
          const xPos = (rIdx - (ridgeCount - 1) / 2) * ridgeSpacing;
          return (
            <group key={rIdx} position={[xPos, 0.05, -6]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, ridgeHeightScaleZ]} receiveShadow castShadow>
                <cylinderGeometry args={[ridgeRadius, ridgeRadius * 1.25, 11.8, plotLod === 1 ? 4 : 8, 1, false]} />
                <meshStandardMaterial
                  color={isSelected ? "#855334" : "#6b442b"}
                  roughness={topsoilRoughness}
                  metalness={topsoilMetalness}
                />
              </mesh>
              {plotLod < 2 && Array.from({ length: plotLod === 1 ? 1 : 3 }).map((_, bIdx) => (
                <mesh
                  key={bIdx}
                  position={[
                    Math.sin((rIdx + bIdx) * 2.3) * ridgeRadius * 0.5,
                    ridgeHeight * 0.6,
                    -4.4 + bIdx * 4.5 + (Math.cos(bIdx * 1.5) * 0.4)
                  ]}
                  rotation={[Math.sin(rIdx * 1.7 + bIdx) * 3.1, Math.cos(rIdx * 2.1 + bIdx) * 3.1, 0]}
                  castShadow
                >
                  <dodecahedronGeometry args={[0.1 + Math.abs(Math.sin(rIdx + bIdx * 1.3)) * 0.1, 0]} />
                  <meshStandardMaterial
                    color={isSelected ? "#54331e" : "#452918"}
                    roughness={topsoilRoughness}
                    metalness={topsoilMetalness}
                  />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* 密集真实的碎大坷拉、矿物卵石 (后部) */}
        {plotLod === 0 && Array.from({ length: 15 }).map((_, sIdx) => {
          const randX = Math.sin(sIdx * 3.5) * 7.5;
          const randZ = -1.0 - Math.abs(Math.cos(sIdx * 4.8)) * 10.5;
          const size = 0.07 + Math.abs(Math.sin(sIdx * 1.2)) * 0.16;
          return (
            <mesh 
              key={`pebble-b-${sIdx}`} 
              position={[randX, 0.05, randZ]} 
              rotation={[Math.sin(sIdx) * 1.8, Math.cos(sIdx) * 2.5, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size, size, size]} />
              <meshStandardMaterial 
                color={sIdx % 3 === 0 ? "#8b5a2b" : sIdx % 3 === 1 ? "#5c3d24" : "#3d210f"} 
                roughness={0.92} 
              />
            </mesh>
          );
        })}

        {/* 自然散落的饱满杂草草丛 (后部) */}
        {plotLod === 0 && Array.from({ length: 12 }).map((_, gIdx) => {
          const rx = Math.cos(gIdx * 2.3) * 6.5;
          const rz = -1.0 - Math.abs(Math.sin(gIdx * 3.7)) * 10.5;
          const gHeight = 0.15 + Math.abs(Math.sin(gIdx)) * 0.3;
          return (
            <group key={`grass-b-${gIdx}`} position={[rx, 0.05, rz]}>
              <mesh rotation={[0, 0, 0.2]} castShadow>
                <boxGeometry args={[0.04, gHeight, 0.08]} />
                <meshStandardMaterial color="#16a34a" roughness={0.65} />
              </mesh>
              <mesh rotation={[0, Math.PI / 3, -0.15]} castShadow>
                <boxGeometry args={[0.04, gHeight * 0.9, 0.08]} />
                <meshStandardMaterial color="#15803d" roughness={0.65} />
              </mesh>
              <mesh rotation={[0, -Math.PI / 3, 0.1]} castShadow>
                <boxGeometry args={[0.04, gHeight * 1.1, 0.08]} />
                <meshStandardMaterial color="#22c55e" roughness={0.65} />
              </mesh>
            </group>
          );
        })}

        {/* 作物后部半区渲染 */}
        {showCrop !== false && <SmartFarmingField crop={plot.crop} zHalf="back" plotLod={plotLod} isRaining={isRaining} showAnomalies={showAnomalies} targetGrowthStage={targetGrowthStage} agro={agro} />}
      </group>

      {/* 劈裂中心空出的科幻全息实验室级营养柱与离子能荧光颗粒 */}
      {isSelected && (
        <group position={[0, -1.5, 0]}>
          {/* 电信级数据对齐底座板 */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[14, 0.04, 7.5]} />
            <meshStandardMaterial color="#06b6d4" opacity={0.25} transparent emissive="#06b6d4" emissiveIntensity={0.8} />
          </mesh>

          {/* 随风浮动的绿色氮磷钾离子荧光微粒 Sparkles */}
          <Sparkles 
            count={45} 
            scale={[13, 2.5, 7]} 
            size={1.6} 
            speed={0.9} 
            opacity={0.7} 
            color="#34d399" 
            position={[0, -0.6, 0]} 
          />

          {/* 红色 - 活性氮 (N) 元素柱 */}
          <group position={[-3.6, 0.1, 0]}>
            <mesh position={[0, normalizedN / 2, 0]} castShadow>
              <cylinderGeometry args={[0.26, 0.26, normalizedN, 10]} />
              <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.8} transparent opacity={0.85} roughness={0.1} />
            </mesh>
            <Html position={[0, normalizedN + 0.55, 0]} center>
              <div className="px-2 py-0.5 bg-slate-950/95 border border-red-500/40 text-[9px] font-mono font-bold text-red-100 rounded shadow-[0_0_12px_rgba(239,68,68,0.5)] whitespace-nowrap">
                氮元素 (N): {nVal.toFixed(0)} ppm
              </div>
            </Html>
          </group>

          {/* 蓝色 - 磷 (P) 粘粒高营养离子柱 */}
          <group position={[0, 0.1, 0]}>
            <mesh position={[0, normalizedP / 2, 0]} castShadow>
              <cylinderGeometry args={[0.26, 0.26, normalizedP, 10]} />
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.8} transparent opacity={0.85} roughness={0.1} />
            </mesh>
            <Html position={[0, normalizedP + 0.55, 0]} center>
              <div className="px-2 py-0.5 bg-slate-950/95 border border-blue-500/40 text-[9px] font-mono font-bold text-blue-100 rounded shadow-[0_0_12px_rgba(59,130,246,0.5)] whitespace-nowrap">
                磷元素 (P): {pVal.toFixed(0)} ppm
              </div>
            </Html>
          </group>

          {/* 绿色 - 可吸收钾 (K) 养分强化离子柱 */}
          <group position={[3.6, 0.1, 0]}>
            <mesh position={[0, normalizedK / 2, 0]} castShadow>
              <cylinderGeometry args={[0.26, 0.26, normalizedK, 10]} />
              <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2.8} transparent opacity={0.85} roughness={0.1} />
            </mesh>
            <Html position={[0, normalizedK + 0.55, 0]} center>
              <div className="px-2 py-0.5 bg-slate-950/95 border border-emerald-500/40 text-[9px] font-mono font-bold text-emerald-100 rounded shadow-[0_0_12px_rgba(16,185,129,0.5)] whitespace-nowrap">
                钾元素 (K): {kVal.toFixed(0)} ppm
              </div>
            </Html>
          </group>

          {/* 分层土物理指示科学汉化 */}
          <Html position={[-7.5, 1.25, 2.5]} center>
            <div className="text-[8px] font-sans font-semibold text-cyan-400 bg-slate-950/80 px-2 py-0.5 border border-cyan-500/30 rounded whitespace-nowrap">
              0-30cm 耕作层 (表层腐殖土)
            </div>
          </Html>
          <Html position={[-7.5, 0.2, 2.5]} center>
            <div className="text-[8px] font-sans font-semibold text-cyan-400 bg-slate-950/80 px-2 py-0.5 border border-cyan-500/30 rounded whitespace-nowrap">
              30-80cm 犁底层 (粘粒淋溶矿土)
            </div>
          </Html>
          <Html position={[-7.5, -0.9, 2.5]} center>
            <div className="text-[8px] font-sans font-semibold text-cyan-400 bg-slate-950/80 px-2 py-0.5 border border-cyan-500/30 rounded whitespace-nowrap">
              &gt;80cm 母质岩石层 (母岩风化带)
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

// ==========================================
// 4. PRECISION TELEMETRY & HARDWARE UNITS
// ==========================================

// Refined high-realism telemetry float module
function TelemetrySensorNode({ position, type, label, value, unit, status = 'online' }: { position: [number, number, number], type: 'soil' | 'weather' | 'camera', label: string, value: number, unit: string, status?: 'online' | 'offline' | 'error' }) {
  const nodeRef = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (nodeRef.current) {
      // Smooth sinusoidal telemetry float
      nodeRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 1.5 + position[0]) * 0.18;
    }
  });

  const statusColor = status === 'online' ? '#10b981' : status === 'error' ? '#ef4444' : '#64748b';
  
  return (
    <group position={[position[0], 0, position[2]]}>
       {/* Brushed metal ground mounting sleeve */}
       <mesh position={[0, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.8, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
       </mesh>
       
       {/* Precision transceiver antenna pole */}
       <mesh position={[0, 1.8, 0]} castShadow>
         <cylinderGeometry args={[0.04, 0.04, 2.8, 8]} />
         <meshStandardMaterial color="#1e293b" metalness={1.0} />
       </mesh>

       {/* Status Light Strip Base */}
       <mesh position={[0, 2.6, 0]}>
         <cylinderGeometry args={[0.06, 0.06, 0.15, 12]} />
         <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={status === 'offline' ? 0 : 2} />
       </mesh>
       
       <group ref={nodeRef}>
         {/* Floating aerodynamic indicator head based on type */}
         <mesh position={[0, 3.4, 0]} castShadow>
           {type === 'soil' && <boxGeometry args={[0.4, 0.4, 0.4]} />}
           {type === 'weather' && <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />}
           {type === 'camera' && <sphereGeometry args={[0.3, 16, 16]} />}
           <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.3} />
         </mesh>
         
         {/* Miniature high-contrast display module */}
         <Html position={[0, 4.0, 0]} center>
           <div className="px-2 py-1 rounded bg-slate-950/95 border text-[8px] font-mono whitespace-nowrap shadow-[0_0_10px_rgba(0,0,0,0.8)] flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform pointer-events-auto" style={{ borderColor: `${statusColor}40` }}>
             <div className="flex items-center gap-1.5 w-full justify-between">
               <span className="text-slate-400 font-bold uppercase">{label}</span>
               <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor, boxShadow: status === 'offline' ? 'none' : `0 0 5px ${statusColor}` }} />
             </div>
             {status !== 'offline' ? (
               <span className="font-extrabold font-mono text-[10px]" style={{ color: statusColor }}>{value.toFixed(1)}{unit}</span>
             ) : (
               <span className="font-extrabold font-mono text-[10px] text-slate-500">OFFLINE</span>
             )}
           </div>
         </Html>
       </group>
    </group>
  );
}

// Spinning rotor head matching physical water particles
function DynamicRotarySprinkler({ active }: { active: boolean }) {
  const spinningHead = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (active && spinningHead.current) {
      spinningHead.current.rotation.y = clock.getElapsedTime() * 2.1;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Dynamic structural steel central stand */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 2.5, 6]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} />
      </mesh>
      
      {/* Rotating water jet nozzle block */}
      <group ref={spinningHead} position={[0, 2.45, 0]}>
         <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 2.1, 6]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
         </mesh>
         
         {/* Left spray head */}
         <mesh position={[1.05, 0.05, 0]} castShadow>
            <boxGeometry args={[0.13, 0.13, 0.18]} />
            <meshStandardMaterial color="#0f172a" />
         </mesh>
         
         {/* Right spray head */}
         <mesh position={[-1.05, 0.05, 0]} castShadow>
            <boxGeometry args={[0.13, 0.13, 0.18]} />
            <meshStandardMaterial color="#0f172a" />
         </mesh>
      </group>
    </group>
  );
}

// High density dynamic spray ripples
function WaterIrrigationRipple() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const progress = (clock.getElapsedTime() * 0.72) % 1.0;
      meshRef.current.scale.setScalar(progress * 15 + 1.2);
      if (meshRef.current.material) {
        (meshRef.current.material as any).opacity = (1.0 - progress) * 0.85;
      }
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      <ringGeometry args={[0.12, 0.28, 16]} />
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Weather System: Rain Particles
function RainParticles({ active }: { active: boolean }) {
  const count = 5000;
  const mesh = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const temp = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      temp[i * 3] = (Math.random() - 0.5) * 40;     // x
      temp[i * 3 + 1] = Math.random() * 20;         // y
      temp[i * 3 + 2] = (Math.random() - 0.5) * 40; // z
    }
    return temp;
  }, [count]);

  useFrame((_, delta) => {
    if (active && mesh.current) {
      const positions = mesh.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] -= delta * 15; // fall speed
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 20; // reset to top
        }
      }
      mesh.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  if (!active) return null;

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#a5f3fc" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}
function IndustrialVentilatingTurbine({ active }: { active: boolean }) {
  const fanRef = useRef<THREE.Group>(null);
  const particleGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (fanRef.current) {
      fanRef.current.rotation.z += active ? 0.38 : 0.02;
    }
    
    // Flowing wind trail lines inside turbine vectors
    if (active && particleGroupRef.current) {
      particleGroupRef.current.children.forEach((mesh, index) => {
        mesh.translateY(0.08);
        if (mesh.position.y > 4.5) {
          mesh.position.y = 2.4;
          mesh.position.x = (Math.random() - 0.5) * 1.5;
          mesh.position.z = (Math.random() - 0.5) * 1.5;
        }
      });
    }
  });

  return (
    <group>
      {/* Symmetrical metal turbine stack cowl */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 2.5, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} />
      </mesh>
      
      {/* High-speed rotor blade mount */}
      <group position={[0, 2.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
         <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.28, 8]} />
            <meshStandardMaterial color="#334155" />
         </mesh>
         <group ref={fanRef}>
           {Array.from({ length: 4 }).map((_, i) => (
             <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0.42, 0]} castShadow>
               <boxGeometry args={[0.12, 0.8, 0.02]} />
               <meshStandardMaterial color="#1e293b" metalness={1.0} roughness={0.2} />
             </mesh>
           ))}
         </group>
      </group>

      {/* Aerodynamic Kinetic Air Flow trail particles */}
      {active && (
        <group ref={particleGroupRef}>
          {Array.from({ length: 8 }).map((_, i) => (
             <mesh key={i} position={[(Math.random() - 0.5) * 1.5, 2.4 + Math.random() * 2, (Math.random() - 0.5) * 1.5]}>
                <boxGeometry args={[0.03, 0.25, 0.03]} />
                <meshBasicMaterial color="#34d399" opacity={0.65} transparent />
             </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

// Overhead Light structures
function IntelligentHalogenLightbar({ active, plotLod = 0 }: { active: boolean; plotLod?: number }) {
  if (plotLod === 2) return null; // Hide completely at distant plots
  return (
    <group position={[0, 7.0, 0]}>
       {/* Sleek support structure crossbars */}
       <mesh castShadow>
          <boxGeometry args={[16.2, 0.08, 0.08]} />
          <meshStandardMaterial color="#475569" />
       </mesh>
       {/* 3D Volumetric tubular bulb filament casing */}
       <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[14, 0.05, 0.2]} />
          <meshStandardMaterial 
            color={active ? "#e0f2fe" : "#1e293b"} 
            emissive={active ? "#06b6d4" : "#000000"} 
            emissiveIntensity={active ? 3.0 : 0} 
          />
       </mesh>
    </group>
  );
}

// ==========================================
// 5B. AUTONOMOUS FIELD MACHINERY (ROBOTIC TRACTOR) WITH COVERAGE PATH & ANNOTATION
// ==========================================

function AutonomousMachinery({ isSelected, showPath, plotIdx, totalPlots }: { isSelected: boolean; showPath: boolean; plotIdx: number; totalPlots: number }) {
  const machineryRef = useRef<THREE.Group>(null);
  const toolSpinnerRef = useRef<THREE.Mesh>(null);
  const wheelRef1 = useRef<THREE.Mesh>(null);
  const wheelRef2 = useRef<THREE.Mesh>(null);
  const wheelRef3 = useRef<THREE.Mesh>(null);
  const wheelRef4 = useRef<THREE.Mesh>(null);

  // Predefined zigzag coverage path nodes relative to the plot center [0, 1.2, 0]
  // Plot boundaries: X [-8, 8], Z [-12, 12]
  const PATH_POINTS = useMemo(() => [
    { x: -5.5, z: -10 },
    { x: 5.5, z: -10 },
    { x: 5.5, z: -5 },
    { x: -5.5, z: -5 },
    { x: -5.5, z: 0 },
    { x: 5.5, z: 0 },
    { x: 5.5, z: 5 },
    { x: -5.5, z: 5 },
    { x: -5.5, z: 10 },
    { x: 5.5, z: 10 }
  ], []);

  // Compute total path length
  const totalLength = useMemo(() => {
    let len = 0;
    for (let i = 0; i < PATH_POINTS.length - 1; i++) {
      const p1 = PATH_POINTS[i];
      const p2 = PATH_POINTS[i + 1];
      len += Math.hypot(p2.x - p1.x, p2.z - p1.z);
    }
    return len;
  }, [PATH_POINTS]);

  // Different plots can have different phase offsets to make it look unsynchronized and organic!
  const phaseOffset = plotIdx * 4.5;

  // Track the current position and completed segments
  const [machineryState, setMachineryState] = useState({
    x: PATH_POINTS[0].x,
    z: PATH_POINTS[0].z,
    angle: 0,
    segmentIndex: 0,
    segmentProgress: 0,
    coveragePercent: 0
  });

  useFrame(({ clock }) => {
    if (!showPath) return;

    const elapsed = clock.getElapsedTime() + phaseOffset;
    // Let the total loop take 60 seconds
    const totalDuration = 60;
    const progressInCycle = (elapsed % totalDuration) / totalDuration; // 0 to 1
    
    // Scale progress to the number of segments (9 segments)
    const segmentsCount = PATH_POINTS.length - 1;
    const globalSegmentProgress = progressInCycle * segmentsCount; // 0 to 9
    const segmentIndex = Math.floor(globalSegmentProgress);
    const segmentProgress = globalSegmentProgress % 1;

    if (segmentIndex >= 0 && segmentIndex < segmentsCount) {
      const p1 = PATH_POINTS[segmentIndex];
      const p2 = PATH_POINTS[segmentIndex + 1];

      // Linear interpolation
      const currentX = p1.x + (p2.x - p1.x) * segmentProgress;
      const currentZ = p1.z + (p2.z - p1.z) * segmentProgress;

      // Heading angle
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const angle = Math.atan2(dx, dz);

      // Compute traveled length up to now
      let traveledLength = 0;
      for (let i = 0; i < segmentIndex; i++) {
        const pt1 = PATH_POINTS[i];
        const pt2 = PATH_POINTS[i + 1];
        traveledLength += Math.hypot(pt2.x - pt1.x, pt2.z - pt1.z);
      }
      traveledLength += Math.hypot(currentX - p1.x, currentZ - p1.z);
      const coveragePercent = Math.min(100, Math.round((traveledLength / totalLength) * 100));

      setMachineryState({
        x: currentX,
        z: currentZ,
        angle,
        segmentIndex,
        segmentProgress,
        coveragePercent
      });

      // Update 3D mesh position & rotation
      if (machineryRef.current) {
        machineryRef.current.position.set(currentX, 1.45, currentZ);
        machineryRef.current.rotation.set(0, angle, 0);
      }

      // Rotate wheels and tools to simulate mechanics
      const spinSpeed = 0.25;
      if (wheelRef1.current) wheelRef1.current.rotation.x += spinSpeed;
      if (wheelRef2.current) wheelRef2.current.rotation.x += spinSpeed;
      if (wheelRef3.current) wheelRef3.current.rotation.x += spinSpeed;
      if (wheelRef4.current) wheelRef4.current.rotation.x += spinSpeed;
      if (toolSpinnerRef.current) toolSpinnerRef.current.rotation.y += 0.4;
    }
  });

  if (!showPath) return null;

  return (
    <group>
      {/* 1. RENDER PLANNED PATH (Dotted Cybernetic Line) */}
      {PATH_POINTS.map((pt, i) => {
        if (i === PATH_POINTS.length - 1) return null;
        const pNext = PATH_POINTS[i + 1];
        return (
          <group key={`plan-${i}`}>
            {/* Draw a subtle grid planned path */}
            <mesh position={[(pt.x + pNext.x) / 2, 1.21, (pt.z + pNext.z) / 2]} rotation={[-Math.PI / 2, 0, Math.atan2(pNext.x - pt.x, pNext.z - pt.z)]}>
              <planeGeometry args={[0.08, Math.hypot(pNext.x - pt.x, pNext.z - pt.z)]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} />
            </mesh>
          </group>
        );
      })}

      {/* 2. RENDER COMPLETED AND COVERED AREA PATHS (Glowing Green/Emerald Sweeps) */}
      {PATH_POINTS.map((pt, i) => {
        if (i > machineryState.segmentIndex) return null;
        const pNext = PATH_POINTS[i + 1];
        if (!pNext) return null;

        let endX = pNext.x;
        let endZ = pNext.z;
        let isCurrent = i === machineryState.segmentIndex;

        if (isCurrent) {
          endX = machineryState.x;
          endZ = machineryState.z;
        }

        const dist = Math.hypot(endX - pt.x, endZ - pt.z);
        if (dist < 0.05) return null;

        const midX = (pt.x + endX) / 2;
        const midZ = (pt.z + endZ) / 2;
        const angle = Math.atan2(endX - pt.x, endZ - pt.z);

        // Turn segments have smaller sweep widths, rows have wider sweep widths (e.g., 2.6 units)
        const isTurn = pt.x === pNext.x; // if X is constant, it's a turn along Z
        const sweepWidth = isTurn ? 1.2 : 2.6;

        return (
          <mesh 
            key={`covered-${i}`} 
            position={[midX, 1.215, midZ]} 
            rotation={[-Math.PI / 2, 0, angle]}
          >
            <planeGeometry args={[sweepWidth, dist]} />
            <meshStandardMaterial 
              color="#10b981" 
              transparent 
              opacity={isSelected ? 0.35 : 0.22} 
              depthWrite={false}
              emissive="#10b981"
              emissiveIntensity={isSelected ? 0.3 : 0.15}
            />
          </mesh>
        );
      })}

      {/* 3. PHYSICAL ROBOT VEHICLE MESH */}
      <group ref={machineryRef} position={[PATH_POINTS[0].x, 1.45, PATH_POINTS[0].z]}>
        {/* Sleek metallic chassis */}
        <mesh castShadow>
          <boxGeometry args={[1.4, 0.4, 2.0]} />
          <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.9} />
        </mesh>
        
        {/* Dynamic primary armor cover */}
        <mesh position={[0, 0.25, -0.1]} castShadow>
          <boxGeometry args={[1.2, 0.2, 1.4]} />
          <meshStandardMaterial color="#10b981" roughness={0.2} metalness={0.6} />
        </mesh>

        {/* Technical Lidar Dome */}
        <mesh position={[0, 0.42, -0.4]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.15, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.52, -0.4]}>
          <cylinderGeometry args={[0.15, 0.15, 0.06, 12]} />
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={3.0} />
        </mesh>

        {/* Spray nozzles or seeding active tool on back */}
        <group position={[0, -0.15, 0.95]}>
          <mesh castShadow>
            <boxGeometry args={[1.8, 0.08, 0.12]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {/* Active spinning tool indicator */}
          <mesh ref={toolSpinnerRef} position={[0, -0.12, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.4, 6]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        </group>

        {/* Cyberpunk LED status headlights */}
        <mesh position={[0.48, 0.15, -0.96]}>
          <boxGeometry args={[0.15, 0.08, 0.08]} />
          <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={4.0} />
        </mesh>
        <mesh position={[-0.48, 0.15, -0.96]}>
          <boxGeometry args={[0.15, 0.08, 0.08]} />
          <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={4.0} />
        </mesh>

        {/* Wheels */}
        {/* Front Left */}
        <mesh ref={wheelRef1} position={[0.78, -0.15, -0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.22, 12]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>
        {/* Front Right */}
        <mesh ref={wheelRef2} position={[-0.78, -0.15, -0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.22, 12]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>
        {/* Rear Left */}
        <mesh ref={wheelRef3} position={[0.78, -0.15, 0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.22, 12]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>
        {/* Rear Right */}
        <mesh ref={wheelRef4} position={[-0.78, -0.15, 0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.22, 12]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>

        {/* 4. FLOATING 3D ANNOTATION OVERLAY CARD */}
        {isSelected && (
          <Html position={[0, 1.8, 0]} center zIndexRange={[100, 10]}>
            <div className="px-3 py-2 bg-slate-950/90 backdrop-blur-md border border-emerald-500/50 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] text-white font-mono min-w-[200px] pointer-events-none select-none flex flex-col gap-1 z-50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  🚜 丰收者-300B (自动)
                </span>
                <span className="text-[8px] px-1 bg-emerald-950/80 text-emerald-300 rounded uppercase font-black tracking-widest animate-pulse">
                  作业中
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-300">
                <span>当日作业覆盖率:</span>
                <span className="font-bold text-emerald-400">{machineryState.coveragePercent}%</span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-300">
                <span>RTK 差分定位:</span>
                <span className="font-bold text-cyan-400">厘米级 (±2cm)</span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-300">
                <span>作业车速 / 电量:</span>
                <span className="font-bold text-slate-200">8.5 km/h / 92%</span>
              </div>
              {/* Progress Bar showing coverage */}
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${machineryState.coveragePercent}%` }} />
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

// ==========================================
// 5. 5G RTK AUTONOMOUS SCANNING PATROL DRONE
// ==========================================

function DroneHelicopterPatrol({ isSelected, focusedPlotX }: { isSelected: boolean, focusedPlotX: number }) {
  const droneRef = useRef<THREE.Group>(null);
  const rotorRef1 = useRef<THREE.Mesh>(null);
  const rotorRef2 = useRef<THREE.Mesh>(null);
  const rotorRef3 = useRef<THREE.Mesh>(null);
  const rotorRef4 = useRef<THREE.Mesh>(null);

  // Flight trajectory calculations using GSAP & smooth sinusoidal noise
  const flightTarget = useRef({ x: focusedPlotX, y: 7.5, z: 2.0 });

  useEffect(() => {
    if (isSelected) {
      gsap.to(flightTarget.current, {
        x: focusedPlotX,
        y: 7.2,
        z: 1.5,
        duration: 1.6,
        ease: "power2.out"
      });
    }
  }, [focusedPlotX, isSelected]);

  useFrame(({ clock }) => {
    if (droneRef.current) {
      const elapsed = clock.getElapsedTime();
      
      // Infinite micro-drifting to look realistic as hovering drone
      const hoverDriftX = isSelected ? Math.sin(elapsed * 2.0) * 1.8 : Math.sin(elapsed * 1.0) * 0.4;
      const hoverDriftY = Math.cos(elapsed * 1.5) * 0.22;
      const hoverDriftZ = Math.cos(elapsed * 2.5) * 1.2;

      // Elastic follow target coordinate with GSAP support
      droneRef.current.position.x += (flightTarget.current.x + hoverDriftX - droneRef.current.position.x) * 0.06;
      droneRef.current.position.y += (flightTarget.current.y + hoverDriftY - droneRef.current.position.y) * 0.06;
      droneRef.current.position.z += (flightTarget.current.z + hoverDriftZ - droneRef.current.position.z) * 0.06;

      // Dynamic tilt simulation on horizontal velocity forces
      const tiltX = Math.sin(elapsed * 2.0) * 0.08;
      const tiltZ = -Math.cos(elapsed * 1.5) * 0.05;
      droneRef.current.rotation.set(tiltX, elapsed * 0.1, tiltZ);
    }

    // High velocity rotor spin calculations (emulating 12,000 RPM)
    const spinSpeed = 0.55;
    if (rotorRef1.current) rotorRef1.current.rotation.y += spinSpeed;
    if (rotorRef2.current) rotorRef2.current.rotation.y += spinSpeed;
    if (rotorRef3.current) rotorRef3.current.rotation.y += spinSpeed;
    if (rotorRef4.current) rotorRef4.current.rotation.y += spinSpeed;
  });

  return (
    <group ref={droneRef} position={[focusedPlotX - 10, 8.5, 5]}>
      {/* Brushed Carbon Composite Hexagonal Body */}
      <mesh castShadow>
         <cylinderGeometry args={[0.5, 0.6, 0.28, 6]} />
         <meshStandardMaterial color="#0b1329" roughness={0.1} metalness={0.9} />
      </mesh>
      
      {/* Sleek Central 5G RTK Antenna Dome with GPS receiver indicator */}
      <mesh position={[0, 0.22, 0]} castShadow>
         <sphereGeometry args={[0.22, 10, 10]} />
         <meshStandardMaterial color="#ffffff" metalness={0.6} />
      </mesh>
      {/* Pulsing blinking telemetry status bulb */}
      <mesh position={[0, 0.35, 0]}>
         <sphereGeometry args={[0.04, 5, 5]} />
         <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={3} />
      </mesh>

      {/* Hexacopter arms extending outwards representing technical structure */}
      {/* Front-Left arm */}
      <group position={[0.4, -0.05, 0.4]} rotation={[0, -Math.PI / 4, 0]}>
         <mesh castShadow>
           <boxGeometry args={[1.1, 0.04, 0.08]} />
           <meshStandardMaterial color="#1e293b" />
         </mesh>
         <mesh position={[0.55, 0.08, 0]} ref={rotorRef1} castShadow>
            <boxGeometry args={[0.9, 0.015, 0.04]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
         </mesh>
      </group>
      
      {/* Front-Right arm */}
      <group position={[-0.4, -0.05, 0.4]} rotation={[0, Math.PI / 4, 0]}>
         <mesh castShadow>
           <boxGeometry args={[1.1, 0.04, 0.08]} />
           <meshStandardMaterial color="#1e293b" />
         </mesh>
         <mesh position={[0.55, 0.08, 0]} ref={rotorRef2} castShadow>
            <boxGeometry args={[0.9, 0.015, 0.04]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
         </mesh>
      </group>

      {/* Back-Left arm */}
      <group position={[0.4, -0.05, -0.4]} rotation={[0, Math.PI / 4, 0]}>
         <mesh castShadow>
           <boxGeometry args={[1.1, 0.04, 0.08]} />
           <meshStandardMaterial color="#1e293b" />
         </mesh>
         <mesh position={[0.55, 0.08, 0]} ref={rotorRef3} castShadow>
            <boxGeometry args={[0.9, 0.015, 0.04]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
         </mesh>
      </group>
      
      {/* Back-Right arm */}
      <group position={[-0.4, -0.05, -0.4]} rotation={[0, -Math.PI / 4, 0]}>
         <mesh castShadow>
           <boxGeometry args={[1.1, 0.04, 0.08]} />
           <meshStandardMaterial color="#1e293b" />
         </mesh>
         <mesh position={[0.55, 0.08, 0]} ref={rotorRef4} castShadow>
            <boxGeometry args={[0.9, 0.015, 0.04]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
         </mesh>
      </group>

      {/* Underbelly High-Definition Gimbal Camera projecting Volumetric Cyan Scan Cone */}
      <group position={[0, -0.22, 0]}>
         <mesh castShadow>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color="#111827" metalness={0.9} />
         </mesh>
         {/* Sweeping scan plane volumetric downlight */}
         {isSelected && (
           <group>
             <mesh position={[0, -3.2, 0]} rotation={[0, 0, 0]}>
                <coneGeometry args={[1.8, 6.2, 24, 1, true]} />
                <meshStandardMaterial color="#22d3ee" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} emissive="#22d3ee" emissiveIntensity={0.6} blending={THREE.AdditiveBlending} />
             </mesh>
             {/* Glowing scanning laser matrix line projected directly on crop level */}
             <mesh position={[0, -6.1, 0]}>
                <ringGeometry args={[1.65, 1.76, 32]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
             </mesh>
           </group>
         )}
      </group>
    </group>
  );
}


// ==========================================
// 3D FRUSTUM CULLING & LEVEL OF DETAIL (LOD) OPTIMIZATION WRAPPER
// ==========================================
function PlotLODAndCullingWrapper({ children, position, isSelected }: { children: (plotLod: number) => React.ReactNode, position: [number, number, number], isSelected: boolean }) {
  const { camera } = useThree();
  const quality = useQuality();
  const groupRef = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(true);
  const [lod, setLod] = useState(0);
  // 错相位初始偏移：让各地块的 LOD 重算/重生成分散到不同帧，
  // 消除"靠近时多块同帧一起 setLod → 同步重建 → 瞬时卡死(掉到0~1帧)"的尖峰
  const frameCountRef = useRef(Math.floor(Math.random() * 8));

  useFrame(() => {
    if (!groupRef.current) return;

    frameCountRef.current++;
    if (frameCountRef.current % 8 !== 0) return; // Throttled to every 8 frames for absolute maximum performance

    // If selected, override completely to highest detail
    if (isSelected) {
      if (!visible) setVisible(true);
      if (lod !== 0) setLod(0);
      return;
    }

    const worldPos = new THREE.Vector3();
    groupRef.current.getWorldPosition(worldPos);

    // 1. Frustum Culling
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const sphereCenter = new THREE.Vector3(worldPos.x, worldPos.y + 1, worldPos.z);
    const sphereRadius = 22; // Conservative sphere radius covering the plot and greenhouse
    const isIntersecting = frustum.intersectsSphere(new THREE.Sphere(sphereCenter, sphereRadius));

    // 2. LOD Distance Calculation
    const dist = camera.position.distanceTo(worldPos);
    let calculatedLod = 0;
    if (dist > quality.lod1Distance) {
      calculatedLod = 2;
    } else if (dist > quality.lod0Distance) {
      calculatedLod = 1;
    } else {
      calculatedLod = 0;
    }

    if (isIntersecting !== visible) {
      setVisible(isIntersecting);
    }
    if (calculatedLod !== lod) {
      setLod(calculatedLod);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {visible ? children(lod) : null}
    </group>
  );
}


// ==========================================
// REAL-TIME RENDERING PERFORMANCE TRACKER
// ==========================================
interface PerformanceTrackerProps {
  onUpdate: (fps: number, triangles: number, drawCalls: number) => void;
}

// 把 R3F 相机/视口暴露给画布外的 DOM 覆盖层，用于屏幕框选 → 世界坐标投影
interface R3FStore { camera: THREE.Camera; width: number; height: number; }
function R3FBridge({ store }: { store: React.MutableRefObject<R3FStore | null> }) {
  const { camera, size } = useThree();
  useEffect(() => { store.current = { camera, width: size.width, height: size.height }; }, [camera, size, store]);
  return null;
}

function PerformanceTracker({ onUpdate }: PerformanceTrackerProps) {
  const { gl } = useThree();
  const lastTime = useRef(performance.now());
  const frames = useRef(0);

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now >= lastTime.current + 500) { // update twice per second
      const fps = Math.round((frames.current * 1000) / (now - lastTime.current));
      const triangles = gl.info.render.triangles;
      const drawCalls = gl.info.render.calls;
      
      onUpdate(fps, triangles, drawCalls);
      
      frames.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}


// Loader Overlay to display progress when loading models/assets
function LoaderOverlay() {
  const { progress, active } = useProgress();

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 bg-opacity-90 backdrop-blur-sm pointer-events-none transition-opacity duration-500">
      <div className="relative flex flex-col items-center">
        {/* Spinner */}
        <div className="w-24 h-24 mb-6 relative">
          <div className="absolute inset-0 rounded-full border-t-2 border-emerald-500 animate-spin"></div>
          <div className="absolute inset-2 rounded-full border-r-2 border-cyan-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          <div className="absolute inset-4 rounded-full border-b-2 border-indigo-500 animate-spin" style={{ animationDuration: '2s' }}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-emerald-400 text-sm font-bold font-mono">{progress.toFixed(0)}%</span>
          </div>
        </div>
        <div className="text-emerald-400 font-medium tracking-widest text-sm uppercase">
          农场数据构建中...
        </div>
        <div className="mt-3 w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300 ease-out" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT EXPORT
// ==========================================

function DayNightEnvironment({ droneX, isRaining }: { droneX: number, isRaining: boolean }) {
  const quality = useQuality();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const [sunPos, setSunPos] = useState<[number, number, number]>([120, 50, -80]);
  const [ambientIntensity, setAmbientIntensity] = useState(0.65);
  const [sunIntensity, setSunIntensity] = useState(4.5);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const cycleDuration = 120;
    const progress = (elapsed % cycleDuration) / cycleDuration;
    const angle = progress * Math.PI * 2;
    const y = Math.sin(angle) * 200;
    const x = Math.cos(angle) * 200;
    const z = -80;

    if (sunRef.current) {
      sunRef.current.position.set(x, y, z);
    }
    
    if (Math.floor(elapsed * 10) % 10 === 0) {
      setSunPos([x, y, z]);
      let newAmb = y > 0 ? 0.65 : 0.15;
      let newSun = y > 0 ? 4.5 : 0.0;
      if (isRaining) {
        newAmb *= 0.6;
        newSun *= 0.2;
      }
      if (ambientIntensity !== newAmb) setAmbientIntensity(newAmb);
      if (sunIntensity !== newSun) setSunIntensity(newSun);
    }
  });

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <hemisphereLight args={['#ffffff', '#5c3a24', ambientIntensity * 1.5]} />
      <group position={[droneX, 0, 0]}>
        <directionalLight
          ref={sunRef}
          castShadow={quality.shadowsEnabled}
          intensity={sunIntensity}
          color="#fff1e6"
          shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
          shadow-bias={-0.0001}
        >
          <orthographicCamera attach="shadow-camera" args={[-250, 250, 250, -250, 0.1, 800]} />
        </directionalLight>
        <spotLight position={[0, 110, 0]} angle={0.4} penumbra={1.0} intensity={isRaining ? 1.5 : 4.5} color="#f0f9ff" castShadow={quality.shadowsEnabled} />
      </group>
      <Sky distance={350000} sunPosition={sunPos} inclination={0.4} azimuth={0.2} turbidity={isRaining ? 15 : 6.5} rayleigh={isRaining ? 3 : 1.5} mieCoefficient={isRaining ? 0.02 : 0.005} mieDirectionalG={0.8} />
      {quality.starCount > 0 && <Stars radius={110} depth={45} count={quality.starCount} factor={4} saturation={0.1} fade speed={1.2} />}
    </>
  );
}

export default function ThreeJsMicroView({ plots, activePlotId, onSelectPlot, viewMode, onControlHardware, onFertilize, hardwareStatus, realtimeData, aiResult, isImmersive, readOnly }: DigitalTwinProps & { viewMode: string }) {
  const [cameraPreset, setCameraPreset] = useState<string>('overview');
  const [isCruising, setIsCruising] = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [isRaining, setIsRaining] = useState(false);
  const [showAggregation, setShowAggregation] = useState(false);
  const [growthStage, setGrowthStage] = useState<number>(1.0); // 0.2: Seedling, 0.5: Jointing, 0.8: Heading, 1.0: Maturity

  // 农艺参数全局调控（行距/株距/密度/垄沟/种子）—— 数字孪生虚实映射可调核心
  const [agroConfig, setAgroConfig] = useState<AgronomyConfig>({
    rowSpacingCm: 20, plantSpacingCm: 3, densityFactor: 1.0,
    seed: 20240628, ridgeSpacingCm: 150, ridgeHeightCm: 15, ridgeWidthCm: 90,
  });
  const [showAgroPanel, setShowAgroPanel] = useState(false);

  // 风场调控（风力/风向）—— 写入模块级 windState，供作物顶点着色器逐帧读取
  const [windSpeed, setWindSpeed] = useState(1.0);
  const [windDirDeg, setWindDirDeg] = useState(45);
  useEffect(() => {
    windState.speed = windSpeed;
    windState.dirDeg = windDirDeg;
  }, [windSpeed, windDirDeg]);

  // 移动端检测：将悬浮控制面板改为「底部抽屉式堆叠」，避免窄屏相互重叠
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  // 浮层定位：桌面沿用绝对浮动定位；移动端统一为底部抽屉（全宽、圆角、可滚动、置顶覆盖 dock）
  const dtSheet = (desktopPos: string) =>
    isMobile
      ? 'fixed inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto z-50 rounded-t-3xl rounded-b-none border-x-0 border-b-0 animate-[slideUpSheet_0.25s_ease-out]'
      : desktopPos;
  // 进入移动端时，默认收起常驻面板，避免多个抽屉同时堆叠在底部（用户按需逐个唤起）
  useEffect(() => {
    if (isMobile) {
      setLhsCollapsed(true);
      setShowPerfPanel(false);
    }
  }, [isMobile]);

  // 框选区域聚合统计（微观→宏观一键聚合）
  const r3fStore = useRef<R3FStore | null>(null);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [selRect, setSelRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const selDragging = useRef(false);
  const [boxStats, setBoxStats] = useState<null | { count: number; avgHeight: number; areaM2: number; dist: Record<string, number>; error?: string }>(null);

  // 屏幕矩形 → 地面世界坐标 → 统计焦点地块在该区域内的植株（与渲染共用确定性生成器）
  const computeBoxStats = (rect: { x0: number; y0: number; x1: number; y1: number }) => {
    const store = r3fStore.current;
    if (!store) return;
    if (focusedIdx < 0 || !currentPlot) { setBoxStats({ count: 0, avgHeight: 0, areaM2: 0, dist: {}, error: '请先在底部选择一个地块' }); return; }
    const { camera, width, height } = store;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const toWorld = (sx: number, sy: number) => {
      const ndc = new THREE.Vector2((sx / width) * 2 - 1, -(sy / height) * 2 + 1);
      ray.setFromCamera(ndc, camera as THREE.Camera);
      const out = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, out);
    };
    const corners = [toWorld(rect.x0, rect.y0), toWorld(rect.x1, rect.y1), toWorld(rect.x0, rect.y1), toWorld(rect.x1, rect.y0)];
    if (corners.some(c => !c)) { setBoxStats({ count: 0, avgHeight: 0, areaM2: 0, dist: {}, error: '选区超出地面范围，请俯视地块后再框选' }); return; }
    const xs = corners.map(c => c!.x), zs = corners.map(c => c!.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const originX = focusedIdx * 30 - totalOffsetWidth / 2;
    const prof = getCropProfile(currentPlot.crop);
    const isOrchard = /果|林|苹果/.test(currentPlot.crop || '');
    const { plants } = generatePlantField({ seed: agroConfig.seed, rowSpacingCm: agroConfig.rowSpacingCm, plantSpacingCm: agroConfig.plantSpacingCm, densityFactor: agroConfig.densityFactor, plotLod: 0, isOrchard });
    const mh = interpolateMorphology(prof, growthStage).heightCm;
    let count = 0, sumH = 0;
    const dist: Record<string, number> = { healthy: 0, drought: 0, nitrogen_deficient: 0, pest: 0 };
    for (const p of plants) {
      const wx = originX + p.x, wz = p.z;
      if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
        count++; sumH += mh * p.scale; dist[p.status] = (dist[p.status] || 0) + 1;
      }
    }
    const areaM2 = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    setBoxStats({ count, avgHeight: count ? sumH / count : 0, areaM2, dist });
  };

  // JSON / 接口 批量数据导入（数据闭环：一键刷新全田块微观状态）
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  // plotId -> { soil_hum?, status? } 业务覆盖层
  const [importedData, setImportedData] = useState<Record<string, { soil_hum?: number; status?: string }>>({});

  // 生成与当前田块匹配的示例 JSON（生长进度 + 墒情 + 长势状态）
  const buildSampleImport = () => {
    const sample = {
      meta: { source: '农场物联网平台 / 批量接口', timestamp: new Date().toISOString() },
      globalGrowthStage: '抽穗',
      plots: plots.map((p, i) => ({
        plotId: p.id,
        name: p.name,
        soilMoisture: [38.5, 62.4, 81.2, 55.0, 47.3][i % 5],
        dominantStatus: ['drought', 'healthy', 'healthy', 'nitrogen_deficient', 'pest'][i % 5],
      })),
    };
    setImportText(JSON.stringify(sample, null, 2));
    setImportStatus(null);
  };

  // 解析 JSON 并一键刷新全田块微观状态
  const applyImport = () => {
    try {
      const parsed = JSON.parse(importText);
      const stageMap: Record<string, number> = { 苗期: 0.2, 拔节: 0.5, 拔节期: 0.5, 抽穗: 0.8, 抽穗期: 0.8, 抽雄: 0.8, 抽雄期: 0.8, 成熟: 1.0, 成熟期: 1.0 };
      if (typeof parsed.globalGrowthStage === 'string' && stageMap[parsed.globalGrowthStage] != null) {
        setGrowthStage(stageMap[parsed.globalGrowthStage]);
      } else if (typeof parsed.globalGrowthStage === 'number') {
        setGrowthStage(Math.max(0.1, Math.min(1.0, parsed.globalGrowthStage)));
      }
      const next: Record<string, { soil_hum?: number; status?: string }> = {};
      let n = 0;
      if (Array.isArray(parsed.plots)) {
        for (const row of parsed.plots) {
          if (!row || !row.plotId) continue;
          next[row.plotId] = {
            soil_hum: typeof row.soilMoisture === 'number' ? row.soilMoisture : undefined,
            status: typeof row.dominantStatus === 'string' ? row.dominantStatus : undefined,
          };
          n++;
        }
      }
      setImportedData(next);
      setShowCrop(true);
      setImportStatus({ ok: true, msg: `已刷新 ${n} 个田块的生长/墒情数据` });
    } catch (e: any) {
      setImportStatus({ ok: false, msg: 'JSON 解析失败，请检查格式' });
    }
  };

  const cruiseStep = useRef(0);
  const cruisePropsRef = useRef({ plots, onSelectPlot, setCameraPreset });

  useEffect(() => {
    cruisePropsRef.current = { plots, onSelectPlot, setCameraPreset };
  }, [plots, onSelectPlot, setCameraPreset]);

  // G key shortcut for anomalies, R for rain
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'g') {
        setShowAnomalies(prev => !prev);
      }
      if (e.key.toLowerCase() === 'r') {
        setIsRaining(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let timeoutId: any;

    const performCruise = () => {
      if (!isCruising) return;
      
      const { plots, onSelectPlot, setCameraPreset } = cruisePropsRef.current;
      const step = cruiseStep.current;
      
      if (step === 0) {
        onSelectPlot(null);
      } else if (step === 1) {
        if (plots && plots.length > 0) {
          onSelectPlot(plots[0].id);
        }
        setCameraPreset('overview');
      } else if (step === 2) {
        if (plots && plots.length > 0) {
          onSelectPlot(plots[0].id);
        }
        setCameraPreset('canopy');
      }
      
      cruiseStep.current = (step + 1) % 3;
      timeoutId = setTimeout(performCruise, 6000);
    };

    if (isCruising) {
      cruiseStep.current = 0;
      performCruise();
    }

    return () => clearTimeout(timeoutId);
  }, [isCruising]);

  const [processingDevice, setProcessingDevice] = useState<string | null>(null);

  const handleControlHardware = (type: string) => {
    if (processingDevice) return;
    setProcessingDevice(type);
    setTimeout(() => {
      onControlHardware(type as any);
      setProcessingDevice(null);
    }, 800); // Simulate network delay
  };

  const [lhsCollapsed, setLhsCollapsed] = useState(false);
  const [show3dHud, setShow3dHud] = useState(true);
  const [showPerfPanel, setShowPerfPanel] = useState(true);
  const [perfMetrics, setPerfMetrics] = useState({ fps: 60, triangles: 0, drawCalls: 0 });
  const [fpsHistory, setFpsHistory] = useState<number[]>(() => Array(20).fill(60));

  // ====== 自适应画质：档位状态 ======
  const [qualityMode, setQualityMode] = useState<QualityMode>('auto');     // 用户选择：auto/ultra/high/medium/low
  const [autoTier, setAutoTier] = useState<QualityTier>('high');           // 自动模式下的实际档位
  const effectiveTier: QualityTier = qualityMode === 'auto' ? autoTier : qualityMode;
  const qualitySettings = QUALITY_PRESETS[effectiveTier];

  // 进场按硬件信息粗判起步档位
  useEffect(() => {
    setAutoTier(detectInitialTier());
  }, []);

  // 运行时自适应：自动模式下根据帧率升降档（快降慢升 + 滞回 + 冷却，防抖动）
  const adaptRef = useRef({ low: 0, high: 0, lastChange: 0 });
  const handlePerfUpdate = (fps: number, triangles: number, drawCalls: number) => {
    setPerfMetrics({ fps, triangles, drawCalls });
    setFpsHistory(prev => [...prev.slice(1), fps]);

    if (qualityMode !== 'auto') return;
    const a = adaptRef.current;
    const now = performance.now();
    if (fps < 30) { a.low++; a.high = 0; }
    else if (fps > 56) { a.high++; a.low = 0; }
    else { a.low = Math.max(0, a.low - 1); a.high = Math.max(0, a.high - 1); }

    setAutoTier(prev => {
      const idx = QUALITY_ORDER.indexOf(prev);
      // 连续 ~2s 低帧 → 立即降档（优先保流畅）
      if (a.low >= 4 && idx > 0 && now - a.lastChange > 3000) {
        a.low = 0; a.lastChange = now;
        return QUALITY_ORDER[idx - 1];
      }
      // 连续 ~6s 高帧 → 谨慎升档
      if (a.high >= 12 && idx < QUALITY_ORDER.length - 1 && now - a.lastChange > 6000) {
        a.high = 0; a.lastChange = now;
        return QUALITY_ORDER[idx + 1];
      }
      return prev;
    });
  };

  const [showRoof, setShowRoof] = useState(true);
  const [showPlot, setShowPlot] = useState(true);
  const [showCrop, setShowCrop] = useState(true);
  const [showMachineryPath, setShowMachineryPath] = useState(true);

  // WebSocket Smooth Realtime Data
  const [wsData, setWsData] = useState<any>(null);

  // Raycasting click debouncing & dragging collision prevention optimization
  const lastPointerDown = useRef<{ [plotId: string]: { x: number, y: number, time: number } }>({});
  const lastClickTime = useRef<number>(0);
  
  useEffect(() => {
    if (!activePlotId) return;
    
    let ws: WebSocket;
    const obj = { temp: 0, hum: 0, lux: 0, co2: 0, soil_n: 0, soil_p: 0, soil_k: 0, soil_hum: 0 };
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', plotId: activePlotId }));
      };
      
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'realtime_data' && parsed.data.plotId === activePlotId) {
             const target = parsed.data;
             if (obj.temp === 0) {
                obj.temp = target.temp;
                obj.hum = target.hum;
                obj.lux = target.lux;
                obj.co2 = target.co2;
                obj.soil_n = target.soil_n;
                obj.soil_p = target.soil_p;
                obj.soil_k = target.soil_k;
                obj.soil_hum = target.soil_hum;
                setWsData({ ...obj });
             } else {
                gsap.to(obj, {
                   temp: target.temp,
                   hum: target.hum,
                   lux: target.lux,
                   co2: target.co2,
                   soil_n: target.soil_n,
                   soil_p: target.soil_p,
                   soil_k: target.soil_k,
                   soil_hum: target.soil_hum,
                   duration: 0.25,
                   ease: 'none',
                   onUpdate: () => setWsData({ ...obj })
                });
             }
          }
        } catch(e) {}
      };
    } catch(err) {
       console.error("WS connect failed", err);
    }
    
    return () => {
       if (ws) ws.close();
       gsap.killTweensOf(obj);
    };
  }, [activePlotId]);
  const [showPOI, setShowPOI] = useState(true);

  useEffect(() => {
    const handleClosePopups = () => {
      setShow3dHud(false);
      setLhsCollapsed(true);
    };
    const handleOpenPopups = () => {
      setShow3dHud(true);
      setLhsCollapsed(false);
    };
    const handleToggleRoof = () => setShowRoof(v => !v);
    const handleTogglePlot = () => setShowPlot(v => !v);
    const handleToggleCrop = () => setShowCrop(v => !v);
    const handleTogglePOI = () => setShowPOI(v => !v);
    const handleToggleFirstPerson = () => setCameraPreset(v => v === 'sensor' ? 'overview' : 'sensor');

    window.addEventListener('closeAllPopups', handleClosePopups);
    window.addEventListener('openAllPopups', handleOpenPopups);
    window.addEventListener('toggleRoof', handleToggleRoof);
    window.addEventListener('togglePlot', handleTogglePlot);
    window.addEventListener('toggleCrop', handleToggleCrop);
    window.addEventListener('togglePOI', handleTogglePOI);
    window.addEventListener('toggleFirstPerson', handleToggleFirstPerson);

    return () => {
      window.removeEventListener('closeAllPopups', handleClosePopups);
      window.removeEventListener('openAllPopups', handleOpenPopups);
      window.removeEventListener('toggleRoof', handleToggleRoof);
      window.removeEventListener('togglePlot', handleTogglePlot);
      window.removeEventListener('toggleCrop', handleToggleCrop);
      window.removeEventListener('togglePOI', handleTogglePOI);
      window.removeEventListener('toggleFirstPerson', handleToggleFirstPerson);
    };
  }, []);

  const currentPlot = useMemo(() => {
    return plots.find(p => p.id === activePlotId) || plots[0];
  }, [plots, activePlotId]);

  const focusedIdx = useMemo(() => {
    return plots.findIndex(p => p.id === activePlotId);
  }, [plots, activePlotId]);

  const totalOffsetWidth = (plots.length - 1) * 30;
  const droneX = focusedIdx !== -1 ? (focusedIdx * 30 - totalOffsetWidth / 2) : 0;

  return (
    <div className="w-full h-full bg-slate-950 relative overflow-hidden">
      <LoaderOverlay />
      {viewMode === 'micro' && (
        <Canvas
          camera={{ position: [60, 50, 100], fov: 45 }}
          dpr={qualitySettings.dpr}
          shadows
          gl={{ powerPreference: 'high-performance', antialias: true }}
          performance={{ min: 0.5 }}
        >
          <QualityContext.Provider value={qualitySettings}>
          <PerformanceTracker onUpdate={handlePerfUpdate} />
          <R3FBridge store={r3fStore} />
          <fog attach="fog" args={['#01040a', 200, 800]} />
          <CameraController activePlotId={activePlotId} plots={plots} cameraPreset={cameraPreset} />
          <OrbitControls makeDefault enablePan={true} maxPolarAngle={Math.PI / 2 - 0.15} enabled={!boxSelectMode} />
          
          <DayNightEnvironment droneX={droneX} isRaining={isRaining} />

          {/* Cybernetic Dark Net Floor Grid */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.1, 0]}>
            <planeGeometry args={[1200, 1200]} />
            <meshStandardMaterial color="#082b1a" roughness={1.0} metalness={0} />
            <gridHelper args={[1200, 600, '#0f5e3e', '#033320']} rotation={[Math.PI / 2, 0, 0]} />
          </mesh>

          {/* Drone Patrol Unit scanning focused sectors */}
          <DroneHelicopterPatrol isSelected={activePlotId !== null} focusedPlotX={droneX} />

          {/* Symmetrical far scenery band featuring greenbelts, hazy mountains & power lines */}
          <CinematicBackgroundDecorations plotsCount={plots.length} />

          <RainParticles active={isRaining} />

          {plots.map((plot, i) => {
            const isSelected = activePlotId === plot.id;
            
            // Database reactive metrics fetch
            const tempVal = (isSelected && wsData?.temp != null) ? wsData.temp : (isSelected && realtimeData?.temp != null ? realtimeData.temp : plot.realtime?.temp || 24.5);
            const humVal = (isSelected && wsData?.hum != null) ? wsData.hum : (isSelected && realtimeData?.hum != null ? realtimeData.hum : plot.realtime?.hum || 72.8);
            const importedMoisture = importedData[plot.id]?.soil_hum;
            const soilMoisture = importedMoisture != null ? importedMoisture : ((isSelected && wsData?.soil_hum != null) ? wsData.soil_hum : (isSelected && realtimeData?.soil_hum != null ? realtimeData.soil_hum : plot.realtime?.soil_hum || 62.4));
            const luxVal = (isSelected && wsData?.lux != null) ? wsData.lux : (isSelected && realtimeData?.lux != null ? realtimeData.lux : plot.realtime?.lux || 1920);
            const co2Val = (isSelected && wsData?.co2 != null) ? wsData.co2 : (isSelected && realtimeData?.co2 != null ? realtimeData.co2 : plot.realtime?.co2 || 430);
            const nVal = (isSelected && wsData?.soil_n != null) ? wsData.soil_n : (isSelected && realtimeData?.soil_n != null ? realtimeData.soil_n : 45);
            const pVal = (isSelected && wsData?.soil_p != null) ? wsData.soil_p : (isSelected && realtimeData?.soil_p != null ? realtimeData.soil_p : 20);
            const kVal = (isSelected && wsData?.soil_k != null) ? wsData.soil_k : (isSelected && realtimeData?.soil_k != null ? realtimeData.soil_k : 120);

            // IoT Sensor Health Check metrics (designed with warning states: plot index 0 has low battery, plot index 1 has low signal)
            const batteryVal = i === 0 ? 12 : (i === 2 ? 18 : 88 - (i * 5) % 15);
            const signalVal = i === 1 ? 15 : (i === 3 ? 22 : 94 - (i * 4) % 10);

            // Determine if plot has anomalies
            let isAnomalous = false;
            let anomalyReason = '';
            if (soilMoisture < 40) {
              isAnomalous = true;
              anomalyReason = '土壤缺水';
            } else if (tempVal > 35) {
              isAnomalous = true;
              anomalyReason = '温度过高';
            } else if (i === 1) { // Fallback to ensure at least one demo plot shows anomaly
              isAnomalous = true;
              anomalyReason = '生长缓慢';
            }

            return (
              <PlotLODAndCullingWrapper
                key={plot.id}
                position={[i * 30 - totalOffsetWidth / 2, 0, 0]}
                isSelected={isSelected}
              >
                {(plotLod) => (
                  <group 
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      lastPointerDown.current[plot.id] = {
                        x: e.clientX,
                        y: e.clientY,
                        time: Date.now()
                      };
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const downData = lastPointerDown.current[plot.id];
                      const now = Date.now();
                      
                      // Debounce rapid clicking / jitter (within 250ms)
                      if (now - lastClickTime.current < 250) {
                        return;
                      }

                      if (downData) {
                        const timeDiff = now - downData.time;
                        const dist = Math.hypot(e.clientX - downData.x, e.clientY - downData.y);
                        
                        // Clean up
                        delete lastPointerDown.current[plot.id];

                        // If user dragged the mouse (distance > 6px) or held click too long (duration > 250ms),
                        // we treat it as a camera rotate/drag operation, not a click.
                        if (dist > 6 || timeDiff > 250) {
                          return;
                        }
                      }
                      
                      lastClickTime.current = now;
                      onSelectPlot(plot.id);
                      setShow3dHud(true);
                    }}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={(e) => {
                      e.stopPropagation();
                      document.body.style.cursor = 'auto';
                    }}
                  >
                    
                    {/* Geological subsoil structural profile (incorporates the soil planes and vegetation canopy) */}
                    {showPlot && (
                      <VolumetricSoilStrata 
                        isSelected={isSelected} 
                        plot={plot} 
                        irrigationActive={isSelected ? !!hardwareStatus.irrigation : false} 
                        realtimeData={isSelected ? (wsData || realtimeData) : undefined} 
                        showCrop={showCrop} 
                        plotLod={plotLod}
                        isRaining={isRaining}
                        showAnomalies={showAnomalies}
                        targetGrowthStage={growthStage}
                        agro={agroConfig}
                      />
                    )}

                    {/* Glass Greenhouse Roof */}
                    {showRoof && <GreenhouseGlassRoof plotLod={plotLod} />}

                    {/* Symmetrical rural fence rails, wild flower bushes and small water pumps on edges */}
                    {showPlot && <PlotSideDecoration plotLod={plotLod} />}

                    {/* Intelligent overhead spectrum lightbars */}
                    {showPlot && <IntelligentHalogenLightbar active={isSelected ? !!hardwareStatus.lighting : false} plotLod={plotLod} />}

                    {/* Precision telemetry antennas (Moisture, Air Temperature, Air Humidity) */}
                    {showPOI && plotLod < 2 && (
                      <>
                        <TelemetrySensorNode position={[7.5, 0, 11.5]} type="weather" label="空气温度" value={tempVal} unit="℃" status={tempVal > 35 ? 'error' : 'online'} />
                        <TelemetrySensorNode position={[7.5, 0, -11.5]} type="weather" label="空气湿度" value={humVal} unit="%" status={batteryVal < 20 ? 'offline' : 'online'} />
                        <TelemetrySensorNode position={[-7.5, 0, 11.5]} type="soil" label="土壤水分" value={soilMoisture} unit="%" status={soilMoisture < 40 ? 'error' : 'online'} />
                      </>
                    )}

                    {/* Dynamic kinetic sprinkler systems */}
                    {showPlot && plotLod < 2 && <DynamicRotarySprinkler active={isSelected ? !!hardwareStatus.irrigation : false} />}

                    {/* Expanding wetness ripples when active */}
                    {showPlot && isSelected && hardwareStatus.irrigation && (
                       <WaterIrrigationRipple />
                    )}

                    {/* Industrial ventilation engine */}
                    {showPlot && plotLod < 2 && (
                      <group position={[-7.5, 0, -11.5]}>
                          <IndustrialVentilatingTurbine active={isSelected ? !!hardwareStatus.ventilation : false} />
                      </group>
                    )}

                    {/* Autonomous Ground Agricultural Machinery & Coverage Path Layer */}
                    {showPlot && (
                      <AutonomousMachinery 
                        isSelected={isSelected} 
                        showPath={showMachineryPath} 
                        plotIdx={i} 
                        totalPlots={plots.length} 
                      />
                    )}

                    {/* Anomaly Marker Component */}
                    {showAnomalies && isAnomalous && (
                      <Html position={[0, 15, 0]} center zIndexRange={[100, 0]} className="pointer-events-none">
                        <div className="flex flex-col items-center">
                           <div className="px-3 py-1 bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black tracking-widest uppercase rounded-md shadow-[0_0_15px_rgba(220,38,38,0.6)] border border-red-400/50 animate-bounce whitespace-nowrap">
                              ⚠️ 异常: {anomalyReason}
                           </div>
                           <div className="w-0.5 h-12 bg-gradient-to-b from-red-500 to-transparent"></div>
                        </div>
                      </Html>
                    )}

                    {/* Active focal node cyberpunk neon wireframe bounds */}
                    <Float speed={isSelected ? 0 : 2.0} rotationIntensity={isSelected ? 0 : 0.05} floatIntensity={isSelected ? 0 : 0.4}>
                      
                      {isSelected && (
                        <lineSegments position={[0, 1.2, 0]}>
                          <edgesGeometry args={[new THREE.BoxGeometry(16, 2.4, 24)]} />
                          <lineBasicMaterial color="#22d3ee" opacity={0.9} transparent linewidth={3.5} />
                        </lineSegments>
                      )}

                      {/* Semitransparent dynamic data glow bounds */}
                      <mesh position={[0, 1.2, 0]}>
                         <boxGeometry args={[16, 2.4, 24]} />
                         <meshStandardMaterial 
                           color={isSelected ? "#0891b2" : "#1e293b"} 
                           transparent 
                           opacity={isSelected ? 0.09 : 0.015}
                           depthWrite={false}
                         />
                      </mesh>

                      {/* Falling precipitation spark loops when irrigation is active */}
                      {hardwareStatus.irrigation && isSelected && (
                        <Sparkles count={90} scale={[14.5, 5, 22.5]} size={5} speed={5.5} opacity={0.7} color="#93c5fd" position={[0, 3.5, 0]} />
                      )}

                      {/* Ambient smart health dynamic sparkles */}
                      {isSelected && (
                        <Sparkles count={55} scale={[15, 9, 23]} size={2.5} speed={1.8} opacity={0.55} color="#34d399" position={[0, 4.5, 0]} />
                      )}

                      {/* UX 3D interactive hotspot to re-wake closed 3D HUD */}
                      {isSelected && !show3dHud && (
                        <Html position={[0, 4.2, 0]} center>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setShow3dHud(true);
                             }}
                             className="w-10 h-10 rounded-full bg-slate-950/95 border border-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.7)] flex items-center justify-center text-cyan-300 hover:scale-110 active:scale-95 transition-all text-sm pointer-events-auto cursor-pointer animate-pulse"
                             style={{ animationDuration: '3s' }}
                             title="点击唤起 3D 浮动 data 弹窗"
                           >
                             📊
                           </button>
                        </Html>
                      )}

                      {/* Interactive Hotspot for unselected plots to zoom in and view data */}
                      {!isSelected && (
                        <Html position={[0, 4.2, 0]} center zIndexRange={[100, 0]}>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               onSelectPlot(plot.id);
                               setShow3dHud(true);
                             }}
                             className="group flex flex-col items-center justify-center pointer-events-auto cursor-pointer"
                             title="查看区块统计数据"
                           >
                             <div className="bg-[#020B14]/90 backdrop-blur-md border border-cyan-500/50 p-2 rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] mb-1 transform transition-all whitespace-nowrap min-w-[140px] text-left">
                               <div className="text-cyan-400 text-xs font-bold tracking-widest border-b border-cyan-900 pb-1 mb-1">{plot.name} 区块统计</div>
                               <div className="text-[9px] text-slate-300 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                 <span className="text-slate-400">平均株高:</span><span className="text-white">{(plot.crop.includes('玉米') ? 2.1 : 1.4).toFixed(2)}m</span>
                                 <span className="text-slate-400">优良率:</span><span className="text-emerald-400">92%</span>
                                 <span className="text-slate-400">土壤含水:</span><span className="text-blue-300">{soilMoisture.toFixed(1)}%</span>
                                 <span className="text-slate-400">环境评分:</span><span className="text-amber-400 font-bold">{isAnomalous ? '82' : '96'}分</span>
                               </div>
                               {isAnomalous && (
                                 <div className="mt-1 pt-1 border-t border-rose-900/50 text-[9px] text-rose-400 flex items-center justify-between">
                                   <span>⚠️ {anomalyReason}</span>
                                   <span className="bg-rose-500/20 px-1 rounded animate-pulse">处理</span>
                                 </div>
                               )}
                             </div>
                             <div className="w-8 h-8 rounded-full bg-cyan-500/20 backdrop-blur-md border border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.3)] flex items-center justify-center text-cyan-300 hover:scale-125 hover:bg-cyan-500/40 active:scale-95 transition-all animate-bounce">
                               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                             </div>
                           </button>
                        </Html>
                      )}

                      {/* 3D Holographic bill boarding HUD integrated into the canvas */}
                      {isSelected && show3dHud && (
                        <Html position={[0, 5.8, 3]} center>
                           <div className="relative p-5 bg-slate-950/70 backdrop-blur-3xl rounded-2xl border border-cyan-400/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] pointer-events-auto min-w-[300px] flex flex-col gap-3 font-mono overflow-hidden group/hud">
                              {/* Dynamic scanning line */}
                              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent opacity-0 group-hover/hud:opacity-100 animate-[pulse_2s_ease-in-out_infinite] pointer-events-none z-0"></div>
                              
                              {/* Tech decorative corners */}
                              <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-2xl opacity-80 z-10"></div>
                              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-cyan-400/60 rounded-br-2xl opacity-80 z-10"></div>
                              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400/30 rounded-tr-2xl opacity-50 z-10"></div>
                              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400/30 rounded-bl-2xl opacity-50 z-10"></div>
                              
                              <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2 mb-1 z-20 relative">
                                 <div className="flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 shadow-[0_0_10px_#22d3ee]"></span>
                                    </span>
                                    <span className="text-[13px] text-cyan-300 font-black tracking-[0.2em] uppercase drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">{plot.name} / 实时测控</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <div className="flex gap-1 mr-1">
                                     <span className="w-1 h-3 bg-cyan-500/80 animate-[pulse_1s_infinite_100ms] rounded-full"></span>
                                     <span className="w-1 h-3 bg-cyan-500/80 animate-[pulse_1s_infinite_200ms] rounded-full"></span>
                                     <span className="w-1 h-3 bg-cyan-500/80 animate-[pulse_1s_infinite_300ms] rounded-full"></span>
                                   </div>
                                   <button
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setShow3dHud(false);
                                     }}
                                     className="text-slate-400 hover:text-cyan-300 text-sm font-black focus:outline-none ml-2 w-6 h-6 flex items-center justify-center hover:bg-cyan-900/40 rounded-full transition-all cursor-pointer backdrop-blur-md"
                                     title="收起3D弹窗"
                                   >
                                     ✖
                                   </button>
                                 </div>
                              </div>
                              
                              {/* IoT Sensor Battery / Signal Critical Warnings */}
                              {(batteryVal < 20 || signalVal < 25) && (
                                <div className="bg-rose-950/80 border border-rose-500/40 p-3 rounded-xl flex items-center gap-2.5 animate-[pulse_2s_infinite] shadow-[0_0_15px_rgba(244,63,94,0.15)] z-20 relative mb-2">
                                  <span className="text-rose-500 text-sm animate-bounce">⚠️</span>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider">传感器异常警报</span>
                                    <span className="text-[9px] text-rose-400/90 font-sans leading-tight">
                                      {batteryVal < 20 && `🔋 IoT节点电量极低 (${batteryVal}%) `}
                                      {batteryVal < 20 && signalVal < 25 && " | "}
                                      {signalVal < 25 && `📡 信号强度弱 (${signalVal}%) `}
                                      建议尽快维护。
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-col gap-2 text-[11px] text-slate-300 font-sans z-20 relative">
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-cyan-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-cyan-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">🌡️</span> 
                                      空气温度
                                    </span>
                                    <span className="text-white font-black text-xs tabular-nums tracking-wider">{tempVal.toFixed(1)} <span className="text-cyan-500 text-[10px] ml-0.5">℃</span></span>
                                 </div>
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-blue-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-blue-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">💧</span> 
                                      空气湿度
                                    </span>
                                    <span className="text-white font-black text-xs tabular-nums tracking-wider">{humVal.toFixed(1)} <span className="text-blue-400 text-[10px] ml-0.5">%</span></span>
                                 </div>
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-emerald-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-emerald-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">☁️</span> 
                                      二氧化碳
                                    </span>
                                    <span className="text-emerald-400 font-black text-xs tabular-nums tracking-wider">{co2Val.toFixed(0)} <span className="text-emerald-500 text-[10px] ml-0.5">PPM</span></span>
                                 </div>
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-yellow-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-yellow-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">☀️</span> 
                                      光照强度
                                    </span>
                                    <span className="text-yellow-400 font-black text-xs tabular-nums tracking-wider">{luxVal.toFixed(0)} <span className="text-yellow-500 text-[10px] ml-0.5">LUX</span></span>
                                 </div>
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-cyan-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-cyan-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">📡</span> 
                                      网络与传感器状态
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 ${batteryVal < 20 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse font-black shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-emerald-400 border border-emerald-500/20'}`}>
                                        🔋 {batteryVal}% {batteryVal < 20 ? '极低' : '正常'}
                                      </span>
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 ${signalVal < 25 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse font-black shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-cyan-400 border border-cyan-500/20'}`}>
                                        📶 {signalVal}% {signalVal < 25 ? '微弱' : '极佳'}
                                      </span>
                                    </div>
                                 </div>
                                 <div className="group/item flex justify-between items-center bg-slate-900/40 hover:bg-slate-800/60 transition-colors border border-transparent hover:border-indigo-500/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span className="text-slate-400 font-mono tracking-wider flex items-center gap-2">
                                      <span className="text-indigo-500 opacity-70 group-hover/item:opacity-100 group-hover/item:animate-pulse">🌱</span> 
                                      土壤养分(NPK)
                                    </span>
                                    <span className="text-indigo-400 font-black text-[10px] tabular-nums tracking-wider">
                                      <span className="inline-block animate-[pulse_3s_ease-in-out_infinite_100ms]">{nVal.toFixed(0)}</span> / 
                                      <span className="inline-block animate-[pulse_3s_ease-in-out_infinite_400ms] mx-0.5">{pVal.toFixed(0)}</span> / 
                                      <span className="inline-block animate-[pulse_3s_ease-in-out_infinite_700ms]">{kVal.toFixed(0)}</span> 
                                      <span className="text-indigo-500/70 text-[9px] ml-1">mg/kg</span>
                                    </span>
                                 </div>
                              </div>

                              {/* AI ROI Insights Highlight in 3D HUD */}
                              {aiResult && aiResult.roiAnalysis && (
                                <div className="mt-2 pt-3 border-t border-cyan-500/20 z-20 relative">
                                  <h4 className="font-mono text-[10px] text-emerald-400 mb-2.5 uppercase tracking-widest flex items-center gap-2 font-bold bg-emerald-500/10 w-max px-2 py-1 rounded-md border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                                    AI 生态效益分析引擎
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-gradient-to-br from-emerald-950/50 to-emerald-900/20 border border-emerald-900/50 hover:border-emerald-500/40 transition-colors rounded-xl p-2.5 flex flex-col gap-1.5 backdrop-blur-sm relative overflow-hidden group/card">
                                      <div className="absolute inset-0 bg-emerald-400/5 opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                                      <span className="text-emerald-500/80 text-[9px] uppercase tracking-wider font-bold">优良作物推荐</span>
                                      <span className="font-black text-emerald-300 font-mono text-xs tracking-wider drop-shadow-[0_0_2px_rgba(110,231,183,0.8)]">{aiResult.recommendedCrop}</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-amber-950/50 to-amber-900/20 border border-amber-900/50 hover:border-amber-500/40 transition-colors rounded-xl p-2.5 flex flex-col gap-1.5 backdrop-blur-sm relative overflow-hidden group/card">
                                      <div className="absolute inset-0 bg-amber-400/5 opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                                      <span className="text-amber-500/80 text-[9px] uppercase tracking-wider font-bold">预期综合利润</span>
                                      <span className="font-black text-amber-400 font-mono text-xs tracking-wider tabular-nums drop-shadow-[0_0_2px_rgba(251,191,36,0.8)]">¥{aiResult.expectedProfit.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex justify-between items-center bg-rose-950/20 border border-rose-900/30 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                                    <span className="text-[9px] text-rose-500/80 font-bold tracking-wider">区域竞优分析</span>
                                    <span className="font-black text-rose-400 font-mono text-[9px] drop-shadow-[0_0_3px_rgba(251,113,133,0.5)]">
                                      {aiResult.roiAnalysis.regionalAdvantage || '极低风险 +14% 优于均值'}
                                    </span>
                                  </div>
                                </div>
                              )}
                           </div>
                        </Html>
                      )}
                    </Float>
                  </group>
                )}
              </PlotLODAndCullingWrapper>
            );
          })}

          {qualitySettings.bloomEnabled && (
            <EffectComposer multisampling={0}>
              <Bloom luminanceThreshold={0.52} luminanceSmoothing={0.9} height={qualitySettings.bloomHeight} opacity={1.6} />
              {qualitySettings.chromaticAberration ? (
                <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.0016, 0.0016)} opacity={0.55} />
              ) : (
                <></>
              )}
            </EffectComposer>
          )}
          </QualityContext.Provider>
        </Canvas>
      )}

      {/* 框选聚合：画布外覆盖层捕获鼠标拖拽矩形（拦截 OrbitControls） */}
      {viewMode === 'micro' && boxSelectMode && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            selDragging.current = true;
            setBoxStats(null);
            setSelRect({ x0: x, y0: y, x1: x, y1: y });
          }}
          onPointerMove={(e) => {
            if (!selDragging.current) return;
            const r = e.currentTarget.getBoundingClientRect();
            setSelRect(prev => prev ? { ...prev, x1: e.clientX - r.left, y1: e.clientY - r.top } : prev);
          }}
          onPointerUp={() => {
            selDragging.current = false;
            setSelRect(prev => {
              if (prev && Math.abs(prev.x1 - prev.x0) > 8 && Math.abs(prev.y1 - prev.y0) > 8) {
                computeBoxStats(prev);
              }
              return prev;
            });
          }}
        >
          {selRect && (
            <div
              className="absolute border-2 border-emerald-400 bg-emerald-400/15 rounded-sm pointer-events-none"
              style={{
                left: Math.min(selRect.x0, selRect.x1),
                top: Math.min(selRect.y0, selRect.y1),
                width: Math.abs(selRect.x1 - selRect.x0),
                height: Math.abs(selRect.y1 - selRect.y0),
              }}
            />
          )}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-950/90 border border-emerald-500/40 rounded-xl text-[11px] text-emerald-300 font-mono pointer-events-none">
            🔲 框选模式：拖拽鼠标框选区域，松开即聚合统计 · 再次点击工具按钮退出
          </div>
        </div>
      )}

      {/* 框选聚合统计结果面板 */}
      {viewMode === 'micro' && boxSelectMode && boxStats && (
        <div className={`${dtSheet('absolute bottom-44 left-6 w-72 dt-panel')} bg-slate-950/90 backdrop-blur-xl border border-emerald-500/40 rounded-2xl p-4 flex flex-col gap-2.5 font-sans shadow-[0_0_40px_rgba(16,185,129,0.25)] z-40 pointer-events-auto`}>
          <div className="flex justify-between items-center border-b border-emerald-500/30 pb-2">
            <span className="text-xs font-bold text-emerald-300 tracking-[0.15em] uppercase">🔲 框选区域聚合</span>
            <button onClick={() => setBoxStats(null)} className="text-slate-500 hover:text-rose-400 transition-colors">✕</button>
          </div>
          {boxStats.error ? (
            <div className="text-[11px] text-amber-400 font-mono py-2">{boxStats.error}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[9px] text-slate-400">区域株数</div>
                  <div className="text-base text-emerald-400 font-bold font-mono">{boxStats.count} 株</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[9px] text-slate-400">平均株高</div>
                  <div className="text-base text-cyan-400 font-bold font-mono">{boxStats.avgHeight.toFixed(1)} cm</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[9px] text-slate-400">选区面积</div>
                  <div className="text-sm text-slate-200 font-bold font-mono">{boxStats.areaM2.toFixed(1)} m²</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[9px] text-slate-400">健康优良率</div>
                  <div className="text-sm text-emerald-400 font-bold font-mono">{boxStats.count ? ((boxStats.dist.healthy || 0) / boxStats.count * 100).toFixed(0) : 0}%</div>
                </div>
              </div>
              {/* 长势占比堆叠条 */}
              <div className="mt-1">
                <div className="text-[9px] text-slate-400 mb-1">长势状态占比</div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  {([['healthy', '#10b981'], ['nitrogen_deficient', '#a3e635'], ['drought', '#f59e0b'], ['pest', '#f43f5e']] as const).map(([k, c]) => {
                    const pct = boxStats.count ? (boxStats.dist[k] || 0) / boxStats.count * 100 : 0;
                    return <div key={k} style={{ width: `${pct}%`, background: c }} className="h-full" />;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[8.5px] text-slate-400 font-mono">
                  <span><span className="text-emerald-400">■</span> 健康 {boxStats.dist.healthy || 0}</span>
                  <span><span className="text-lime-400">■</span> 缺氮 {boxStats.dist.nitrogen_deficient || 0}</span>
                  <span><span className="text-amber-400">■</span> 缺水 {boxStats.dist.drought || 0}</span>
                  <span><span className="text-rose-400">■</span> 病虫 {boxStats.dist.pest || 0}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Futuristic Bottom Center Quick Plot Swapper Dock */}
      {viewMode === 'micro' && show3dHud && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center justify-center flex-col gap-3 dt-dock max-w-[96vw]">
          {/* Simulation Controls */}
          <div className="flex flex-col gap-3 max-w-[96vw]">
            <div className="px-5 py-2 bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl flex items-center gap-3.5 shadow-[0_0_35px_rgba(0,0,0,0.85)] justify-center max-w-[96vw] overflow-x-auto">
               <span className="text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase select-none whitespace-nowrap">生育期控制:</span>
               <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                 {[
                   { label: '苗期', val: 0.2 },
                   { label: '拔节', val: 0.5 },
                   { label: '抽穗', val: 0.8 },
                   { label: '成熟', val: 1.0 }
                 ].map(stage => (
                   <button
                     key={stage.label}
                     onClick={() => { setGrowthStage(stage.val); setShowCrop(true); }}
                     className={`px-3 py-1 rounded text-[10px] font-bold transition-all whitespace-nowrap ${growthStage === stage.val ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(8,145,178,0.5)]' : 'text-slate-400 hover:text-slate-200'}`}
                   >
                     {stage.label}
                   </button>
                 ))}
               </div>
            </div>

            <div className="px-5 py-2 bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl flex items-center gap-3.5 shadow-[0_0_35px_rgba(0,0,0,0.85)] max-w-[96vw] overflow-x-auto">
               <span className="text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase select-none whitespace-nowrap">农艺与环境模拟:</span>
               <button
                 onClick={() => setShowCrop(!showCrop)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   showCrop ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 🌱 播种/收割 (C)
               </button>
               <button
                 onClick={() => setIsRaining(!isRaining)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   isRaining ? 'bg-blue-500/20 border-blue-400 text-blue-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 🌧️ 降雨模拟 (R)
               </button>
               <button
                 onClick={() => setShowAnomalies(!showAnomalies)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   showAnomalies ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 🚨 病害透视 (G)
               </button>
               <div className="w-px h-5 bg-cyan-900/50 mx-1"></div>
               <button
                 onClick={() => setShowAggregation(!showAggregation)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   showAggregation ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 📊 空间聚合分析
               </button>
               <button
                 onClick={() => { setBoxSelectMode(v => !v); setSelRect(null); setBoxStats(null); }}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   boxSelectMode ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 🔲 框选区域统计
               </button>
               <div className="w-px h-5 bg-cyan-900/50 mx-1"></div>
               <button
                 onClick={() => { setShowAgroPanel(v => !v); setShowImportPanel(false); }}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   showAgroPanel ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 📐 行株距/密度
               </button>
               <button
                 onClick={() => { setShowImportPanel(v => !v); setShowAgroPanel(false); }}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                   showImportPanel ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                 }`}
               >
                 📥 JSON 批量导入
               </button>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl flex items-center gap-3.5 shadow-[0_0_35px_rgba(0,0,0,0.85)] max-w-[95vw] overflow-x-auto min-w-[325px]">
             <span className="text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase select-none whitespace-nowrap">智能模拟田:</span>
             <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectPlot('')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                    !activePlotId 
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  🗺️ 大田全局视图
                </button>
                {plots.map((plot) => {
                  const isActive = plot.id === activePlotId;
                  return (
                    <button
                      key={plot.id}
                      onClick={() => onSelectPlot(plot.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10.5px] font-sans font-semibold transition-all border cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        isActive 
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 outline-none shadow-[0_0_12px_rgba(6,182,212,0.3)] scale-[1.03]' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
                      <span>{plot.name}</span>
                      <span className="text-[8.5px] px-1 rounded bg-black/40 text-slate-400 font-mono font-medium">
                        {plot.crop}
                      </span>
                    </button>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      {/* Spatial Data Aggregation Panel */}
      {viewMode === 'micro' && showAggregation && (
        <div className={`${dtSheet('absolute top-24 right-6 w-80 dt-panel')} bg-slate-950/85 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-5 flex flex-col gap-4 font-sans shadow-[0_0_40px_rgba(16,185,129,0.3)] z-30 pointer-events-auto`}>
          <div className="flex justify-between items-center border-b border-emerald-500/30 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
              <span className="text-xs font-bold text-emerald-300 tracking-[0.2em] uppercase">大田微观全局聚合</span>
            </div>
            <button 
              onClick={() => setShowAggregation(false)}
              className="text-slate-500 hover:text-rose-400 transition-colors"
            >
              ✕
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 relative overflow-hidden">
              <div className="absolute inset-0 bg-emerald-500/10 animate-[pulse_2s_infinite]" />
              <div className="text-[10px] text-slate-400 font-bold mb-1 relative z-10">平均冠层高度</div>
              <div className="text-lg text-emerald-400 font-bold font-mono relative z-10">{(plots.reduce((acc, plot) => acc + interpolateMorphology(getCropProfile(plot.crop), growthStage).heightCm, 0) / Math.max(1, plots.length) / 100).toFixed(2)}m</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 relative overflow-hidden">
              <div className={`absolute inset-0 ${showAnomalies ? 'bg-rose-500/10 animate-[pulse_1s_infinite]' : 'bg-emerald-500/10'} transition-colors`} />
              <div className="text-[10px] text-slate-400 font-bold mb-1 relative z-10">健康优良占比</div>
              <div className={`text-lg font-bold font-mono relative z-10 ${showAnomalies ? 'text-rose-400' : 'text-emerald-400'}`}>{showAnomalies ? '42.5%' : (isRaining ? '96.2%' : '92.4%')}</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-bold mb-1">平均土壤墒情 (0-20cm)</div>
              <div className="text-lg text-blue-300 font-bold font-mono">{isRaining ? '82.5%' : '62.4%'}</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-bold mb-1">病虫害分布热点数</div>
              <div className={`text-lg font-bold font-mono ${showAnomalies ? 'text-rose-400' : 'text-slate-300'}`}>{showAnomalies ? '348' : '0'} 株</div>
            </div>
          </div>

          {/* 产量预估模型（穗部参数 × 实际密度 × 长势折减） */}
          {(() => {
            const prof = getCropProfile(currentPlot?.crop);
            const healthyRatio = showAnomalies ? 0.62 : (isRaining ? 0.96 : 0.92);
            const yieldPerMu = estimateYieldKgPerMu(prof, agroConfig.rowSpacingCm, agroConfig.plantSpacingCm, healthyRatio);
            const totalMu = (currentPlot?.area ?? 240) / 666.67 * 10; // area(m²)→亩 的演示换算
            if (!prof.ear || growthStage < prof.ear.headingProgress) {
              return (
                <div className="bg-slate-900/60 p-3 rounded-lg border border-amber-500/20 mt-1 text-[10px] text-slate-400">
                  📦 产量预估：抽穗期后(生育期≥抽穗)依据穗部参数实时测算
                </div>
              );
            }
            return (
              <div className="bg-gradient-to-br from-amber-950/40 to-slate-900/60 p-3 rounded-lg border border-amber-500/30 mt-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-amber-300 font-bold">📦 理论产量预估（{prof.cropName}）</span>
                  <span className="text-[8px] text-slate-500 font-mono">穗粒{prof.ear.grainsPerEar}·千粒重{prof.ear.thousandGrainWeightG}g</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-lg text-amber-400 font-bold font-mono">{yieldPerMu.toFixed(0)} <span className="text-[10px] text-amber-500/80">kg/亩</span></span>
                  <span className="text-[10px] text-slate-400 font-mono">全区约 {(yieldPerMu * totalMu / 1000).toFixed(2)} t</span>
                </div>
                <div className="text-[8px] text-slate-500 mt-1">= 亩株数 × {prof.ear.earsPerPlant}穗/株 × {prof.ear.grainsPerEar}粒/穗 × 千粒重 × 长势系数{healthyRatio.toFixed(2)}</div>
              </div>
            );
          })()}

          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 mt-1">
            <div className="text-[10px] text-slate-400 font-bold mb-2">综合生长态势模型 (LOD聚合)</div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: '60%' }}></div>
              <div className="h-full bg-blue-500" style={{ width: '25%' }}></div>
              <div className="h-full bg-rose-500" style={{ width: '15%' }}></div>
            </div>
            <div className="flex justify-between mt-1 text-[8px] text-slate-500">
              <span>旺盛 (60%)</span>
              <span>平稳 (25%)</span>
              <span>异常 (15%)</span>
            </div>
          </div>
        </div>
      )}

      {/* 农艺参数全局调控面板（行距/株距/密度）—— 数字孪生虚实映射核心可调项 */}
      {viewMode === 'micro' && showAgroPanel && (() => {
        const prof = getCropProfile(currentPlot?.crop);
        const renderSlider = (label: string, value: number, min: number, max: number, step: number, unit: string, std: string | number, range: number[], onChange: (v: number) => void) => (
          <div key={label} className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] text-slate-400 font-bold">{label}</span>
              <span className="text-cyan-300 font-mono font-bold text-xs">{value}{unit}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer" />
            <div className="flex justify-between mt-1 text-[8px] text-slate-500 font-mono">
              <span>农艺标准: {std}{unit}</span>
              <span>适宜区间 {range[0]}–{range[1]}{unit}</span>
            </div>
          </div>
        );
        return (
          <div className={`${dtSheet('absolute top-24 left-1/2 -translate-x-1/2 w-[340px] dt-panel max-h-[82vh] overflow-y-auto')} bg-slate-950/90 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-5 flex flex-col gap-3 font-sans shadow-[0_0_40px_rgba(6,182,212,0.25)] z-30 pointer-events-auto scrollbar-thin scrollbar-thumb-slate-800`}>
            <div className="flex justify-between items-center border-b border-cyan-500/30 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
                <span className="text-xs font-bold text-cyan-300 tracking-[0.15em] uppercase">种植农艺参数调控</span>
              </div>
              <button onClick={() => setShowAgroPanel(false)} className="text-slate-500 hover:text-rose-400 transition-colors">✕</button>
            </div>
            <div className="text-[9px] text-slate-400 font-mono -mt-1">当前作物：<span className="text-cyan-300">{prof.cropName} · {prof.variety}</span> ｜ 场景标定 1 单位 = 1 m</div>

            <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold mt-1">▍种植规格（行列）</span>
            {renderSlider('行距 (Row Spacing)', agroConfig.rowSpacingCm, prof.rowSpacingRangeCm[0], prof.rowSpacingRangeCm[1], 1, 'cm', prof.stdRowSpacingCm, prof.rowSpacingRangeCm, (v) => setAgroConfig(c => ({ ...c, rowSpacingCm: v })))}
            {renderSlider('株距 (Plant Spacing)', agroConfig.plantSpacingCm, prof.plantSpacingRangeCm[0], prof.plantSpacingRangeCm[1], 0.5, 'cm', prof.stdPlantSpacingCm, prof.plantSpacingRangeCm, (v) => setAgroConfig(c => ({ ...c, plantSpacingCm: v })))}
            {renderSlider('密度系数 (Density)', agroConfig.densityFactor, 0.5, 1.5, 0.05, '×', '1.0', [0.5, 1.5], (v) => setAgroConfig(c => ({ ...c, densityFactor: v })))}

            <span className="text-[9px] text-amber-400 uppercase tracking-widest font-bold mt-1">▍垄沟规格（程序化地形）</span>
            {renderSlider('垄距 (Ridge Spacing)', agroConfig.ridgeSpacingCm, 40, 250, 5, 'cm', prof.ridge.spacingCm, [40, 250], (v) => setAgroConfig(c => ({ ...c, ridgeSpacingCm: v })))}
            {renderSlider('垄高 (Ridge Height)', agroConfig.ridgeHeightCm, 5, 35, 1, 'cm', prof.ridge.heightCm, [5, 35], (v) => setAgroConfig(c => ({ ...c, ridgeHeightCm: v })))}
            {renderSlider('垄宽 (Ridge Width)', agroConfig.ridgeWidthCm, 20, 130, 5, 'cm', prof.ridge.widthCm, [20, 130], (v) => setAgroConfig(c => ({ ...c, ridgeWidthCm: v })))}

            <span className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold mt-1">▍风场（着色器实时，零 CPU 开销）</span>
            {renderSlider('风力 (Wind Speed)', windSpeed, 0, 3, 0.1, '级', '微风 1.0', [0, 3], setWindSpeed)}
            {renderSlider('风向 (Wind Direction)', windDirDeg, 0, 360, 5, '°', '东北 45', [0, 360], setWindDirDeg)}
            {(() => {
              // 倒伏风险：风力越过阈值即上升，抽穗/灌浆后植株高、风险更高（业务化解读）
              const risk = Math.max(0, Math.min(100, (windSpeed - 1.8) * 60 + growthStage * 22));
              const level = risk < 25 ? { t: '低', c: 'text-emerald-400', b: 'border-emerald-500/40' } : risk < 60 ? { t: '中', c: 'text-amber-400', b: 'border-amber-500/40' } : { t: '高', c: 'text-rose-400', b: 'border-rose-500/40' };
              return (
                <div className={`bg-slate-900/60 px-3 py-2 rounded-lg border ${level.b} flex items-center justify-between`}>
                  <span className="text-[10px] text-slate-400 font-bold">🌾 倒伏风险预警</span>
                  <span className={`font-mono font-bold text-xs ${level.c}`}>{level.t}风险 · {risk.toFixed(0)}%</span>
                </div>
              );
            })()}

            <span className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold mt-1">▍可复现性（确定性种子）</span>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold">参数种子 SEED</span>
                <span className="text-indigo-300 font-mono font-bold text-xs">{agroConfig.seed}</span>
              </div>
              <button
                onClick={() => setAgroConfig(c => ({ ...c, seed: Math.floor(Math.random() * 1e9) }))}
                className="px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] text-indigo-300 font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                🎲 新种子
              </button>
            </div>

            <button
              onClick={() => setAgroConfig(c => ({ ...c, rowSpacingCm: prof.stdRowSpacingCm, plantSpacingCm: prof.stdPlantSpacingCm, densityFactor: 1.0, ridgeSpacingCm: prof.ridge.spacingCm, ridgeHeightCm: prof.ridge.heightCm, ridgeWidthCm: prof.ridge.widthCm }))}
              className="mt-1 px-3 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] text-cyan-300 font-bold transition-all cursor-pointer"
            >
              ↺ 一键切换为 {prof.cropName} 标准种植规格
            </button>
            <div className="text-[8.5px] text-slate-500 leading-relaxed font-mono bg-slate-900/50 rounded-lg p-2 border border-slate-800/60">
              行株距/垄沟即时重排（代表性采样，单地块 ≥1000 株、绘制调用恒为 2 批）；相同种子+参数生成完全一致的田块形态，结果可复现可验证。
            </div>
          </div>
        );
      })()}

      {/* JSON / 接口 批量数据导入面板（数据闭环：一键刷新全田块微观状态） */}
      {viewMode === 'micro' && showImportPanel && (
        <div className={`${dtSheet('absolute top-24 left-1/2 -translate-x-1/2 w-[400px] dt-panel')} bg-slate-950/92 backdrop-blur-xl border border-indigo-500/40 rounded-2xl p-5 flex flex-col gap-3 font-sans shadow-[0_0_40px_rgba(99,102,241,0.25)] z-30 pointer-events-auto`}>
          <div className="flex justify-between items-center border-b border-indigo-500/30 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded bg-indigo-400 animate-pulse shadow-[0_0_10px_#818cf8]" />
              <span className="text-xs font-bold text-indigo-300 tracking-[0.15em] uppercase">生长 / 墒情数据批量导入</span>
            </div>
            <button onClick={() => setShowImportPanel(false)} className="text-slate-500 hover:text-rose-400 transition-colors">✕</button>
          </div>
          <div className="text-[9px] text-slate-400 font-mono -mt-1">
            支持平台接口 / 文件 JSON 注入：<span className="text-indigo-300">globalGrowthStage</span> + 各田块 <span className="text-indigo-300">soilMoisture / dominantStatus</span>，一键映射到三维微观孪生体。
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "globalGrowthStage": "抽穗", "plots": [ { "plotId": "plot_001", "soilMoisture": 38.5, "dominantStatus": "drought" } ] }'
            spellCheck={false}
            className="w-full h-44 bg-black/50 border border-slate-700/60 rounded-lg p-2.5 text-[10px] font-mono text-slate-200 resize-none focus:outline-none focus:border-indigo-400/70 leading-relaxed"
          />
          {importStatus && (
            <div className={`text-[10px] font-mono px-2.5 py-1.5 rounded-lg border ${importStatus.ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/10 border-rose-500/40 text-rose-300'}`}>
              {importStatus.ok ? '✓ ' : '✕ '}{importStatus.msg}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={buildSampleImport}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 font-bold transition-all cursor-pointer">
              📄 载入示例数据
            </button>
            <button onClick={applyImport}
              className="flex-1 px-3 py-2 rounded-xl border border-indigo-500/50 bg-indigo-500/15 hover:bg-indigo-500/30 text-[11px] text-indigo-200 font-bold transition-all cursor-pointer">
              ⚡ 一键刷新全田块
            </button>
          </div>
          {Object.keys(importedData).length > 0 && (
            <button onClick={() => { setImportedData({}); setImportStatus({ ok: true, msg: '已清除导入覆盖，恢复实时数据' }); }}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-[10px] text-slate-400 transition-all cursor-pointer">
              清除导入覆盖（{Object.keys(importedData).length} 个田块）
            </button>
          )}
        </div>
      )}

      {/* Futuristic Holographic Control Center LHS Overlay (Collapsible) */}
      {viewMode === 'micro' && (
        <div className="pointer-events-auto z-20">
          {lhsCollapsed ? (
            <div className="absolute top-24 left-6">
              <button 
                onClick={() => setLhsCollapsed(false)}
                className="px-4 py-3 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] text-cyan-400 text-xs font-sans font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <span>⚡ 展开主控制面板</span>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded">▶</span>
              </button>
            </div>
          ) : (
            <div className={`${dtSheet('absolute top-24 left-6 w-80 dt-panel max-h-[81vh] overflow-y-auto')} bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 flex flex-col gap-4 font-sans shadow-[0_0_40px_rgba(0,0,0,0.85)] scrollbar-thin scrollbar-thumb-slate-800`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
                  <span className="text-xs font-bold text-slate-200 tracking-[0.2em] uppercase">物联网控制终端</span>
                </div>
                <button 
                  onClick={() => setLhsCollapsed(true)}
                  className="text-slate-500 hover:text-cyan-400 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                  title="收起控制面板"
                >
                  <span>收起</span>
                  <span>◀</span>
                </button>
              </div>
              
              <div className="border-t border-slate-800/80 my-0.5" />

              {/* 智能模拟田多地块三维切换 */}
              <div>
                <span className="text-[9px] text-cyan-400 uppercase tracking-widest block mb-1.5 font-bold">🌾 智能模拟田三维切换</span>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => onSelectPlot('')}
                    className={`px-3 py-2 rounded-xl border text-[11px] text-left transition-all font-semibold flex items-center justify-between font-sans cursor-pointer ${
                      !activePlotId 
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] font-bold scale-[1.02]' 
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${!activePlotId ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span>🗺️ 大田全局视图</span>
                    </div>
                  </button>
                  {plots.map((plot) => {
                    const isActive = plot.id === activePlotId;
                    return (
                      <button
                        key={plot.id}
                        onClick={() => onSelectPlot(plot.id)}
                        className={`px-3 py-2 rounded-xl border text-[11px] text-left transition-all font-semibold flex items-center justify-between font-sans cursor-pointer ${
                          isActive 
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] font-bold scale-[1.02]' 
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span>{plot.name}</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-black/40 text-slate-400 font-mono font-medium">
                          {plot.crop}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3D Label HUD visible toggle */}
              <div>
                <button 
                  onClick={() => setShow3dHud(prev => !prev)}
                  className={`w-full px-3 py-2 rounded-xl border text-[11px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${show3dHud ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                >
                  <span>📋 3D标签/悬浮弹窗 HUD</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono font-bold">
                    {show3dHud ? '已开启' : '已隐藏'}
                  </span>
                </button>
              </div>

              {/* 农机作业路径标注图层 Toggle */}
              <div>
                <button 
                  onClick={() => setShowMachineryPath(prev => !prev)}
                  className={`w-full px-3 py-2 rounded-xl border text-[11px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${showMachineryPath ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🚜 农机作业覆盖路径</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono font-bold">
                    {showMachineryPath ? '已开启' : '已隐藏'}
                  </span>
                </button>
              </div>

              {/* 自适应画质档位选择器 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">🎚️ 自适应画质 (按设备性能)</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono font-bold text-emerald-300">
                    {qualityMode === 'auto' ? `自动 · ${QUALITY_LABEL[effectiveTier]}` : QUALITY_LABEL[effectiveTier]}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {([
                    { id: 'auto', label: '自动' },
                    { id: 'ultra', label: '极致' },
                    { id: 'high', label: '高' },
                    { id: 'medium', label: '中' },
                    { id: 'low', label: '低' },
                  ] as { id: QualityMode; label: string }[]).map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQualityMode(q.id)}
                      className={`px-1 py-1.5 rounded-lg border text-[10px] transition-all font-semibold cursor-pointer ${qualityMode === q.id ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="text-[8.5px] text-slate-500 mt-1 leading-relaxed">
                  自动模式按帧率实时升降档以保证流畅；高性能设备可手动锁定「极致」获得最佳画质。
                </p>
              </div>

              {/* 性能诊断 HUD visible toggle */}
              <div>
                <button
                  onClick={() => setShowPerfPanel(prev => !prev)}
                  className={`w-full px-3 py-2 rounded-xl border text-[11px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${showPerfPanel ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                >
                  <span>📊 实时渲染性能 HUD</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono font-bold">
                    {showPerfPanel ? '已开启' : '已隐藏'}
                  </span>
                </button>
              </div>

              {/* GSAP Cinematic Rail Sequence Selector representing 5D flight presets */}
              <div>
                <span className="text-[9px] text-cyan-400 uppercase tracking-widest block mb-1.5 font-bold">5D 电影级姿态轨道 (GSAP-CAM)</span>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => { setIsCruising(false); setCameraPreset('overview'); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'overview' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span>🗺️ 大田全局</span>
                    <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded font-mono font-medium">机位 0</span>
                  </button>
                  <button 
                    onClick={() => { setIsCruising(false); setCameraPreset('canopy'); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'canopy' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span>🌾 麦浪微距</span>
                    <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded font-mono font-medium">机位 1</span>
                  </button>
                  <button 
                    onClick={() => { setIsCruising(false); setCameraPreset('subsoil'); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'subsoil' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span>🔬 土层剖面</span>
                    <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded font-mono font-medium">机位 2</span>
                  </button>
                  <button 
                    onClick={() => { setIsCruising(false); setCameraPreset('sensor'); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'sensor' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span>📡 传感网关</span>
                    <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded font-mono font-medium">机位 3</span>
                  </button>
                  <button 
                    onClick={() => { setIsCruising(false); setCameraPreset('actuator'); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] text-left transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'actuator' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span>🔩 喷灌执行</span>
                    <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded font-mono font-medium">机位 4</span>
                  </button>
                  <button 
                    onClick={() => setIsCruising(!isCruising)}
                    className={`col-span-2 px-2.5 py-2 rounded-lg border text-[10px] text-center transition-all active:scale-95 font-bold flex items-center justify-center gap-2 cursor-pointer ${isCruising ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-600'}`}
                  >
                    <span>{isCruising ? '⏹️ 停止巡航' : '▶️ 自动巡航 (俯瞰->重点->微观)'}</span>
                    {isCruising && <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />}
                  </button>
                </div>
              </div>

              {/* 室外/室内环境参数 */}
              <div>
                <span className="text-[9px] text-cyan-400 uppercase tracking-widest block mb-1.5 font-bold">📡 环境数据实时采集节点</span>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                    <div className="bg-slate-900/60 p-2 rounded-lg flex flex-col gap-1 border border-slate-800"><span className="text-[9px] text-slate-500">室外温度</span><span className="text-emerald-400 font-mono font-bold">24.5 °C</span></div>
                    <div className="bg-slate-900/60 p-2 rounded-lg flex flex-col gap-1 border border-slate-800"><span className="text-[9px] text-slate-500">室外湿度</span><span className="text-emerald-400 font-mono font-bold">60.0 %</span></div>
                    <div className="bg-slate-900/60 p-2 rounded-lg flex flex-col gap-1 border border-slate-800"><span className="text-[9px] text-slate-500">室内温度</span><span className="text-cyan-400 font-mono font-bold">26.2 °C</span></div>
                    <div className="bg-slate-900/60 p-2 rounded-lg flex flex-col gap-1 border border-slate-800"><span className="text-[9px] text-slate-500">室内湿度</span><span className="text-cyan-400 font-mono font-bold">65.0 %</span></div>
                </div>
              </div>

              {/* 自动化农机作业监控 Panel (LHS) */}
              {showMachineryPath && (
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-emerald-500/20 text-slate-300 flex flex-col gap-2">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 mb-1">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">🚜 自动化农机实时监控</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">机载终端编号:</span>
                      <span className="font-mono font-bold text-slate-300">RTK-TRACTOR-300B</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">高精度差分状态:</span>
                      <span className="text-cyan-400 font-bold">厘米级载波相位双频定位</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">全区当日综合覆盖率:</span>
                      <span className="text-emerald-400 font-bold font-mono">87.5%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden my-1">
                      <div className="h-full bg-emerald-500 rounded-full animate-[pulse_1.5s_infinite]" style={{ width: '87.5%' }}></div>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 leading-tight">
                      <span>* 农机设备正在按网格自动巡航作业，实时同步覆膜、割草与精准施肥覆盖轨迹。</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI 关联模块跳转 */}
              <div>
                <span className="text-[9px] text-cyan-400 uppercase tracking-widest block mb-1.5 font-bold">🧠 AI 中枢模块联动</span>
                <button
                  onClick={() => {
                    // 退出孪生(appMode='data')并切到地块管理；FieldManagement 仅在该 Tab 激活时挂载，
                    // 故用全局标志位传意图（挂载即生效，避免事件早于挂载被丢弃），并同时派发 list 事件兜底已挂载的情形
                    (window as any).__jumpToAiRoi = true;
                    window.dispatchEvent(new CustomEvent('setAppMode', { detail: 'data' }));
                    window.dispatchEvent(new CustomEvent('navigateTab', { detail: 'management' }));
                    setTimeout(() => window.dispatchEvent(new CustomEvent('set-view-mode-list')), 600);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 text-[11px] text-indigo-300 transition-all font-bold flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5"><span>🔗</span> 跳转至 AI 智能种植与 ROI 核算模块</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono">前往分析</span>
                </button>
              </div>

              {/* 智能联防执行机器控制 */}
              <div className={readOnly ? 'hidden' : undefined}>
                <span className="text-[9px] text-cyan-400 uppercase tracking-widest block mb-1.5 font-bold">⚙️ 智能联防核心设备控制</span>
                <div className="flex flex-col gap-2 font-sans">
                  {/* Irrigation Control */}
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-300 text-[11px] font-bold">高压智能旋转喷灌系统</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${processingDevice === 'irrigation' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : hardwareStatus.irrigation ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        {processingDevice === 'irrigation' ? '🔄 执行中...' : hardwareStatus.irrigation ? '正在极速喷灌' : '已断开'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (!hardwareStatus.irrigation) handleControlHardware('irrigation'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${hardwareStatus.irrigation ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'irrigation' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        开
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (hardwareStatus.irrigation) handleControlHardware('irrigation'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${!hardwareStatus.irrigation ? 'bg-rose-600 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'irrigation' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        关
                      </button>
                    </div>
                  </div>

                  {/* Ventilation Control */}
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-300 text-[11px] font-bold">工业负压换气风机</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${processingDevice === 'ventilation' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : hardwareStatus.ventilation ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                        {processingDevice === 'ventilation' ? '🔄 执行中...' : hardwareStatus.ventilation ? '正在通风换气' : '已断开'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (!hardwareStatus.ventilation) handleControlHardware('ventilation'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${hardwareStatus.ventilation ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(5,150,105,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'ventilation' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        开
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (hardwareStatus.ventilation) handleControlHardware('ventilation'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${!hardwareStatus.ventilation ? 'bg-rose-600 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'ventilation' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        关
                      </button>
                    </div>
                  </div>

                  {/* Lighting Control */}
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-300 text-[11px] font-bold">补光调温光谱照灯</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${processingDevice === 'lighting' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : hardwareStatus.lighting ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                        {processingDevice === 'lighting' ? '🔄 执行中...' : hardwareStatus.lighting ? '光谱调温补光' : '已断开'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (!hardwareStatus.lighting) handleControlHardware('lighting'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${hardwareStatus.lighting ? 'bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'lighting' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        开
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); if (hardwareStatus.lighting) handleControlHardware('lighting'); }}
                        className={`px-2 py-1.5 rounded-md text-[10px] transition-all active:scale-95 cursor-pointer font-bold flex justify-center items-center gap-1 ${!hardwareStatus.lighting ? 'bg-rose-600 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'} ${processingDevice === 'lighting' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        关
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      if (processingDevice) return;
                      setProcessingDevice('fertilize');
                      setTimeout(() => {
                        onFertilize();
                        setProcessingDevice(null);
                      }, 1000);
                    }}
                    className={`px-3.5 py-2.5 mt-1 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 active:scale-95 border border-emerald-400/30 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-between transition-all cursor-pointer text-[11px] font-semibold ${processingDevice === 'fertilize' ? 'opacity-70 pointer-events-none' : ''}`}
                  >
                    <span>{processingDevice === 'fertilize' ? '🔄 正在生成并下发处方...' : '一键下发精准水肥处方'}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-sans font-semibold">{processingDevice === 'fertilize' ? '下发中' : '生成配方任务'}</span>
                  </button>
                </div>
              </div>

              {/* 三维系统诊断日志数据 */}
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/50 text-[9.5px] text-slate-400 flex flex-col gap-1.5 font-sans select-none">
                <div className="flex justify-between items-center">
                  <span>三维渲染性能帧率:</span>
                  <span className={`font-bold font-mono ${perfMetrics.fps >= 55 ? 'text-emerald-400' : perfMetrics.fps >= 30 ? 'text-yellow-400' : 'text-rose-500'}`}>
                    {perfMetrics.fps.toFixed(1)} FPS {perfMetrics.fps >= 55 ? '极佳' : '波动'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>视锥裁剪后多边形:</span>
                  <span className="text-cyan-400 font-bold font-mono">
                    {perfMetrics.triangles.toLocaleString()} 面
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>5G RTK巡检无人机状态:</span>
                  <span className="text-yellow-400 font-bold font-mono">自主悬停监测中</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3D Realtime Performance Monitoring Panel (Floating Card) */}
      {/* 性能 HUD 已隐藏时的常驻重开按钮（不依赖可折叠的主控制面板） */}
      {viewMode === 'micro' && !showPerfPanel && !isImmersive && !isMobile && (
        <button
          onClick={() => setShowPerfPanel(true)}
          className="absolute top-[140px] right-6 z-30 pointer-events-auto px-3 py-2 rounded-xl bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold shadow-[0_0_20px_rgba(6,182,212,0.18)] hover:bg-slate-900/90 hover:border-cyan-400/60 transition-all flex items-center gap-1.5 cursor-pointer"
          title="显示性能 HUD"
        >
          📊 性能 HUD
        </button>
      )}

      {viewMode === 'micro' && showPerfPanel && !isImmersive && (
        <div className={`${dtSheet('absolute top-[140px] right-6')} z-30 pointer-events-auto`}>
          <div className="w-full sm:w-72 bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 flex flex-col gap-3 shadow-[0_0_30px_rgba(6,182,212,0.15)] relative overflow-hidden group/perf select-none font-sans">
            {/* Tech decorative background elements */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none rounded-bl-full" />
            <div className="absolute -bottom-6 -left-6 w-12 h-12 border border-cyan-500/10 rounded-full pointer-events-none" />

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                <span className="text-[10px] font-bold text-slate-200 tracking-widest uppercase">ENGINE PERFORMANCE</span>
              </div>
              <button 
                onClick={() => setShowPerfPanel(false)}
                className="text-slate-500 hover:text-cyan-400 transition-colors p-1 rounded hover:bg-slate-900 border border-transparent hover:border-slate-800 font-mono text-[9px] cursor-pointer"
                title="隐藏面板"
              >
                ✕
              </button>
            </div>

            <div className="border-t border-slate-800/80 my-0.5" />

            {/* FPS and Triangle metrics Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-2.5 flex flex-col gap-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">渲染帧率 (FPS)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className={`font-black font-mono text-xl tracking-tight ${
                    perfMetrics.fps >= 55 ? 'text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.4)]' :
                    perfMetrics.fps >= 30 ? 'text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]' :
                    'text-rose-500 drop-shadow-[0_0_3px_rgba(244,63,94,0.4)]'
                  }`}>
                    {perfMetrics.fps}
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono">FPS</span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-2.5 flex flex-col gap-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">视锥裁剪后多边形</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-black font-mono text-xl tracking-tight text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.4)]">
                    {perfMetrics.triangles >= 1000 
                      ? `${(perfMetrics.triangles / 1000).toFixed(1)}k` 
                      : perfMetrics.triangles}
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono">面</span>
                </div>
              </div>
            </div>

            {/* Sparkline FPS Trend Chart using SVG */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-center text-[8px] font-mono text-slate-500">
                <span>实时帧率波动趋势</span>
                <span>{perfMetrics.fps} FPS</span>
              </div>
              <div className="h-10 bg-black/40 border border-slate-800/50 rounded-xl overflow-hidden px-1 py-1">
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="fpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  
                  {/* Fill Area */}
                  <path
                    d={`M 0,20 ${fpsHistory.map((val, idx) => {
                      const x = (idx / (fpsHistory.length - 1)) * 100;
                      const y = 18 - (Math.min(val, 60) / 60) * 16;
                      return `L ${x},${y}`;
                    }).join(' ')} L 100,20 Z`}
                    fill="url(#fpsGrad)"
                  />

                  {/* Line */}
                  <path
                    d={fpsHistory.map((val, idx) => {
                      const x = (idx / (fpsHistory.length - 1)) * 100;
                      const y = 18 - (Math.min(val, 60) / 60) * 16;
                      return `${idx === 0 ? 'M' : 'L'} ${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Additional diagnostics metrics */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/50 text-[9px] text-slate-400 flex flex-col gap-1.5 font-mono">
              <div className="flex justify-between items-center">
                <span>渲染批次 (Draw Calls):</span>
                <span className="text-cyan-400 font-bold">{perfMetrics.drawCalls} 批</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span>视锥裁剪优化率:</span>
                <span className="text-emerald-400 font-bold">
                  {(() => {
                    const maxTriangles = Math.max(1, plots.length * 155000); 
                    const ratio = Math.max(0, Math.min(99, Math.round((1 - (perfMetrics.triangles / maxTriangles)) * 100)));
                    return `${ratio}% 效率提升`;
                  })()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span>渲染分辨率倍率:</span>
                <span className="text-yellow-400 font-bold">DPR: {window.devicePixelRatio || 1.0}x</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating 3D Camera Control Panel（位于性能 HUD 下方；移动端隐藏，机位预设已并入主控制面板的「5D 姿态轨道」） */}
      {viewMode === 'micro' && !isImmersive && !isMobile && (
        <div className={`absolute ${showPerfPanel ? 'top-[470px]' : 'top-[200px]'} right-6 pointer-events-auto z-20 animate-[slide-in-from-right_0.4s_ease-out] transition-[top] duration-300`}>
          <div className="relative overflow-hidden bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 flex flex-col gap-2.5 font-sans shadow-[0_0_40px_rgba(0,0,0,0.85)] w-52">
            {/* Tech decorative background */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none rounded-bl-full" />
            <div className="absolute -bottom-6 -left-6 w-12 h-12 border border-cyan-500/10 rounded-full pointer-events-none" />
            <div className="flex items-center gap-2 mb-0.5 relative z-10">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <Camera size={13} className="text-cyan-400" />
              </div>
              <span className="text-xs font-bold text-slate-200 tracking-widest uppercase">3D 视角控制</span>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
            </div>
            <div className="h-px bg-gradient-to-r from-cyan-500/40 via-cyan-500/10 to-transparent mb-1" />
            
            <button
              onClick={() => { setIsCruising(false); onSelectPlot(''); setCameraPreset('overview'); }}
              className={`px-3 py-2 rounded-xl border text-[11px] transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'overview' && !activePlotId && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-cyan-400'}`}
            >
               <span>🦅 鸟瞰全局</span>
            </button>

            <button
              onClick={() => { setIsCruising(false); if (!activePlotId) onSelectPlot(plots[0]?.id || ''); setCameraPreset('overview'); }}
              className={`px-3 py-2 rounded-xl border text-[11px] transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'overview' && activePlotId && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-cyan-400'}`}
            >
               <span>🗺️ 地块全览</span>
            </button>

            <button
              onClick={() => { setIsCruising(false); if (!activePlotId) onSelectPlot(plots[0]?.id || ''); setCameraPreset('sensor'); }}
              className={`px-3 py-2 rounded-xl border text-[11px] transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'sensor' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-cyan-400'}`}
            >
               <span>📡 传感器特写</span>
            </button>

            <button
              onClick={() => { setIsCruising(false); if (!activePlotId) onSelectPlot(plots[0]?.id || ''); setCameraPreset('canopy'); }}
              className={`px-3 py-2 rounded-xl border text-[11px] transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'canopy' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-cyan-400'}`}
            >
               <span>🌾 麦浪微距</span>
            </button>

            <button
              onClick={() => { setIsCruising(false); if (!activePlotId) onSelectPlot(plots[0]?.id || ''); setCameraPreset('subsoil'); }}
              className={`px-3 py-2 rounded-xl border text-[11px] transition-all font-semibold flex items-center justify-between cursor-pointer ${cameraPreset === 'subsoil' && !isCruising ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-cyan-400'}`}
            >
               <span>🔬 根系土层</span>
            </button>

            <div className="border-t border-slate-800/80 my-1" />

            <button
              onClick={() => { setIsCruising(false); onSelectPlot(''); setCameraPreset('overview'); }}
              className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-[11px] transition-all font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-700 text-white"
            >
               <span>🔄 重置视角</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
