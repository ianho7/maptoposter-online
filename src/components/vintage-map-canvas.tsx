'use client';

import { useEffect, useRef } from 'react';
import type { MapColors } from '@/lib/types';

interface Location {
  country: string;
  state: string;
  city: string;
  lat?: number;  // 可选，预览时可能没有精确坐标
  lng?: number;  // 可选，预览时可能没有精确坐标
}

interface VintageMapCanvasProps {
  location: Location;
  colors: MapColors;
  customTitle?: string;
  aspectRatio: number;
}

export function VintageMapCanvas({ location, colors, customTitle, aspectRatio }: VintageMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on container
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Use device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    ctx.scale(dpr, dpr);

    const width = containerWidth;
    const height = containerHeight;

    // Draw background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Decorative double border
    const margin = Math.min(width, height) * 0.04;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
    ctx.strokeRect(margin + 6, margin + 6, width - margin * 2 - 12, height - margin * 2 - 12);

    // Map area
    const mapMargin = margin + 20;
    const mapTop = mapMargin;
    const mapHeight = height * 0.58;
    const mapWidth = width - mapMargin * 2;

    // Water/background of map
    ctx.fillStyle = colors.water;
    ctx.fillRect(mapMargin, mapTop, mapWidth, mapHeight);

    // Generate pseudo-random values based on coordinates for consistent look
    const lat = location.lat ?? 0;
    const lng = location.lng ?? 0;
    const seed = Math.abs(lat * 1000 + lng * 100);
    const seededRandom = (n: number) => {
      const x = Math.sin(seed + n * 9999) * 10000;
      return x - Math.floor(x);
    };

    // Draw parks/green areas
    ctx.fillStyle = colors.parks;
    for (let i = 0; i < 12; i++) {
      const x = mapMargin + seededRandom(i * 4) * mapWidth * 0.9;
      const y = mapTop + seededRandom(i * 4 + 1) * mapHeight * 0.9;
      const w = 20 + seededRandom(i * 4 + 2) * mapWidth * 0.15;
      const h = 15 + seededRandom(i * 4 + 3) * mapHeight * 0.1;

      // Rounded rectangles for organic park shapes
      const radius = Math.min(w, h) * 0.3;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
    }

    // Draw building blocks
    ctx.fillStyle = colors.buildings;
    for (let i = 0; i < 50; i++) {
      const x = mapMargin + seededRandom(i * 5 + 100) * mapWidth * 0.95;
      const y = mapTop + seededRandom(i * 5 + 101) * mapHeight * 0.95;
      const w = 8 + seededRandom(i * 5 + 102) * mapWidth * 0.06;
      const h = 6 + seededRandom(i * 5 + 103) * mapHeight * 0.04;
      ctx.fillRect(x, y, w, h);
    }

    // Draw main roads (grid pattern with variation)
    ctx.strokeStyle = colors.road_primary;
    ctx.lineCap = 'round';

    // Major horizontal roads
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const y = mapTop + (i + 1) * (mapHeight / 5);
      const wobble = seededRandom(i * 10 + 200) * 10 - 5;
      ctx.beginPath();
      ctx.moveTo(mapMargin, y + wobble);
      ctx.bezierCurveTo(
        mapMargin + mapWidth * 0.3, y + wobble + seededRandom(i * 10 + 201) * 15 - 7,
        mapMargin + mapWidth * 0.7, y + wobble + seededRandom(i * 10 + 202) * 15 - 7,
        mapMargin + mapWidth, y + wobble
      );
      ctx.stroke();
    }

    // Major vertical roads
    for (let i = 0; i < 5; i++) {
      const x = mapMargin + (i + 1) * (mapWidth / 6);
      const wobble = seededRandom(i * 10 + 300) * 10 - 5;
      ctx.beginPath();
      ctx.moveTo(x + wobble, mapTop);
      ctx.bezierCurveTo(
        x + wobble + seededRandom(i * 10 + 301) * 15 - 7, mapTop + mapHeight * 0.3,
        x + wobble + seededRandom(i * 10 + 302) * 15 - 7, mapTop + mapHeight * 0.7,
        x + wobble, mapTop + mapHeight
      );
      ctx.stroke();
    }

    // Secondary roads
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 8; i++) {
      const y = mapTop + seededRandom(i * 10 + 400) * mapHeight;
      ctx.beginPath();
      ctx.moveTo(mapMargin, y);
      ctx.lineTo(mapMargin + mapWidth, y + seededRandom(i * 10 + 401) * 20 - 10);
      ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const x = mapMargin + seededRandom(i * 10 + 500) * mapWidth;
      ctx.beginPath();
      ctx.moveTo(x, mapTop);
      ctx.lineTo(x + seededRandom(i * 10 + 501) * 20 - 10, mapTop + mapHeight);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // River (if near water)
    if (seededRandom(1) > 0.4) {
      ctx.strokeStyle = colors.water;
      ctx.lineWidth = 8 + seededRandom(2) * 10;
      ctx.beginPath();
      const riverStart = seededRandom(3) > 0.5;
      if (riverStart) {
        ctx.moveTo(mapMargin, mapTop + mapHeight * seededRandom(4));
        ctx.bezierCurveTo(
          mapMargin + mapWidth * 0.3, mapTop + mapHeight * seededRandom(5),
          mapMargin + mapWidth * 0.6, mapTop + mapHeight * seededRandom(6),
          mapMargin + mapWidth, mapTop + mapHeight * seededRandom(7)
        );
      } else {
        ctx.moveTo(mapMargin + mapWidth * seededRandom(8), mapTop);
        ctx.bezierCurveTo(
          mapMargin + mapWidth * seededRandom(9), mapTop + mapHeight * 0.4,
          mapMargin + mapWidth * seededRandom(10), mapTop + mapHeight * 0.6,
          mapMargin + mapWidth * seededRandom(11), mapTop + mapHeight
        );
      }
      ctx.stroke();
    }

    // Vignette effect on map
    const gradient = ctx.createRadialGradient(
      mapMargin + mapWidth / 2, mapTop + mapHeight / 2, mapHeight * 0.2,
      mapMargin + mapWidth / 2, mapTop + mapHeight / 2, mapHeight * 0.8
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, colors.bg + '60');
    ctx.fillStyle = gradient;
    ctx.fillRect(mapMargin, mapTop, mapWidth, mapHeight);

    // Map border
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.strokeRect(mapMargin, mapTop, mapWidth, mapHeight);

    // Compass rose
    const compassSize = Math.min(width, height) * 0.06;
    const compassX = mapMargin + mapWidth - compassSize - 10;
    const compassY = mapTop + compassSize + 10;

    ctx.save();
    ctx.translate(compassX, compassY);
    ctx.strokeStyle = colors.text;
    ctx.fillStyle = colors.text;
    ctx.lineWidth = 1;

    // Draw compass points
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(0, -compassSize * 0.9);
        ctx.lineTo(compassSize * 0.15, 0);
        ctx.lineTo(0, compassSize * 0.3);
        ctx.lineTo(-compassSize * 0.15, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.moveTo(0, -compassSize * 0.5);
        ctx.lineTo(0, compassSize * 0.15);
        ctx.stroke();
      }
      ctx.restore();
    }

    // N label
    ctx.font = `bold ${compassSize * 0.4}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -compassSize - 5);
    ctx.restore();

    // Text section
    const textTop = mapTop + mapHeight + height * 0.06;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';

    // City name - large serif font
    const cityFontSize = Math.min(width * 0.1, 48);
    ctx.font = `700 ${cityFontSize}px "Playfair Display", Georgia, serif`;
    ctx.fillText(
      (customTitle || location.city).toUpperCase(),
      width / 2,
      textTop
    );

    // Decorative line
    const lineY = textTop + cityFontSize * 0.4;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.3, lineY);
    ctx.lineTo(width * 0.7, lineY);
    ctx.stroke();

    // Small diamond in center
    ctx.beginPath();
    ctx.moveTo(width / 2, lineY - 4);
    ctx.lineTo(width / 2 + 4, lineY);
    ctx.lineTo(width / 2, lineY + 4);
    ctx.lineTo(width / 2 - 4, lineY);
    ctx.closePath();
    ctx.fill();

    // State, Country
    const subFontSize = Math.min(width * 0.032, 14);
    ctx.font = `${subFontSize}px "Crimson Text", Georgia, serif`;
    ctx.letterSpacing = '3px';
    ctx.fillText(
      `${location.state}  ·  ${location.country}`.toUpperCase(),
      width / 2,
      lineY + subFontSize * 2
    );

    // Coordinates
    const coordFontSize = Math.min(width * 0.026, 12);
    ctx.font = `${coordFontSize}px "Crimson Text", Georgia, serif`;
    ctx.globalAlpha = 0.7;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    ctx.fillText(
      `${Math.abs(lat).toFixed(4)}° ${latDir}   |   ${Math.abs(lng).toFixed(4)}° ${lngDir}`,
      width / 2,
      lineY + subFontSize * 4
    );
    ctx.globalAlpha = 1;

    // Corner decorations
    const drawCornerDecoration = (x: number, y: number, flipX: boolean, flipY: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;

      const size = Math.min(width, height) * 0.04;
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(0, 0);
      ctx.lineTo(size, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(size * 0.3, size * 0.3, size * 0.15, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    const cornerOffset = margin + 12;
    drawCornerDecoration(cornerOffset, cornerOffset, false, false);
    drawCornerDecoration(width - cornerOffset, cornerOffset, true, false);
    drawCornerDecoration(cornerOffset, height - cornerOffset, false, true);
    drawCornerDecoration(width - cornerOffset, height - cornerOffset, true, true);

  }, [location, colors, customTitle, aspectRatio]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: colors.bg }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
