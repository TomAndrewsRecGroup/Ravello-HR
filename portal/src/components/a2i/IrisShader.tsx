'use client';

import { useEffect, useRef } from 'react';

/**
 * Gold Iris — domain-warped FBM flow field in an amber/gold palette.
 * Ported (read-only) from the Athletes To Industry site for the public
 * referral pages. Mouse-reactive, chromatic aberration, film-grain dither.
 * Pauses when off-screen. Respects prefers-reduced-motion.
 *
 * Difference vs. the A2I original: the alpha is symmetric (no left-side
 * text guard) because the referral form is centred, not left-aligned.
 */
export function IrisShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      canvas.style.display = 'none';
      return;
    }

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) { canvas.style.display = 'none'; return; }

    const vertSrc = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2  u_res;
      uniform float u_time;
      uniform vec2  u_mouse;
      uniform float u_mouseInfluence;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p  = rot * p * 2.0;
          a *= 0.5;
        }
        return v;
      }
      float warpedField(vec2 uv, float t) {
        vec2 q = vec2(fbm(uv + vec2(0.0, 0.0) + t * 0.08),
                      fbm(uv + vec2(5.2, 1.3)  + t * 0.10));
        vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + t * 0.12),
                      fbm(uv + 4.0 * q + vec2(8.3, 2.8) + t * 0.11));
        return fbm(uv + 4.0 * r);
      }

      void main() {
        vec2 p = (v_uv - 0.5);
        p.x *= u_res.x / u_res.y;

        float t = u_time * 0.20;
        float f = warpedField(p * 1.4, t);

        /* mouse well */
        vec2  m    = vec2(u_mouse.x * u_res.x / u_res.y, u_mouse.y);
        float dm   = length(p - m);
        float pull = exp(-dm * 2.5) * u_mouseInfluence;
        f += pull * 0.35 * sin(t * 2.0);

        float vig = smoothstep(1.15, 0.18, length(p));

        /* gold / amber palette */
        vec3 amber_dark  = vec3(0.28, 0.15, 0.02);   /* charred amber */
        vec3 gold_mid    = vec3(0.62, 0.40, 0.07);   /* mid gold      */
        vec3 gold_bright = vec3(0.86, 0.63, 0.20);   /* warm gold     */
        vec3 gold_high   = vec3(0.97, 0.85, 0.50);   /* hot highlight */

        float peak1 = smoothstep(0.25, 0.55, f);
        float peak2 = smoothstep(0.50, 0.85, f);
        vec3  col   = mix(amber_dark,  gold_mid,    peak1);
        col         = mix(col,         gold_bright, peak2 * 0.68);

        float ridge = smoothstep(0.78, 0.93, f);
        col = mix(col, gold_high, ridge * 0.72);

        /* mouse halo */
        col += gold_high * pull * 0.18;

        /* chromatic aberration */
        float ca = 0.004 + pull * 0.01;
        float lR = warpedField((p + vec2(ca, 0.0)) * 1.4, t);
        float lB = warpedField((p - vec2(ca, 0.0)) * 1.4, t);
        col.r = mix(col.r, col.r * smoothstep(0.25, 0.95, lR), 0.20);
        col.b = mix(col.b, col.b * smoothstep(0.25, 0.95, lB), 0.20);

        /* grain dither */
        float grain = (hash(v_uv * u_res + u_time) - 0.5) * 0.028;
        col += grain;

        /* symmetric vignette alpha (centred content) */
        float alpha = vig * 0.85;
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `;

    function compile(type: number, src: string): WebGLShader | null {
      const s = gl!.createShader(type);
      if (!s) return null;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) { canvas.style.display = 'none'; return; }

    const program = gl.createProgram();
    if (!program) { canvas.style.display = 'none'; return; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(program, 'u_res');
    const uTime  = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uInfl  = gl.getUniformLocation(program, 'u_mouseInfluence');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, infl: 0, tInfl: 0 };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx   = (e.clientX - r.left) / r.width;
      mouse.ty   = 1 - (e.clientY - r.top) / r.height;
      mouse.tInfl = (e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top  && e.clientY <= r.bottom) ? 1 : 0;
    };
    const onLeave = () => { mouse.tInfl = 0; };
    window.addEventListener('pointermove', onMove,  { passive: true });
    window.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    let visible = true;
    const io = new IntersectionObserver(
      (entries) => { visible = entries[0]?.isIntersecting ?? true; },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    let raf = 0, start = 0;
    const loop = (now: number) => {
      if (!start) start = now;
      if (visible) {
        const t = (now - start) / 1000;
        mouse.x    += (mouse.tx    - mouse.x)    * 0.06;
        mouse.y    += (mouse.ty    - mouse.y)     * 0.06;
        mouse.infl += (mouse.tInfl - mouse.infl)  * 0.04;

        gl.uniform2f(uRes,   canvas.width, canvas.height);
        gl.uniform1f(uTime,  t);
        gl.uniform2f(uMouse, mouse.x - 0.5, mouse.y - 0.5);
        gl.uniform1f(uInfl,  mouse.infl);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="w-full h-full"
    />
  );
}

export default IrisShader;
