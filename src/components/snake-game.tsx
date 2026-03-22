import { useEffect, useRef, useCallback, useState } from "react";
import * as m from "@/paraglide/messages";

// ─── types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}
type GamePhase = "idle" | "playing" | "dead";

// ─── theme ────────────────────────────────────────────────────────────────────

export interface SnakeTheme {
  /** Canvas background */
  bg: string;
  /** Subtle grid line color */
  grid: string;
  /** Snake head fill */
  snakeHead: string;
  /** Snake body fill (mid-segments) */
  snakeBody: string;
  /** Snake tail fill (faded end) */
  snakeTail: string;
  /** Food dot fill */
  food: string;
  /** Radial glow behind the food */
  foodGlow: string;
  /** Canvas border */
  border: string;
  /** Full-screen backdrop behind the game panel */
  backdrop: string;
  /**
   * Text / UI color rendered ON TOP of the backdrop.
   * For dark backdrops use a light value (e.g. '#e5e5e5').
   * For light backdrops use a dark value (e.g. '#1a1a1a').
   */
  backdropText: string;
  /** Accent color – scores, start button, d-pad */
  accent: string;
}

export const THEMES: Record<string, SnakeTheme> = {
  /** Warm off-white, ink-black snake, coral food */
  paper: {
    bg: "#f5f0eb",
    grid: "rgba(0,0,0,0.06)",
    snakeHead: "#1c1917",
    snakeBody: "#44403c",
    snakeTail: "#c8bfb5",
    food: "#c2410c",
    foodGlow: "rgba(194,65,12,0.15)",
    border: "rgba(0,0,0,0.1)",
    backdrop: "rgba(245,240,235,0.92)",
    backdropText: "#1c1917",
    accent: "#1c1917",
  },

  /** Soft blue-grey, slate snake, rose food */
  slate: {
    bg: "#f0f4f8",
    grid: "rgba(0,0,0,0.05)",
    snakeHead: "#1e3a5f",
    snakeBody: "#2d6a9f",
    snakeTail: "#b8cfe4",
    food: "#e11d48",
    foodGlow: "rgba(225,29,72,0.14)",
    border: "rgba(30,58,95,0.12)",
    backdrop: "rgba(240,244,248,0.94)",
    backdropText: "#1e3a5f",
    accent: "#1e3a5f",
  },

  /** Mint green canvas, deep teal snake, amber food */
  mint: {
    bg: "#f0faf5",
    grid: "rgba(0,0,0,0.05)",
    snakeHead: "#065f46",
    snakeBody: "#059669",
    snakeTail: "#a7f3d0",
    food: "#d97706",
    foodGlow: "rgba(217,119,6,0.18)",
    border: "rgba(6,95,70,0.12)",
    backdrop: "rgba(240,250,245,0.94)",
    backdropText: "#064e3b",
    accent: "#059669",
  },
};

// ─── constants ────────────────────────────────────────────────────────────────

const COLS = 20;
const ROWS = 20;
const CELL = 16;
const TICK_MS = 140;
const SIZE = COLS * CELL; // 320

// ─── helpers ──────────────────────────────────────────────────────────────────

function mkSnake(): Point[] {
  return [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
}

function spawnFood(snake: Point[]): Point {
  let f: Point;
  do {
    f = { x: ~~(Math.random() * COLS), y: ~~(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === f.x && s.y === f.y));
  return f;
}

// ─── props ────────────────────────────────────────────────────────────────────

export interface SnakeGameProps {
  /**
   * Preset name or full SnakeTheme object.
   *
   * Presets: 'paper' (default) | 'slate' | 'mint'
   *
   * @example
   * <SnakeGame theme="mint" />
   * <SnakeGame theme={{ ...THEMES.paper, food: '#7c3aed' }} />
   */
  theme?: keyof typeof THEMES | SnakeTheme;

  /** Trigger button label. Defaults to i18n 'snake_game_trigger' */
  triggerLabel?: string;

  /** Optional className on the trigger button */
  className?: string;

  /** Callback when game modal open state changes */
  onOpenChange?: (open: boolean) => void;

  /**
   * When true, render game inline inside parent instead of fullscreen modal.
   * Game is always visible when inline=true (no open/close state needed).
   */
  inline?: boolean;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SnakeGame({
  theme = "paper",
  triggerLabel,
  className,
  onOpenChange,
  inline = false,
}: SnakeGameProps) {
  const t: SnakeTheme = typeof theme === "string" ? (THEMES[theme] ?? THEMES.paper) : theme;

  const [open, setOpen] = useState(inline ? true : false);
  const handleSetOpen = useCallback(
    (value: boolean) => {
      // console.log('[SnakeGame] handleSetOpen called:', value, new Date().toISOString())
      // console.trace('[SnakeGame] handleSetOpen stack')
      setOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange]
  );
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [score, setScore] = useState(0);
  const [_best, setBest] = useState(0);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<GamePhase>("idle");
  const snakeRef = useRef<Point[]>(mkSnake());
  const dirRef = useRef<Point>({ x: 1, y: 0 });
  const nextDir = useRef<Point>({ x: 1, y: 0 });
  const foodRef = useRef<Point>(spawnFood(snakeRef.current));
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const themeRef = useRef(t);
  themeRef.current = t;

  // ── draw ────────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const c = themeRef.current;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, SIZE);
      ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * CELL);
      ctx.lineTo(SIZE, j * CELL);
      ctx.stroke();
    }

    const f = foodRef.current;
    const fx = f.x * CELL + CELL / 2,
      fy = f.y * CELL + CELL / 2;
    const grd = ctx.createRadialGradient(fx, fy, 1, fx, fy, CELL * 1.5);
    grd.addColorStop(0, c.foodGlow);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.fillRect((f.x - 1) * CELL, (f.y - 1) * CELL, CELL * 3, CELL * 3);
    ctx.beginPath();
    ctx.arc(fx, fy, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = c.food;
    ctx.fill();

    snakeRef.current.forEach((s, i) => {
      ctx.beginPath();
      ctx.roundRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? 4 : 3);
      const r = i / snakeRef.current.length;
      ctx.fillStyle = i === 0 ? c.snakeHead : r < 0.5 ? c.snakeBody : c.snakeTail;
      ctx.fill();
    });
  }, []);

  // ── tick ────────────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    dirRef.current = nextDir.current;
    const snake = snakeRef.current;
    const head: Point = {
      x: (snake[0].x + dirRef.current.x + COLS) % COLS,
      y: (snake[0].y + dirRef.current.y + ROWS) % ROWS,
    };
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      phaseRef.current = "dead";
      setPhase("dead");
      timerRef.current && clearInterval(timerRef.current);
      draw();
      return;
    }
    snake.unshift(head);
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      const n = scoreRef.current + 1;
      scoreRef.current = n;
      setScore(n);
      if (n > bestRef.current) {
        bestRef.current = n;
        setBest(n);
      }
      foodRef.current = spawnFood(snake);
    } else {
      snake.pop();
    }
    draw();
  }, [draw]);

  // ── start / close ───────────────────────────────────────────────────────────

  const start = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current);
    snakeRef.current = mkSnake();
    dirRef.current = nextDir.current = { x: 1, y: 0 };
    foodRef.current = spawnFood(snakeRef.current);
    scoreRef.current = 0;
    setScore(0);
    phaseRef.current = "playing";
    setPhase("playing");
    draw();
    timerRef.current = setInterval(tick, TICK_MS);
  }, [draw, tick]);

  const close = useCallback(() => {
    // console.log('[SnakeGame] close() called', new Date().toISOString())
    // console.trace('[SnakeGame] close stack')
    timerRef.current && clearInterval(timerRef.current);
    phaseRef.current = "idle";
    setPhase("idle");
    setScore(0);
    handleSetOpen(false);
  }, [handleSetOpen]);

  // ── keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const map: Record<string, Point> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      if (dirRef.current.x === -d.x && dirRef.current.y === -d.y) return;
      nextDir.current = d;
      if (phaseRef.current !== "playing") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, start, close]);

  // ── init on open ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    snakeRef.current = mkSnake();
    foodRef.current = spawnFood(snakeRef.current);
    scoreRef.current = 0;
    setScore(0);
    phaseRef.current = "idle";
    setPhase("idle");
    requestAnimationFrame(draw);
    if (inline) {
      // In inline mode, auto-start the game
      start();
    }
  }, [open, draw, inline, start]);

  // ── inline mode: notify parent on mount ─────────────────────────────────────

  useEffect(() => {
    if (inline) {
      // In inline mode, game is always visible, so notify parent it's "open"
      // open is already true (initialized as inline), but we still need to notify
      handleSetOpen(true);
    }
  }, [inline, handleSetOpen]);

  const dpad = (d: Point) => {
    if (dirRef.current.x === -d.x && dirRef.current.y === -d.y) return;
    nextDir.current = d;
    if (phaseRef.current !== "playing") start();
  };

  // ─── inline game content (reused in both inline and modal modes) ────────────

  const gameContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        userSelect: "none",
      }}
    >
      {/* score row */}
      {/* <div style={{ width: SIZE, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                    <Stat label="score" value={score} color={t.backdropText} accent={t.accent} />
                    <Stat label="best" value={best} color={t.backdropText} accent={t.accent} dim />
                </div>
                {!inline && <CloseBtn color={t.backdropText} onClick={close} />}
            </div> */}

      {/* canvas */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={cvRef}
          width={SIZE}
          height={SIZE}
          style={{ display: "block", borderRadius: 6, border: `1px solid ${t.border}` }}
        />

        {phase !== "playing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 6,
              background: `${t.bg}d0`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            {phase === "dead" && (
              <span style={{ fontSize: 12, color: t.food, letterSpacing: "0.08em" }}>
                {score} 分
              </span>
            )}
            <button
              onClick={start}
              style={{
                padding: "7px 24px",
                borderRadius: 3,
                border: `1px solid ${t.accent}`,
                background: "transparent",
                color: t.accent,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.08em",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {phase === "dead" ? m.snake_game_play_again() : m.snake_game_start()}
            </button>
            {phase === "idle" && (
              <span style={{ fontSize: 10, color: t.accent, opacity: 0.4, letterSpacing: "0.1em" }}>
                {m.snake_game_controls?.()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* d-pad */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,38px)",
          gridTemplateRows: "repeat(2,38px)",
          gap: 4,
        }}
      >
        <DPadBtn col={2} row={1} label="↑" color={t.accent} onPress={() => dpad({ x: 0, y: -1 })} />
        <DPadBtn col={1} row={2} label="←" color={t.accent} onPress={() => dpad({ x: -1, y: 0 })} />
        <DPadBtn col={2} row={2} label="↓" color={t.accent} onPress={() => dpad({ x: 0, y: 1 })} />
        <DPadBtn col={3} row={2} label="→" color={t.accent} onPress={() => dpad({ x: 1, y: 0 })} />
      </div>
    </div>
  );

  // ─── render ─────────────────────────────────────────────────────────────────

  if (inline) {
    // Inline mode: render game content directly without backdrop
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {gameContent}
      </div>
    );
  }

  return (
    <>
      {/* trigger */}
      <button
        className={className}
        onClick={() => handleSetOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 4,
          border: `1px solid ${t.accent}33`,
          background: "transparent",
          color: t.accent,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.04em",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <GridIcon color={t.accent} />
        {triggerLabel ?? m.snake_game_trigger?.()}
      </button>

      {/* modal overlay */}
      {open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: t.backdrop,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "snk-in 0.15s ease",
          }}
        >
          <style>{`@keyframes snk-in { from { opacity:0 } to { opacity:1 } }`}</style>
          {gameContent}
        </div>
      )}
    </>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

// function Stat({ label, value, color, accent, dim }: {
//     label: string; value: number; color: string; accent: string; dim?: boolean
// }) {
//     return (
//         <div style={{ lineHeight: 1 }}>
//             <div style={{ fontSize: 9, color: accent, opacity: 0.45, letterSpacing: '0.12em', marginBottom: 2 }}>
//                 {label.toUpperCase()}
//             </div>
//             <div style={{ fontSize: 18, color, opacity: dim ? 0.35 : 1, fontVariantNumeric: 'tabular-nums' }}>
//                 {value}
//             </div>
//         </div>
//     )
// }

// function CloseBtn({ color, onClick }: { color: string; onClick: () => void }) {
//     return (
//         <button
//             onClick={onClick}
//             aria-label="关闭"
//             style={{
//                 width: 26, height: 26, borderRadius: 3,
//                 border: `1px solid ${color}28`,
//                 background: 'transparent', color: `${color}66`,
//                 fontSize: 13, cursor: 'pointer',
//                 display: 'flex', alignItems: 'center', justifyContent: 'center',
//                 transition: 'opacity 0.15s', fontFamily: 'inherit', lineHeight: 1,
//             }}
//             onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
//             onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
//         >
//             ✕
//         </button>
//     )
// }

function DPadBtn({
  col,
  row,
  label,
  color,
  onPress,
}: {
  col: number;
  row: number;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      style={{
        gridColumn: col,
        gridRow: row,
        width: 38,
        height: 38,
        borderRadius: 3,
        border: `1px solid ${color}22`,
        background: `${color}0c`,
        color: `${color}aa`,
        fontSize: 15,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.1s",
        fontFamily: "inherit",
      }}
      onPointerEnter={(e) => (e.currentTarget.style.background = `${color}20`)}
      onPointerLeave={(e) => (e.currentTarget.style.background = `${color}0c`)}
    >
      {label}
    </button>
  );
}

function GridIcon({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill={color} opacity={0.6}>
      {[0, 4, 8].flatMap((x) =>
        [0, 4, 8].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width={2} height={2} rx={0.5} />)
      )}
    </svg>
  );
}
