"use client";

import Link from "next/link";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { Sfx } from "@/games/shared/audio";
import { AUTHOR, LIFELINE_DECISION_TIME, MAX_LIFELINES } from "@/games/shared/constants";
import type { View } from "@/games/shared/scene";
import type { Action, ArcadeGame, GameDef, Meter } from "@/games/shared/types";
import { mutedPref } from "@/lib/stored";

import { useInstallPrompt, useIosInstallHint } from "./pwa";

type Screen = "home" | "playing" | "paused" | "crashed" | "over";

interface Hud {
  score: number;
  coins: number;
  distance: number;
  lifelines: number;
  chase: boolean;
  meter: Meter | null;
}

interface Result {
  score: number;
  coins: number;
  distance: number;
  newBest: boolean;
}

const SWIPE_PX = 30;
const EMPTY_HUD: Hud = { score: 0, coins: 0, distance: 0, lifelines: 1, chase: false, meter: null };

const KEY_ACTIONS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  Space: "up",
  ArrowDown: "down",
  KeyS: "down",
};

/** Full-screen canvas game with title, pause, lifeline and game-over screens. Works for any GameDef. */
export function GameShell({ def }: { def: GameDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const gameRef = useRef<ArcadeGame | null>(null);
  const demoRef = useRef<ArcadeGame | null>(null);
  const screenRef = useRef<Screen>("home");
  const sfxRef = useRef<Sfx | null>(null);
  const swipeRef = useRef<{ x: number; y: number; done: boolean } | null>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [crash, setCrash] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [hint, setHint] = useState(false);
  const hintShown = useRef(false);
  const best = def.best.useValue();
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

  const readHud = useCallback(
    (g: ArcadeGame): Hud => ({
      score: g.score,
      coins: g.coins,
      distance: Math.floor(g.distance),
      lifelines: g.lifelines,
      chase: g.chaseT > 0,
      meter: def.meter?.(g) ?? null,
    }),
    [def],
  );

  const finish = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const score = g.score;
    const newBest = score > def.best.get();
    if (newBest) def.best.set(score);
    setResult({ score, coins: g.coins, distance: Math.floor(g.distance), newBest });
    sfxRef.current?.setSiren(false);
    go("over");
  }, [def, go]);

  const start = useCallback(() => {
    const s = sfx();
    s.setMuted(mutedPref.get() === 1);
    s.unlock();
    const game: ArcadeGame = def.create(
      {
        onSound: s.play,
        onCrash: (reason) => {
          s.setSiren(false);
          setCrash(reason);
          setHud(readHud(game));
          if (game.lifelines > 0) go("crashed");
          else finish();
        },
      },
      false,
    );
    gameRef.current = game;
    setHud(readHud(game));
    setCrash(null);
    go("playing");
    if (!hintShown.current && window.matchMedia("(pointer: coarse)").matches) {
      hintShown.current = true;
      setHint(true);
    }
  }, [def, finish, go, readHud, sfx]);

  const spendLifeline = useCallback(() => {
    if (gameRef.current?.revive()) {
      sfx().play("lifeline");
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

  const act = useCallback((action: Action) => {
    if (screenRef.current !== "playing") return;
    gameRef.current?.input(action);
    setHint(false);
  }, []);

  // The lifeline offer expires if the player doesn't take it.
  useEffect(() => {
    if (screen !== "crashed") return;
    const timer = setTimeout(finish, LIFELINE_DECISION_TIME * 1000);
    return () => clearTimeout(timer);
  }, [screen, finish]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 4000);
    return () => clearTimeout(timer);
  }, [hint]);

  const toggleMute = () => {
    const next = !muted;
    mutedPref.set(next ? 1 : 0);
    sfx().setMuted(next);
  };

  // Render loop. Runs for the whole lifetime of the page; the title screen shows an autopilot demo run.
  useEffect(() => {
    const canvas = canvasRef.current;
    // Opaque canvas: the browser can skip blending it with the page behind.
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;
    demoRef.current = def.create({}, true);

    // Render resolution. Starts at the screen's pixel density (capped lower on phones, where fill
    // rate is the bottleneck) and steps down automatically if the device can't keep up.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let scale = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let slowFrames = 0;
    let sampled = 0;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const camX = viewRef.current?.camX ?? 0;
      viewRef.current = { ...def.makeView(w, h), camX };
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
        def.render(ctx, viewRef.current, game, clock);
      }
      if (s === "playing" && gameRef.current) {
        const g = gameRef.current;
        sfxRef.current?.setSiren(g.chaseT > 0);
        if (now - lastHud > 100) {
          lastHud = now;
          setHud(readHud(g));
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
      sfxRef.current?.setSiren(false);
    };
  }, [def, pause, readHud]);

  // Keyboard: arrows / WASD / Space, P or Esc to pause, Enter to start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = screenRef.current;
      if (s === "playing") {
        if (e.code === "KeyP" || e.code === "Escape") {
          e.preventDefault();
          pause();
          return;
        }
        const action = KEY_ACTIONS[e.code];
        if (!action) return;
        e.preventDefault();
        if (!e.repeat) act(action);
        return;
      }
      // Let focused buttons and links handle their own Enter/Space.
      if (e.repeat || (e.target instanceof HTMLElement && e.target.closest("button, a"))) return;
      const confirm = e.code === "Enter" || e.code === "Space";
      if ((s === "home" || s === "over") && confirm) start();
      else if (s === "paused" && (confirm || e.code === "KeyP" || e.code === "Escape")) go("playing");
      else if (s === "crashed" && confirm) spendLifeline();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, go, pause, start, spendLifeline]);

  // Swipe anywhere on the play area. No on-screen buttons, so the whole screen stays visible.
  const onPointerDown = (e: PointerEvent) => {
    if (screenRef.current === "playing") swipeRef.current = { x: e.clientX, y: e.clientY, done: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const sw = swipeRef.current;
    if (!sw || sw.done) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    sw.done = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? "left" : "right");
    else act(dy < 0 ? "up" : "down");
  };
  const onPointerUp = () => {
    swipeRef.current = null;
  };

  const style = { "--game": def.color } as React.CSSProperties;

  return (
    <main
      className="game"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="game-canvas" aria-label={def.canvasLabel} role="img" />

      {screen === "playing" && (
        <>
          <div className="hud">
            <div className="hud-card hud-score-card">
              <span className="hud-label">Score</span>
              <span className="hud-score" aria-label="Score">
                {hud.score.toLocaleString()}
              </span>
              <span className="hud-sub">
                <span className="hud-chip">
                  <span className="coin-icon" aria-hidden /> <span aria-label="Coins">{hud.coins}</span>
                </span>
                <span className="hud-chip">{hud.distance.toLocaleString()} m</span>
              </span>
            </div>
            <div className="hud-right">
              <span className="hud-card hud-lives" aria-label={`${hud.lifelines} lifelines`}>
                {Array.from({ length: MAX_LIFELINES }, (_, i) => (
                  <span key={i} className={i < hud.lifelines ? "life on" : "life"} aria-hidden>
                    ♥
                  </span>
                ))}
              </span>
              <button type="button" className="icon-btn" onClick={pause} onPointerDown={(e) => e.stopPropagation()} aria-label="Pause">
                <span className="pause-icon" aria-hidden />
              </button>
            </div>
          </div>
          {hud.chase && <div className="chase-banner">{def.chaseText}</div>}
          {hud.meter && <MeterBar meter={hud.meter} />}
          {hint && (
            <div className="swipe-hint" aria-hidden>
              <div className="swipe-hand" />
              <p>Swipe anywhere</p>
              <ul>
                {def.gestures.map(([g, t]) => (
                  <li key={g}>
                    <b>{g.replace("Swipe ", "")}</b> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {screen === "home" && (
        <section className="overlay home" aria-labelledby="title">
          <Link href="/" className="back-link">
            <span aria-hidden>‹</span> All games
          </Link>
          <div className="panel">
            <p className="eyebrow">{def.eyebrow}</p>
            <h1 id="title" className="title">
              {def.title}
              <span>{def.titleAccent}</span>
            </h1>
            <p className="tagline">{def.tagline}</p>
            <button type="button" className="play-btn" onClick={start} autoFocus>
              ▶ PLAY
            </button>
            {best > 0 && <p className="best">Best: {best.toLocaleString()}</p>}
            <ul className="notes">
              {def.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>

            <div className="controls-help">
              <div className="help-keys">
                <h2>Laptop / PC</h2>
                <ul>
                  {def.keys.map(([keys, t]) => (
                    <li key={t}>
                      <span className="keys">
                        {keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="help-touch">
                <h2>Phone / Tablet</h2>
                <ul>
                  {def.gestures.map(([g, t]) => (
                    <li key={g}>
                      <b>{g}</b> {t}
                    </li>
                  ))}
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
            <p className="credit">
              Made by <b>{AUTHOR}</b>
            </p>
          </div>
        </section>
      )}

      {screen === "paused" && (
        <section className="overlay" aria-labelledby="paused-title">
          <div className="panel small">
            <h2 id="paused-title" className="headline">
              PAUSED
            </h2>
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
                ⌂ Quit
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === "crashed" && crash && (
        <section className="overlay" aria-labelledby="busted-title" role="alertdialog">
          <div className="panel small">
            <h2 id="busted-title" className="headline busted">
              {def.crashTitle}
            </h2>
            <p className="reason">{def.crashText[crash]}</p>
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
            <h2 id="over-title" className="headline busted">
              {def.overTitle}
            </h2>
            {crash && <p className="reason">{def.crashText[crash]}</p>}
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
            <div className="home-actions">
              <button type="button" className="ghost-btn" onClick={home}>
                ⌂ Title
              </button>
              <Link href="/" className="ghost-btn">
                ▦ All games
              </Link>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function MeterBar({ meter }: { meter: Meter }) {
  const filled = meter.value * meter.segments;
  return (
    <div className={meter.active ? "meter active" : "meter"} aria-label={`${meter.label} ${Math.round(meter.value * 100)}%`}>
      <span className="meter-label">{meter.label}</span>
      <span className="meter-cells">
        {Array.from({ length: meter.segments }, (_, i) => (
          <span key={i} className="meter-cell">
            <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, filled - i))})` }} />
          </span>
        ))}
      </span>
    </div>
  );
}
