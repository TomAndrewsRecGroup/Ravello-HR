'use client';

// The Core OS 360 sign-in intro: the mark assembles in the centre of the
// screen — three blades sweep a full 360° into place around the core,
// an orbit ring draws, the wordmark settles — then the camera pushes
// through the core and the platform comes into shot behind it.
//
// Plays ONCE, straight after a password sign-in. The login form sets a
// short-lived `cos360_intro` cookie before it navigates; the server
// layout reads it and renders this overlay in the FIRST paint (a
// client-only flag would let the dashboard flash before the intro
// mounted). The cookie is cleared on mount, so a reload does not replay.
//
// Never in the way: a click or any key skips it, it waits for the page
// to finish loading but never longer than MAX_MS, and a pure-CSS
// fallback removes it at 4.5s even if JavaScript never runs.
// prefers-reduced-motion gets a still logo and a plain fade.

import { memo, useEffect, useRef, useState } from 'react';
import styles from './BrandIntro.module.css';
import { BRAND_MARK_INNER, BRAND_MARK_VIEWBOX } from '@/lib/brandIntroMark';
import { BRAND_INTRO_COOKIE } from '@/lib/brand';

/** The assembly finishes at ~1.6s; hold it at least this long. */
const MIN_MS  = 1700;
/** Never keep someone waiting on a slow page past this. */
const MAX_MS  = 3800;
/** Length of the push-through exit; matches .exiting in the CSS. */
const EXIT_MS = 750;

// The mark is rendered once and never re-rendered. Switching the
// overlay to its exit class re-renders the parent, and an inline SVG
// that React touches again restarts its CSS animations — the blades
// would spin back in from nothing just as the exit began.
const MARK_HTML = { __html: BRAND_MARK_INNER };
const Mark = memo(function Mark() {
  return (
    <>
      <svg className={styles.orbit} viewBox="0 0 1000 1000">
        <circle cx="500" cy="500" r="430" pathLength={1} />
      </svg>
      <svg className={styles.mark} viewBox={BRAND_MARK_VIEWBOX} dangerouslySetInnerHTML={MARK_HTML} />
    </>
  );
});

export default function BrandIntro() {
  const [phase, setPhase] = useState<'playing' | 'exiting' | 'done'>('playing');
  const exitStarted = useRef(false);

  useEffect(() => {
    document.cookie = `${BRAND_INTRO_COOKIE}=; path=/; max-age=0; samesite=lax`;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const start = performance.now();
    const timers: number[] = [];

    const exit = () => {
      if (exitStarted.current) return;
      exitStarted.current = true;
      setPhase('exiting');
      timers.push(window.setTimeout(() => setPhase('done'), reduced ? 300 : EXIT_MS));
    };

    const exitWhenReady = () => {
      const wait = Math.max(0, (reduced ? 900 : MIN_MS) - (performance.now() - start));
      timers.push(window.setTimeout(exit, wait));
    };

    if (document.readyState === 'complete') exitWhenReady();
    else window.addEventListener('load', exitWhenReady, { once: true });
    timers.push(window.setTimeout(exit, MAX_MS));

    window.addEventListener('keydown', exit, { once: true });

    return () => {
      timers.forEach(t => window.clearTimeout(t));
      window.removeEventListener('load', exitWhenReady);
      window.removeEventListener('keydown', exit);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={`${styles.overlay} ${phase === 'exiting' ? styles.exiting : ''}`}
      aria-hidden="true"
      onClick={() => {
        if (exitStarted.current) return;
        exitStarted.current = true;
        setPhase('exiting');
        window.setTimeout(() => setPhase('done'), EXIT_MS);
      }}
    >
      <div className={styles.glow} />
      <div className={styles.stage}>
        <Mark />
      </div>
      <p className={styles.wordmark}>
        CORE OS <span>360</span>
      </p>
    </div>
  );
}
