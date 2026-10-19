"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { Sfx } from "@/game/audio";
import { LIFELINE_DECISION_TIME, MAX_LIFELINES } from "@/game/constants";
import { type CrashReason, Game } from "@/game/engine";
import { makeView, render, type View } from "@/game/render";
import { bestScore, mutedPref } from "@/lib/stored";

import { useInstallPrompt, useIosInstallHint } from "./pwa";

type Screen = "home" | "playing" | "paused" | "crashed" | "over";

const CRASH_TEXT: Record<CrashReason, string> = {
  barricade: "You crashed into a police barricade.",
  banner: "Stopped at the police line. Crouch under it next time.",
  police: "The riot police blocked your way.",
  bus: "Detained! You were pushed into the police bus.",
  caught: "The police caught you. The protest goes on without you... for now.",
};

const HEADLINES = [
  "Students march against the NEET paper leak",
  'Aspirants demand "Re-NEET now"',
  "Protesters allege vote chori and dhandli in the elections",
  "Thousands on the streets demanding answers on corruption",
  "Police put up barricades across the city",
  "Detention buses lined up near the march",
];

interface Result {
  score: number;
  coins: number;
  distance: number;
  newBest: boolean;
}

const SWIPE_PX = 30;

export function BarricadeRun() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const gameRef = useRef<Game | null>(null);
  const demoRef = useRef<Game | null>(null);
  const screenRef = useRef<Screen>("home");
  const sfxRef = useRef<Sfx | null>(null);
  const swipeRef = useRef<{ x: number; y: number; done: boolean } | null>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [hud, setHud] = useState({ score: 0, coins: 0, lifelines: 1, chase: false });
  const [crash, setCrash] = useState<CrashReason | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const best = bestScore.useValue();
  const muted = mutedPref.useValue() === 1;
  const { canInstall, install } = useInstallPrompt();
  const iosHint = useIosInstallHint();

  const sfx = useCallback(() => {
    sfxRef.current ??= new Sfx();
    return sfxRef.current;
  }, []);

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  const finish = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const score = g.score;
    const newBest = score > bestScore.get();
    if (newBest) bestScore.set(score);
    setResult({ score, coins: g.coins, distance: Math.floor(g.distance), newBest });
    go("over");
  }, [go]);

  const start = useCallback(() => {
    const s = sfx();
    s.setMuted(mutedPref.get() === 1);
    s.unlock();
    const game = new Game({
      onCoin: s.coin,
      onJump: s.jump,
      onCrouch: s.crouch,
      onLane: s.lane,
      onStumble: s.stumble,
      onLifelinePickup: s.lifeline,
      onCrash: (reason) => {
        s.crash();
        s.setSiren(false);
        setCrash(reason);
        setHud((h) => ({ ...h, score: game.score, coins: game.coins, lifelines: game.lifelines }));
        if (game.lifelines > 0) go("crashed");
        else finish();
      },
    });
    gameRef.current = game;
    setHud({ score: 0, coins: 0, lifelines: game.lifelines, chase: true });
    go("playing");
  }, [finish, go, sfx]);

  const spendLifeline = useCallback(() => {
    if (gameRef.current?.revive()) {
      sfx().lifeline();
      go("playing");
    }
  }, [go, sfx]);

  const pause = useCallback(() => {
    if (screenRef.current !== "playing") return;
    sfx().setSiren(false);
    go("paused");
  }, [go, sfx]);

  const home = useCallback(() => {
    sfx().setSiren(false);
    gameRef.current = null;
    go("home");
  }, [go, sfx]);

  // The lifeline offer expires if the player doesn't take it.
  useEffect(() => {
    if (screen !== "crashed") return;
    const timer = setTimeout(finish, LIFELINE_DECISION_TIME * 1000);
    return () => clearTimeout(timer);
  }, [screen, finish]);

  const toggleMute = () => {
    const next = !muted;
    mutedPref.set(next ? 1 : 0);
    sfx().setMuted(next);
  };

  // Render loop. Runs for the whole lifetime of the page; the home screen shows an autopilot demo run.
  useEffect(() => {
    const canvas = canvasRef.current;
    // Opaque canvas: the browser can skip blending it with the page behind.
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;
    demoRef.current = new Game({}, true);

    // Render resolution. Starts at the screen's pixel density (capped lower on phones, where fill
    // rate is the bottleneck) and steps down automatically if the device can't keep up.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let scale = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let slowFrames = 0;
    let sampled = 0;

    const resize = () => {
      const dpr = scale;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const camX = viewRef.current?.camX ?? 0;
      viewRef.current = { ...makeView(w, h), camX };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let lastHud = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const elapsed = now - last;
      const dt = Math.min(0.05, elapsed / 1000);
      last = now;
      const s = screenRef.current;
      const game = s === "home" ? demoRef.current : gameRef.current;
      const live = s === "home" || s === "playing";

      // Every 90 animated frames: if most ran slower than ~45 fps, drop the resolution one step.
      if (live && !document.hidden && elapsed < 250) {
        sampled++;
        if (elapsed > 22) slowFrames++;
        if (sampled >= 90) {
          if (slowFrames > 45 && scale > 0.75) {
            scale = Math.max(0.75, scale - 0.25);
            resize();
          }
          sampled = 0;
          slowFrames = 0;
        }
      }
      if (live) clock += dt;
      if (game && viewRef.current) {
        if (live) game.update(dt);
        render(ctx, viewRef.current, game, clock);
      }
      if (s === "playing" && gameRef.current) {
        const g = gameRef.current;
        sfxRef.current?.setSiren(g.chaseT > 0);
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ score: g.score, coins: g.coins, lifelines: g.lifelines, chase: g.chaseT > 0 });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    const onHidden = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [pause]);

  // Keyboard: arrows / WASD / Space, P or Esc to pause, Enter to start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = screenRef.current;
      const g = gameRef.current;
      if (s === "playing" && g) {
        const actions: Record<string, () => void> = {
          ArrowLeft: () => g.move(-1),
          KeyA: () => g.move(-1),
          ArrowRight: () => g.move(1),
          KeyD: () => g.move(1),
          ArrowUp: () => g.jump(),
          KeyW: () => g.jump(),
          Space: () => g.jump(),
          ArrowDown: () => g.crouch(),
          KeyS: () => g.crouch(),
          KeyP: pause,
          Escape: pause,
        };
        const action = actions[e.code];
        if (!action) return;
        e.preventDefault();
        if (!e.repeat) action();
        return;
      }
      // Let focused buttons handle their own Enter/Space.
      if (e.repeat || (e.target instanceof HTMLElement && e.target.closest("button"))) return;
      const confirm = e.code === "Enter" || e.code === "Space";
      if ((s === "home" || s === "over") && confirm) start();
      else if (s === "paused" && (confirm || e.code === "KeyP" || e.code === "Escape")) go("playing");
      else if (s === "crashed" && confirm) spendLifeline();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, pause, start, spendLifeline]);

  // Swipe gestures on the play area, in addition to the on-screen buttons.
  const onPointerDown = (e: PointerEvent) => {
    if (screenRef.current === "playing") swipeRef.current = { x: e.clientX, y: e.clientY, done: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const sw = swipeRef.current;
    const g = gameRef.current;
    if (!sw || sw.done || !g) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    sw.done = true;
    if (Math.abs(dx) > Math.abs(dy)) g.move(dx < 0 ? -1 : 1);
    else if (dy < 0) g.jump();
    else g.crouch();
  };
  const onPointerUp = () => {
    swipeRef.current = null;
  };

  const onControl = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const g = gameRef.current;
    if (!g || screenRef.current !== "playing") return;
    const action = e.currentTarget.dataset.action;
    if (action === "left") g.move(-1);
    else if (action === "right") g.move(1);
    else if (action === "jump") g.jump();
    else if (action === "crouch") g.crouch();
  };

  return (
    <main className="game" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Game view: running down a road through a protest" role="img" />

      {screen === "playing" && (
        <>
          <div className="hud">
            <div className="hud-stats">
              <span className="hud-score" aria-label="Score">{hud.score.toLocaleString()}</span>
              <span className="hud-coins" aria-label="Coins">
                <span className="coin-icon" aria-hidden /> {hud.coins}
              </span>
            </div>
            <div className="hud-right">
              <span className="hud-lives" aria-label={`${hud.lifelines} lifelines`}>
                {Array.from({ length: MAX_LIFELINES }, (_, i) => (
                  <span key={i} className={i < hud.lifelines ? "life on" : "life"} aria-hidden>
                    ♥
                  </span>
                ))}
              </span>
              <button type="button" className="icon-btn" onClick={pause} aria-label="Pause">
                <span className="pause-icon" aria-hidden />
              </button>
            </div>
          </div>
          {hud.chase && <div className="chase-banner">POLICE ON YOUR TAIL!</div>}

          <div className="touch-controls" role="group" aria-label="Game controls">
            <button type="button" className="pad-btn pad-up" data-action="jump" onPointerDown={onControl}>
              <span aria-hidden>▲</span>
              <span className="pad-label">JUMP</span>
            </button>
            <button type="button" className="pad-btn pad-left" data-action="left" onPointerDown={onControl}>
              <span aria-hidden>◀</span>
              <span className="pad-label">LEFT</span>
            </button>
            <button type="button" className="pad-btn pad-right" data-action="right" onPointerDown={onControl}>
              <span aria-hidden>▶</span>
              <span className="pad-label">RIGHT</span>
            </button>
            <button type="button" className="pad-btn pad-down" data-action="crouch" onPointerDown={onControl}>
              <span aria-hidden>▼</span>
              <span className="pad-label">CROUCH</span>
            </button>
          </div>
        </>
      )}

      {screen === "home" && (
        <section className="overlay home" aria-labelledby="title">
          <div className="ticker" aria-label="News headlines">
            <span className="ticker-tag">BREAKING</span>
            <div className="ticker-window">
              <div className="ticker-track">
                {[0, 1].map((copy) => (
                  <span key={copy} aria-hidden={copy === 1}>
                    {HEADLINES.map((h) => (
                      <span key={h} className="ticker-item">
                        {h}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="panel">
            <p className="eyebrow">Paper leak • Vote chori • Corruption</p>
            <h1 id="title" className="title">
              BARRICADE<span>RUN</span>
            </h1>
            <p className="tagline">
              The NEET paper leaked. Votes were stolen. The streets are full. Run with the protest, dodge the
              barricades, riot police and the detention bus, and grab the coins on the way.
            </p>
            <button type="button" className="play-btn" onClick={start} autoFocus>
              ▶ PLAY
            </button>
            {best > 0 && <p className="best">Best: {best.toLocaleString()}</p>}
            <p className="lifeline-note">♥ Every run comes with 1 free lifeline. Grab hearts on the road for more.</p>
            <p className="coin-note">
              <span className="coin-icon" aria-hidden /> Collect coins on the road (+10 each).
            </p>

            <div className="controls-help">
              <div className="help-keys">
                <h2>Laptop / PC</h2>
                <ul>
                  <li><kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> change lane</li>
                  <li><kbd>↑</kbd> <kbd>W</kbd> or <kbd>Space</kbd> jump</li>
                  <li><kbd>↓</kbd> or <kbd>S</kbd> crouch / slide</li>
                  <li><kbd>P</kbd> or <kbd>Esc</kbd> pause</li>
                </ul>
              </div>
              <div className="help-touch">
                <h2>Mobile</h2>
                <ul>
                  <li>Buttons on the right side:</li>
                  <li><b>LEFT</b> / <b>RIGHT</b> change lane</li>
                  <li><b>JUMP</b> over barricades, <b>CROUCH</b> under the police line</li>
                  <li>or swipe in any direction</li>
                </ul>
              </div>
            </div>

            <div className="home-actions">
              {canInstall && (
                <button type="button" className="ghost-btn" onClick={install}>
                  ⤓ Install app
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={toggleMute} aria-pressed={muted}>
                {muted ? "🔇 Sound off" : "🔊 Sound on"}
              </button>
            </div>
            {iosHint && <p className="ios-hint">To install on iPhone: tap Share, then &quot;Add to Home Screen&quot;.</p>}
          </div>
        </section>
      )}

      {screen === "paused" && (
        <section className="overlay" aria-labelledby="paused-title">
          <div className="panel small">
            <h2 id="paused-title" className="headline">PAUSED</h2>
            <button type="button" className="play-btn" onClick={() => go("playing")} autoFocus>
              ▶ RESUME
            </button>
            <div className="home-actions">
              <button type="button" className="ghost-btn" onClick={start}>
                ↻ Restart
              </button>
              <button type="button" className="ghost-btn" onClick={toggleMute} aria-pressed={muted}>
                {muted ? "🔇 Sound off" : "🔊 Sound on"}
              </button>
              <button type="button" className="ghost-btn" onClick={home}>
                ⌂ Home
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === "crashed" && crash && (
        <section className="overlay" aria-labelledby="busted-title" role="alertdialog">
          <div className="panel small">
            <h2 id="busted-title" className="headline busted">BUSTED!</h2>
            <p className="reason">{CRASH_TEXT[crash]}</p>
            <div className="countdown" style={{ animationDuration: `${LIFELINE_DECISION_TIME}s` }} aria-hidden />
            <button type="button" className="play-btn lifeline-btn" onClick={spendLifeline} autoFocus>
              ♥ USE LIFELINE <small>({hud.lifelines} left)</small>
            </button>
            <button type="button" className="ghost-btn" onClick={finish}>
              Give up
            </button>
          </div>
        </section>
      )}

      {screen === "over" && result && (
        <section className="overlay" aria-labelledby="over-title">
          <div className="panel small">
            <h2 id="over-title" className="headline busted">CAUGHT!</h2>
            {crash && <p className="reason">{CRASH_TEXT[crash]}</p>}
            <p className="final-score">{result.score.toLocaleString()}</p>
            {result.newBest ? <p className="new-best">New best score!</p> : <p className="best">Best: {best.toLocaleString()}</p>}
            <dl className="stats">
              <div>
                <dt>Distance</dt>
                <dd>{result.distance.toLocaleString()} m</dd>
              </div>
              <div>
                <dt>Coins</dt>
                <dd>{result.coins}</dd>
              </div>
            </dl>
            <button type="button" className="play-btn" onClick={start} autoFocus>
              ↻ PLAY AGAIN
            </button>
            <button type="button" className="ghost-btn" onClick={home}>
              ⌂ Home
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
