'use client';

import { useEffect, useRef } from 'react';

/**
 * Gold/black smoke field. Ported (read-only) from the Athletes To Industry
 * site for the public referral pages. Self-contained Canvas2D — 14 drifting
 * gold plumes over a navy vignette, screen-blended.
 */

interface Plume {
  x: number;
  y: number;
  scale: number;
  speed: number;
  drift: number;
  offsetX: number;
  offsetY: number;
  phase: number;
}

function createPlume(x: number, y: number, scale: number, speed: number, drift: number): Plume {
  return {
    x,
    y,
    scale,
    speed,
    drift,
    offsetX: Math.random() * 1000,
    offsetY: Math.random() * 1000,
    phase: Math.random() * Math.PI * 2,
  };
}

function noise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.01 + t) * 0.5 +
    Math.sin(y * 0.013 + t * 1.1) * 0.3 +
    Math.sin((x + y) * 0.008 + t * 0.7) * 0.2
  );
}

export function SmokeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;
    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const plumes: Plume[] = Array.from({ length: 14 }, () =>
      createPlume(
        Math.random() * window.innerWidth,
        Math.random() * window.innerHeight,
        Math.random() * 400 + 300,
        Math.random() * 0.0003 + 0.0002,
        Math.random() * 0.5 + 0.3
      )
    );

    const render = () => {
      time += 0.003;
      ctx.fillStyle = 'rgba(6, 10, 24, 0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';

      plumes.forEach((p, idx) => {
        const driftX = noise(p.offsetX, p.offsetY, time * 0.5) * p.drift * 60;
        const driftY = noise(p.offsetX + 500, p.offsetY + 500, time * 0.4) * p.drift * 60;
        const phaseShift = Math.sin(time * 0.3 + p.phase) * 0.2 + 0.8;

        p.offsetX += p.speed * 200;
        p.offsetY -= p.speed * 150;
        p.y -= p.speed * 30;
        p.x += Math.sin(time + idx) * 0.15;

        if (p.y < -p.scale) { p.y = h + p.scale * 0.5; p.x = Math.random() * w; }
        if (p.x < -p.scale) p.x = w + p.scale * 0.5;
        if (p.x > w + p.scale) p.x = -p.scale * 0.5;

        const cx = p.x + driftX;
        const cy = p.y + driftY;
        const radius = p.scale * phaseShift;

        const intensity = 0.12 + Math.sin(time * 0.5 + p.phase) * 0.04;

        const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g1.addColorStop(0, `rgba(220,170,80,${intensity})`);
        g1.addColorStop(0.2, `rgba(200,150,60,${intensity * 0.7})`);
        g1.addColorStop(0.5, `rgba(160,110,40,${intensity * 0.3})`);
        g1.addColorStop(0.8, `rgba(100,70,30,${intensity * 0.1})`);
        g1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        const wispX = cx + Math.sin(time * 2 + idx) * radius * 0.3;
        const wispY = cy + Math.cos(time * 1.7 + idx) * radius * 0.3;
        const wispR = radius * 0.4;
        const g2 = ctx.createRadialGradient(wispX, wispY, 0, wispX, wispY, wispR);
        g2.addColorStop(0, `rgba(240,190,100,${intensity * 0.6})`);
        g2.addColorStop(0.5, `rgba(180,130,60,${intensity * 0.2})`);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(wispX, wispY, wispR, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = 'source-over';
      const vignette = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.3,
        w / 2, h / 2, Math.max(w, h) * 0.8
      );
      vignette.addColorStop(0, 'rgba(6,10,24,0)');
      vignette.addColorStop(1, 'rgba(6,10,24,0.5)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}

export default SmokeCanvas;
