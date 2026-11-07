"use client";

import Link from "next/link";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { Sfx } from "@/games/shared/audio";
import { AUTHOR, LIFELINE_DECISION_TIME, MAX_LIFELINES } from "@/games/shared/constants";
import type { View } from "@/games/shared/scene";
import type { Action, ArcadeGame, GameDef, Meter, Scene3D, Speech } from "@/games/shared/types";
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

/** Reads announcements aloud with the device's voices: Marathi, Hindi and English (Indian) where available. */
function speak(lines: Speech[]) {
  if (typeof window === "undefined" || !window.speechSynthesis || mutedPref.get() === 1) return;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  synth.cancel();
  for (const line of lines) {
    const base = line.lang.slice(0, 2);
    // No Marathi voice? A Hindi one reads Devanagari fine.
    const voice =
      voices.find((v) => v.lang === line.lang) ?? voices.find((v) => v.lang.startsWith(base)) ?? (base === "mr" ? voices.find((v) => v.lang.startsWith("hi")) : undefined);
    if (!voice && base !== "en") continue;
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = voice?.lang ?? line.lang;
    if (voice) u.voice = voice;
    u.rate = 0.92;
    u.pitch = 1.05;
    synth.speak(u);
  }
}
const EMPTY_HUD: Hud = { score: 0, coins: 0, distance: 0, lifelines: 1, chase: false, meter: null };
/** Pixels of drag for full speed on the floating joystick. */
const STICK_PX = 56;

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
};

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
  const glRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const gameRef = useRef<ArcadeGame | null>(null);
  const demoRef = useRef<ArcadeGame | null>(null);
  const screenRef = useRef<Screen>("home");
  const sfxRef = useRef<Sfx | null>(null);
  const swipeRef = useRef<{ x: number; y: number; done: boolean; t: number } | null>(null);
  /** 360° look drag in progress: last pointer position. */
  const lookRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  /** Touch points for pinch zoom, and the last pinch distance. */
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef(new Set<string>());
  const stick = def.control === "stick";

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
    if (next !== "playing") {
      heldRef.current.clear();
      gameRef.current?.steer?.(0, 0);
      sfxRef.current?.setRumble(0);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (stickRef.current) stickRef.current.style.display = "none";
    }
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
        onSpeak: speak,
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
    // 2D games: an opaque canvas, so the browser can skip blending. 3D games: a transparent HUD layer
    // over the WebGL canvas.
    const ctx = canvas?.getContext("2d", { alpha: !!def.scene3d });
    if (!canvas || !ctx) return;
    let scene3d: Scene3D | null = null;
    let disposed = false;
    if (def.scene3d && glRef.current) {
      def
        .scene3d(glRef.current)
        .then((sc) => {
          if (disposed) {
            sc.dispose();
            return;
          }
          scene3d = sc;
          resize();
          // If the GPU drops the 3D context (low memory, too many tabs), carry on in 2D.
          glRef.current?.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            scene3d = null;
            if (glRef.current) glRef.current.style.display = "none";
          });
        })
        .catch(() => {
          // No WebGL: keep the 2D renderer.
        });
    }
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
      scene3d?.resize(w, h, scale);
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
        if (scene3d && def.overlay3d) {
          scene3d.render(game, clock, live ? dt : 0);
          ctx.clearRect(0, 0, viewRef.current.w, viewRef.current.h);
          def.overlay3d(ctx, viewRef.current, game, clock, scene3d.project);
        } else {
          def.render(ctx, viewRef.current, game, clock);
        }
      }
      if (s === "playing" && gameRef.current) {
        const g = gameRef.current;
        sfxRef.current?.setSiren(g.chaseT > 0);
        if (g.rumble !== undefined) sfxRef.current?.setRumble(g.rumble);
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
      disposed = true;
      scene3d?.dispose();
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
        // + / - zoom the 3D camera.
        if (def.look3d && ["Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(e.code)) {
          e.preventDefault();
          gameRef.current?.zoomBy?.(e.code === "Equal" || e.code === "NumpadAdd" ? 1.15 : 1 / 1.15);
          return;
        }
        if (stick) {
          if (MOVE_KEYS[e.code]) {
            e.preventDefault();
            heldRef.current.add(e.code);
            steerFromKeys();
            return;
          }
          if (def.look3d && (e.code === "KeyQ" || e.code === "KeyE")) {
            e.preventDefault();
            gameRef.current?.look?.(e.code === "KeyQ" ? 0.12 : -0.12, 0);
            return;
          }
          const button = def.buttons?.find((b) => b.keys.includes(e.code));
          if (button) {
            e.preventDefault();
            if (!e.repeat) act(button.action);
            return;
          }
          if (e.code === "Space" || e.code === "Enter") {
            e.preventDefault();
            if (!e.repeat) act("up");
          }
          return;
        }
        if (def.look3d && (e.code === "KeyQ" || e.code === "KeyE")) {
          e.preventDefault();
          gameRef.current?.look?.(e.code === "KeyQ" ? 0.12 : -0.12, 0);
          return;
        }
        const button = def.buttons?.find((b) => b.keys.includes(e.code));
        if (button) {
          e.preventDefault();
          if (!e.repeat) act(button.action);
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
    const steerFromKeys = () => {
      let x = 0;
      let y = 0;
      for (const code of heldRef.current) {
        x += MOVE_KEYS[code][0];
        y += MOVE_KEYS[code][1];
      }
      gameRef.current?.steer?.(Math.sign(x), Math.sign(y));
      if (x || y) setHint(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!stick || !heldRef.current.delete(e.code)) return;
      steerFromKeys();
    };
    const onBlur = () => {
      heldRef.current.clear();
      gameRef.current?.steer?.(0, 0);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [act, def, go, pause, start, spendLifeline, stick]);

  // Swipe anywhere on the play area. No on-screen buttons, so the whole screen stays visible.
  // Stick games: a floating joystick wherever the thumb lands; a quick tap is the action.
  const placeStick = (x: number, y: number, kx: number, ky: number) => {
    const el = stickRef.current;
    if (!el) return;
    el.style.display = "block";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const knob = el.firstElementChild as HTMLElement | null;
    if (knob) knob.style.transform = `translate(${kx}px, ${ky}px)`;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (screenRef.current !== "playing") return;
    if (def.look3d && e.pointerType === "touch") {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) {
        // Two fingers: pinch to zoom instead of looking or swiping.
        const [a, b] = [...touchesRef.current.values()];
        pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
        lookRef.current = null;
        swipeRef.current = null;
        return;
      }
    }
    if (def.look3d && (e.pointerType === "mouse" || e.clientX > window.innerWidth * 0.55)) {
      lookRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    swipeRef.current = { x: e.clientX, y: e.clientY, done: false, t: performance.now() };
    if (stick) placeStick(e.clientX, e.clientY, 0, 0);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current !== null && touchesRef.current.size >= 2) {
      const [a, b] = [...touchesRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && pinchRef.current > 0) gameRef.current?.zoomBy?.(d / pinchRef.current);
      pinchRef.current = d;
      return;
    }
    const lk = lookRef.current;
    if (lk && lk.id === e.pointerId) {
      const dx = e.clientX - lk.x;
      const dy = e.clientY - lk.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) lk.moved = true;
      gameRef.current?.look?.(-dx * 0.006, -dy * 0.004);
      lk.x = e.clientX;
      lk.y = e.clientY;
      return;
    }
    const sw = swipeRef.current;
    if (stick) {
      if (!sw || screenRef.current !== "playing") return;
      const dx = e.clientX - sw.x;
      const dy = e.clientY - sw.y;
      const len = Math.hypot(dx, dy);
      if (len < 6) return;
      sw.done = true;
      const k = Math.min(1, len / STICK_PX);
      gameRef.current?.steer?.((dx / len) * k, (dy / len) * k);
      const knob = Math.min(len, STICK_PX);
      placeStick(sw.x, sw.y, (dx / len) * knob, (dy / len) * knob);
      setHint(false);
      return;
    }
    if (!sw || sw.done) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    sw.done = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? "left" : "right");
    else act(dy < 0 ? "up" : "down");
  };
  const onPointerUp = (e: PointerEvent) => {
    touchesRef.current.delete(e.pointerId);
    if (pinchRef.current !== null) {
      if (touchesRef.current.size < 2) pinchRef.current = null;
      return;
    }
    const lk = lookRef.current;
    if (lk && lk.id === e.pointerId) {
      lookRef.current = null;
      // In stick games a tap without dragging still counts as the action.
      if (!lk.moved && stick) act("up");
      return;
    }
    const sw = swipeRef.current;
    if (stick) {
      if (sw && !sw.done && performance.now() - sw.t < 300) act("up");
      gameRef.current?.steer?.(0, 0);
      if (stickRef.current) stickRef.current.style.display = "none";
    }
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
      onWheel={(e) => {
        if (def.look3d && screenRef.current === "playing") gameRef.current?.zoomBy?.(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }}
    >
      {def.scene3d && <canvas ref={glRef} className="game-canvas" aria-hidden />}
      <canvas ref={canvasRef} className="game-canvas" aria-label={def.canvasLabel} role="img" />

      {screen === "playing" && (
        <>
          <div className={def.hud === "minimal" ? "hud hud-minimal" : "hud"}>
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
          {hud.chase && def.hud !== "minimal" && <div className="chase-banner">{def.chaseText}</div>}
          {def.buttons && (
            <div className="action-pad" role="group" aria-label="Moves">
              {def.buttons.filter((b) => b.touch !== false).map((b) => (
                <button
                  key={b.action}
                  type="button"
                  className={`act-btn act-${b.action}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    act(b.action);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {hud.meter && <MeterBar meter={hud.meter} />}
          <div className="stick" ref={stickRef} aria-hidden>
            <span />
          </div>
          {hint && (
            <div className="swipe-hint" aria-hidden>
              <div className="swipe-hand" />
              <p>{def.look3d ? (stick ? "Left side: move • Right side: look around" : "Swipe left side • Drag right side to look around") : stick ? "Drag to move" : "Swipe anywhere"}</p>
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
                <dt>{def.resultLabels?.[0] ?? "Distance"}</dt>
                <dd>
                  {result.distance.toLocaleString()}
                  {def.resultUnit ?? " m"}
                </dd>
              </div>
              <div>
                <dt>{def.resultLabels?.[1] ?? "Coins"}</dt>
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
