"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { GAMES } from "@/games/registry";
import { ARCADE_NAME, AUTHOR, HEADLINES } from "@/games/shared/constants";
import type { GameDef } from "@/games/shared/types";
import { mutedPref } from "@/lib/stored";

import { useInstallPrompt, useIosInstallHint } from "./pwa";

const GENRES: Record<string, string> = { run: "Runner", drive: "Racer", rail: "Rail rush" };

/** Live autopilot preview of a game, drawn only while the card is on screen. */
function Preview({ def }: { def: GameDef }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;
    const game = def.create({}, true);
    for (let i = 0; i < 60; i++) game.update(0.05);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    let view = def.makeView(1, 1);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      view = def.makeView(w, h);
      def.render(ctx, view, game, 3);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let visible = false;
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let clock = 3;
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden || still) return;
      // 30 fps is plenty for a thumbnail and keeps three previews cheap.
      acc += dt;
      if (acc < 1 / 30) return;
      game.update(acc);
      clock += acc;
      acc = 0;
      def.render(ctx, view, game, clock);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      seen.disconnect();
    };
  }, [def]);

  return <canvas ref={ref} className="card-canvas" aria-hidden />;
}

function GameCard({ def, index }: { def: GameDef; index: number }) {
  const best = def.best.useValue();
  return (
    <Link href={`/${def.id}/`} className="game-card" style={{ "--game": def.color } as React.CSSProperties}>
      <div className="card-media">
        <Preview def={def} />
        <span className="card-num">0{index + 1}</span>
        <span className="card-genre">{GENRES[def.id]}</span>
      </div>
      <div className="card-body">
        <h2 className="card-title">
          {def.title} <span>{def.titleAccent}</span>
        </h2>
        <p className="card-blurb">{def.blurb}</p>
        <div className="card-foot">
          <span className="card-best">{best > 0 ? `Best ${best.toLocaleString()}` : "Not played yet"}</span>
          <span className="card-play">
            ▶ <span>Play</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function Hub() {
  const muted = mutedPref.useValue() === 1;
  const { canInstall, install } = useInstallPrompt();
  const iosHint = useIosInstallHint();

  return (
    <main className="hub">
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

      <header className="hub-header">
        <p className="eyebrow">Paper leak • Vote chori • Corruption</p>
        <h1 className="hub-title" aria-label={ARCADE_NAME}>
          BARRICADE<span>ARCADE</span>
        </h1>
        <p className="hub-sub">Three street games from the protest. Run with the march, drive through the chakka jam, ride the rails at the rail roko.</p>
        <p className="author-chip">
          <span className="author-dot" aria-hidden /> by {AUTHOR}
        </p>
      </header>

      <section className="game-grid" aria-label="Games">
        {GAMES.map((def, i) => (
          <GameCard key={def.id} def={def} index={i} />
        ))}
      </section>

      <footer className="hub-footer">
        <div className="home-actions">
          {canInstall && (
            <button type="button" className="ghost-btn" onClick={install}>
              ⤓ Install app
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={() => mutedPref.set(muted ? 0 : 1)} aria-pressed={muted}>
            {muted ? "🔇 Sound off" : "🔊 Sound on"}
          </button>
        </div>
        {iosHint && <p className="ios-hint">To install on iPhone: tap Share, then &quot;Add to Home Screen&quot;.</p>}
        <p className="credit">
          Designed and built by <b>{AUTHOR}</b> • Works offline • No real politicians or parties are named
        </p>
      </footer>
    </main>
  );
}
