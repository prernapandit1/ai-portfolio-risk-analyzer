import { useEffect, useRef, useState } from "react";

// ── Bullet icon variants ───────────────────────────────────────────────────────
const BULLET_ICONS = [
  // Rebalance / scale
  <svg key="0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>,
  // Shield / protect
  <svg key="1" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>,
  // Pie chart / diversify
  <svg key="2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
  </svg>,
  // Trending up
  <svg key="3" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>,
];

// ── Typewriter hook ────────────────────────────────────────────────────────────
function useTypewriter(text, speed = 18, startDelay = 0) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) { setDisplayed(""); setDone(false); return; }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [text, speed, startDelay]);

  return { displayed, done };
}

// ── Animated border canvas ─────────────────────────────────────────────────────
function GlowBorder({ containerRef }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    let t = 0;

    const resize = () => {
      canvas.width  = container.offsetWidth;
      canvas.height = container.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);

      // Animated gradient angle
      t += 0.008;
      const cx = W / 2 + Math.cos(t) * W * 0.35;
      const cy = H / 2 + Math.sin(t * 0.7) * H * 0.35;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
      grad.addColorStop(0,   "rgba(110,231,247,0.55)");
      grad.addColorStop(0.4, "rgba(167,139,250,0.3)");
      grad.addColorStop(1,   "rgba(59,130,246,0.0)");

      const r = 20; // border-radius
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(W - r, 0);
      ctx.quadraticCurveTo(W, 0, W, r);
      ctx.lineTo(W, H - r);
      ctx.quadraticCurveTo(W, H, W - r, H);
      ctx.lineTo(r, H);
      ctx.quadraticCurveTo(0, H, 0, H - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [containerRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        pointerEvents: "none", zIndex: 1,
        borderRadius: 20,
      }}
    />
  );
}

// ── Single advice bullet ───────────────────────────────────────────────────────
function BulletCard({ text, index, totalDelay }) {
  const { displayed, done } = useTypewriter(text, 14, totalDelay);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), totalDelay - 80);
    return () => clearTimeout(t);
  }, [totalDelay]);

  const icon  = BULLET_ICONS[index % BULLET_ICONS.length];
  const color = ["#6ee7f7", "#a78bfa", "#34d399", "#fbbf24"][index % 4];

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "14px 16px",
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(10px)",
      transition: "opacity 0.4s ease, transform 0.4s ease",
    }}>
      {/* Icon badge */}
      <div style={{
        width: 30, height: 30, flexShrink: 0,
        borderRadius: 8,
        background: `${color}15`,
        border: `1px solid ${color}35`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
        marginTop: 1,
      }}>
        {icon}
      </div>

      {/* Text + blinking cursor */}
      <p style={{
        margin: 0, flex: 1,
        fontSize: 13.5,
        fontFamily: "'DM Mono', monospace",
        color: "rgba(255,255,255,0.78)",
        lineHeight: 1.65,
        letterSpacing: "0.01em",
      }}>
        {displayed}
        {!done && (
          <span style={{
            display: "inline-block",
            width: 2, height: "1em",
            background: color,
            marginLeft: 2,
            verticalAlign: "text-bottom",
            animation: "cursorBlink 0.7s step-end infinite",
          }} />
        )}
      </p>
    </div>
  );
}

// ── Input summary table ────────────────────────────────────────────────────────
function InputSummary({ summary }) {
  if (!summary || !Object.keys(summary).length) return null;

  const rows = [
    { label: "Sharpe Ratio",    value: summary.sharpe_ratio?.toFixed(3) },
    { label: "Beta",            value: summary.beta?.toFixed(3) },
    { label: "VaR 95%",         value: summary.var_95_pct != null ? `${summary.var_95_pct}% daily` : null },
    { label: "Max Drawdown",    value: summary.max_drawdown_pct != null ? `${summary.max_drawdown_pct}%` : null },
    { label: "Highest β Stock", value: summary.highest_beta_stock },
    { label: "Dominant Sector", value: summary.dominant_sector },
  ].filter((r) => r.value != null);

  return (
    <div style={{
      marginTop: 18,
      borderTop: "1px solid rgba(255,255,255,0.07)",
      paddingTop: 16,
    }}>
      <div style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em",
        marginBottom: 10,
      }}>
        ANALYSIS INPUTS USED
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
        {rows.map(({ label, value }) => (
          <div key={label} style={{
            display: "flex", justifyContent: "space-between",
            gap: 8,
            fontSize: 11, fontFamily: "'DM Mono', monospace",
          }}>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
            <span style={{ color: "rgba(255,255,255,0.6)", textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fallback banner ────────────────────────────────────────────────────────────
function FallbackBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      background: "rgba(251,191,36,0.07)",
      border: "1px solid rgba(251,191,36,0.2)",
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 11,
      fontFamily: "'DM Mono', monospace",
      color: "rgba(251,191,36,0.8)",
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Running in rule-based fallback mode — set OPENAI_API_KEY for GPT advice
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * AIAdvisorPanel
 *
 * Displays AI-generated portfolio rebalancing bullets with:
 *  - Animated canvas glow border
 *  - Typewriter reveal per bullet
 *  - Icon-badged bullet cards
 *  - GPT / fallback model badge
 *  - Collapsible input summary table
 *
 * Props:
 *   aiAdvice — { bullets: string[], model: string, input_summary: object }
 *              as returned by /api/analyze
 */
export default function AIAdvisorPanel({ aiAdvice }) {
  const containerRef = useRef(null);
  const [expanded, setExpanded]  = useState(false);

  if (!aiAdvice) return null;

  const { bullets = [], model = "", input_summary = {} } = aiAdvice;
  const isFallback = model === "rule-based-fallback" || model === "error";
  const isGPT      = model.startsWith("gpt");

  // Stagger: each bullet starts after the previous finishes (~chars × speed ms)
  // Estimate ~65 chars avg per bullet at 14ms each ≈ 910ms + 200ms gap
  const BULLET_AVG_MS = 1000;
  const BULLET_GAP_MS = 200;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        @keyframes cursorBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes shimmerText {
          from { background-position: -200% center; }
          to   { background-position:  200% center; }
        }
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(110,231,247,0); }
          50%      { box-shadow: 0 0 10px 2px rgba(110,231,247,0.2); }
        }
      `}</style>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          background: "linear-gradient(145deg, rgba(12,20,40,0.96), rgba(8,14,30,0.99))",
          border: "1.5px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          padding: "24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
          fontFamily: "'Syne', sans-serif",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        {/* Animated glow border canvas */}
        <GlowBorder containerRef={containerRef} />

        {/* Content sits above canvas */}
        <div style={{ position: "relative", zIndex: 2 }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                {/* Animated brain icon */}
                <div style={{
                  width: 32, height: 32,
                  background: "linear-gradient(135deg, #6ee7f7, #a78bfa)",
                  borderRadius: 9,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  animation: "badgePulse 3s ease-in-out infinite",
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14"/>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14"/>
                  </svg>
                </div>

                <div>
                  <h3 style={{
                    margin: 0, fontSize: 16, fontWeight: 800,
                    letterSpacing: "-0.02em",
                    background: "linear-gradient(90deg, #6ee7f7, #a78bfa, #6ee7f7)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    animation: "shimmerText 4s linear infinite",
                  }}>
                    AI Portfolio Advisor
                  </h3>
                </div>
              </div>

              <p style={{
                margin: 0, fontSize: 12,
                fontFamily: "'DM Mono', monospace",
                color: "rgba(255,255,255,0.3)",
              }}>
                {bullets.length} rebalancing recommendations
              </p>
            </div>

            {/* Model badge */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
            }}>
              {isGPT && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px",
                  borderRadius: 20,
                  background: "linear-gradient(135deg, rgba(110,231,247,0.12), rgba(167,139,250,0.12))",
                  border: "1px solid rgba(110,231,247,0.25)",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6ee7f7" strokeWidth="2" strokeLinecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  <span style={{
                    fontSize: 10.5, fontFamily: "'DM Mono', monospace",
                    color: "#6ee7f7", letterSpacing: "0.06em",
                  }}>
                    POWERED BY GPT
                  </span>
                </div>
              )}
              <div style={{
                fontSize: 10, fontFamily: "'DM Mono', monospace",
                color: "rgba(255,255,255,0.2)",
                letterSpacing: "0.05em",
              }}>
                {model}
              </div>
            </div>
          </div>

          {/* Fallback warning */}
          {isFallback && <FallbackBanner />}

          {/* ── Bullet cards ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bullets.map((bullet, i) => (
              <BulletCard
                key={`${bullet.slice(0, 20)}-${i}`}
                text={bullet}
                index={i}
                totalDelay={i * (BULLET_AVG_MS + BULLET_GAP_MS)}
              />
            ))}
          </div>

          {/* ── Disclaimer ── */}
          <div style={{
            marginTop: 18,
            display: "flex", alignItems: "flex-start", gap: 7,
            padding: "10px 13px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 9,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{
              margin: 0, fontSize: 11,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.25)",
              lineHeight: 1.6,
            }}>
              AI-generated suggestions are for informational purposes only and do not constitute
              financial advice. Consult a licensed financial advisor before making investment decisions.
            </p>
          </div>

          {/* ── Collapsible input summary ── */}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 14,
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              padding: "4px 0",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11, color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.06em",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.25s",
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            {expanded ? "Hide" : "Show"} analysis inputs
          </button>

          {expanded && <InputSummary summary={input_summary} />}
        </div>
      </div>
    </>
  );
}