import { useEffect, useRef, useState } from "react";

// ── Metric configuration ───────────────────────────────────────────────────────
const METRICS = [
  {
    key: "sharpe_ratio",
    label: "Sharpe Ratio",
    description: "Risk-adjusted return",
    format: (v) => v.toFixed(3),
    unit: "",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    grade: (v) => {
      if (v >= 1.5) return "excellent";
      if (v >= 1.0) return "good";
      if (v >= 0.5) return "moderate";
      return "poor";
    },
    gradeLabel: (v) => {
      if (v >= 1.5) return "Excellent";
      if (v >= 1.0) return "Good";
      if (v >= 0.5) return "Moderate";
      return "Poor";
    },
    tooltip: "Sharpe > 1.0 is good. Higher = better risk-adjusted returns.",
    higher_is_better: true,
  },
  {
    key: "beta",
    label: "Portfolio Beta",
    description: "Market sensitivity",
    format: (v) => v.toFixed(3),
    unit: "×",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    grade: (v) => {
      const abs = Math.abs(v);
      if (abs <= 0.8) return "good";
      if (abs <= 1.2) return "moderate";
      if (abs <= 1.6) return "poor";
      return "danger";
    },
    gradeLabel: (v) => {
      const abs = Math.abs(v);
      if (abs <= 0.8) return "Defensive";
      if (abs <= 1.2) return "Neutral";
      if (abs <= 1.6) return "Aggressive";
      return "Very High";
    },
    tooltip: "Beta ~1.0 moves with the market. >1.2 amplifies swings.",
    higher_is_better: false,
  },
  {
    key: "var_95",
    label: "VaR (95%)",
    description: "Max daily loss",
    format: (v) => `${(v * 100).toFixed(2)}%`,
    unit: "",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    grade: (v) => {
      if (v <= 0.015) return "good";
      if (v <= 0.025) return "moderate";
      if (v <= 0.04)  return "poor";
      return "danger";
    },
    gradeLabel: (v) => {
      if (v <= 0.015) return "Low Risk";
      if (v <= 0.025) return "Moderate";
      if (v <= 0.04)  return "High Risk";
      return "Critical";
    },
    tooltip: "95% of days, losses won't exceed this. Lower is safer.",
    higher_is_better: false,
  },
  {
    key: "max_drawdown",
    label: "Max Drawdown",
    description: "Worst peak-to-trough",
    format: (v) => `${(v * 100).toFixed(2)}%`,
    unit: "",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    ),
    grade: (v) => {
      const abs = Math.abs(v);
      if (abs <= 0.15) return "good";
      if (abs <= 0.30) return "moderate";
      if (abs <= 0.50) return "poor";
      return "danger";
    },
    gradeLabel: (v) => {
      const abs = Math.abs(v);
      if (abs <= 0.15) return "Resilient";
      if (abs <= 0.30) return "Moderate";
      if (abs <= 0.50) return "Steep";
      return "Severe";
    },
    tooltip: "Largest historical loss from a peak. Closer to 0% is better.",
    higher_is_better: false,
  },
];

// ── Grade → colour palette ─────────────────────────────────────────────────────
const GRADE_COLORS = {
  excellent: { accent: "#34d399", glow: "rgba(52,211,153,0.18)", badge: "rgba(52,211,153,0.12)", text: "#34d399" },
  good:      { accent: "#6ee7f7", glow: "rgba(110,231,247,0.15)", badge: "rgba(110,231,247,0.1)",  text: "#6ee7f7" },
  moderate:  { accent: "#fbbf24", glow: "rgba(251,191,36,0.15)",  badge: "rgba(251,191,36,0.1)",   text: "#fbbf24" },
  poor:      { accent: "#f97316", glow: "rgba(249,115,22,0.18)",  badge: "rgba(249,115,22,0.1)",   text: "#f97316" },
  danger:    { accent: "#f87171", glow: "rgba(248,113,113,0.2)",  badge: "rgba(248,113,113,0.1)",  text: "#f87171" },
};

// ── Animated counter hook ──────────────────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (target === null || target === undefined) return;
    const start = performance.now();
    const from = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(from + (target - from) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

// ── Tooltip component ──────────────────────────────────────────────────────────
function Tooltip({ text }) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <svg
        width="13" height="13" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round"
        style={{ color: "rgba(255,255,255,0.25)", cursor: "help" }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {visible && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1e2a45",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "7px 11px",
          fontSize: 11.5,
          fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.75)",
          whiteSpace: "nowrap",
          zIndex: 100,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          {text}
          {/* Caret */}
          <span style={{
            position: "absolute",
            top: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1e2a45",
          }} />
        </span>
      )}
    </span>
  );
}

// ── Gauge arc (SVG semicircle) ─────────────────────────────────────────────────
function GaugeArc({ pct, color }) {
  const R = 28;
  const circumference = Math.PI * R; // half-circle
  const offset = circumference * (1 - Math.min(Math.max(pct, 0), 1));

  return (
    <svg width="72" height="40" viewBox="0 0 72 40" style={{ overflow: "visible" }}>
      {/* Track */}
      <path
        d={`M 8 36 A ${R} ${R} 0 0 1 64 36`}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Progress */}
      <path
        d={`M 8 36 A ${R} ${R} 0 0 1 64 36`}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </svg>
  );
}

// ── Single metric card ─────────────────────────────────────────────────────────
function MetricCard({ metric, value, index }) {
  const grade = metric.grade(value);
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.moderate;
  const animatedValue = useCountUp(value, 800 + index * 120);

  // Normalise value to 0–1 for gauge
  const gaugeMap = {
    sharpe_ratio: () => Math.min(Math.max(value / 2.5, 0), 1),
    beta:         () => Math.min(Math.max((2 - Math.abs(value)) / 2, 0), 1),
    var_95:       () => Math.min(Math.max(1 - value / 0.06, 0), 1),
    max_drawdown: () => Math.min(Math.max(1 - Math.abs(value) / 0.7, 0), 1),
  };
  const gaugePct = gaugeMap[metric.key]?.() ?? 0.5;

  return (
    <div
      style={{
        background: "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(10,16,34,0.95))",
        border: `1.5px solid rgba(255,255,255,0.07)`,
        borderRadius: 16,
        padding: "22px 20px 18px",
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "default",
        animation: `cardIn 0.5s ease forwards`,
        animationDelay: `${index * 0.1}s`,
        opacity: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 16px 40px rgba(0,0,0,0.4), 0 0 0 1px ${colors.accent}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Glow blob */}
      <div style={{
        position: "absolute",
        top: -30, right: -30,
        width: 100, height: 100,
        borderRadius: "50%",
        background: colors.glow,
        filter: "blur(24px)",
        pointerEvents: "none",
      }} />

      {/* Top row: icon + label + tooltip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: colors.accent, display: "flex", flexShrink: 0 }}>
          {metric.icon}
        </span>
        <span style={{
          fontSize: 12,
          fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.06em",
          fontWeight: 500,
          flex: 1,
        }}>
          {metric.label.toUpperCase()}
        </span>
        <Tooltip text={metric.tooltip} />
      </div>

      {/* Gauge + value */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
        <div style={{ position: "relative" }}>
          <GaugeArc pct={gaugePct} color={colors.accent} />
          {/* Small dot at needle tip — decorative */}
          <div style={{
            position: "absolute",
            bottom: 2, left: "50%",
            transform: "translateX(-50%)",
            width: 5, height: 5,
            borderRadius: "50%",
            background: colors.accent,
            boxShadow: `0 0 6px ${colors.accent}`,
          }} />
        </div>

        <div style={{ flex: 1, paddingBottom: 4 }}>
          <div style={{
            fontSize: 28,
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            color: "#f0f4ff",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            marginBottom: 3,
          }}>
            {metric.format(animatedValue)}
            {metric.unit && (
              <span style={{ fontSize: 16, opacity: 0.5, marginLeft: 2 }}>
                {metric.unit}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11.5,
            fontFamily: "'DM Mono', monospace",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.03em",
          }}>
            {metric.description}
          </div>
        </div>
      </div>

      {/* Grade badge */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        background: colors.badge,
        border: `1px solid ${colors.accent}40`,
      }}>
        {/* Pulsing dot */}
        <span style={{
          width: 6, height: 6,
          borderRadius: "50%",
          background: colors.accent,
          display: "inline-block",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        <span style={{
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: colors.text,
          letterSpacing: "0.07em",
          fontWeight: 500,
        }}>
          {metric.gradeLabel(value)}
        </span>
      </div>
    </div>
  );
}

// ── Sector concentration bar ───────────────────────────────────────────────────
function SectorBar({ sectors }) {
  const sorted = Object.entries(sectors).sort((a, b) => b[1] - a[1]);
  const SECTOR_COLORS = [
    "#6ee7f7", "#3b82f6", "#a78bfa", "#34d399",
    "#fbbf24", "#f97316", "#f87171", "#e879f9",
  ];

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(10,16,34,0.95))",
      border: "1.5px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px",
      gridColumn: "1 / -1",
      animation: "cardIn 0.5s ease forwards",
      animationDelay: "0.45s",
      opacity: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7f7" strokeWidth="2" strokeLinecap="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
        <span style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em",
        }}>
          SECTOR CONCENTRATION
        </span>
      </div>

      {/* Stacked progress bar */}
      <div style={{
        height: 10, borderRadius: 5,
        overflow: "hidden",
        display: "flex",
        marginBottom: 14,
        background: "rgba(255,255,255,0.05)",
      }}>
        {sorted.map(([sector, weight], i) => (
          <div
            key={sector}
            title={`${sector}: ${(weight * 100).toFixed(1)}%`}
            style={{
              width: `${weight * 100}%`,
              background: SECTOR_COLORS[i % SECTOR_COLORS.length],
              transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
        {sorted.map(([sector, weight], i) => (
          <div key={sector} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: SECTOR_COLORS[i % SECTOR_COLORS.length],
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 12, fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.55)",
            }}>
              {sector}
            </span>
            <span style={{
              fontSize: 12, fontFamily: "'DM Mono', monospace",
              color: SECTOR_COLORS[i % SECTOR_COLORS.length],
              fontWeight: 500,
            }}>
              {(weight * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Portfolio weight pills ─────────────────────────────────────────────────────
function WeightsPill({ weights }) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(10,16,34,0.95))",
      border: "1.5px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px",
      gridColumn: "1 / -1",
      animation: "cardIn 0.5s ease forwards",
      animationDelay: "0.55s",
      opacity: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7f7" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em",
        }}>
          POSITION WEIGHTS
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {sorted.map(([ticker, weight]) => (
          <div key={ticker} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(110,231,247,0.07)",
            border: "1px solid rgba(110,231,247,0.15)",
          }}>
            <span style={{
              fontSize: 13, fontFamily: "'DM Mono', monospace",
              fontWeight: 500, color: "#f0f4ff",
              letterSpacing: "0.05em",
            }}>
              {ticker}
            </span>
            <span style={{
              fontSize: 12, fontFamily: "'DM Mono', monospace",
              color: "#6ee7f7",
            }}>
              {(weight * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * RiskScoreCard
 *
 * Displays a 2×2 grid of colour-coded metric cards (Sharpe, Beta, VaR, Drawdown),
 * plus sector concentration bar and position weight pills below.
 *
 * Props:
 *   riskMetrics — object from API: { sharpe_ratio, beta, var_95, max_drawdown,
 *                                    sector_concentration, weights }
 */
export default function RiskScoreCard({ riskMetrics }) {
  if (!riskMetrics) return null;

  const { sharpe_ratio, beta, var_95, max_drawdown, sector_concentration, weights } = riskMetrics;
  const values = { sharpe_ratio, beta, var_95, max_drawdown };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1);   }
          50%      { opacity: 0.6; transform: scale(1.4); }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Section label */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 3, height: 20, borderRadius: 2,
            background: "linear-gradient(180deg, #6ee7f7, #3b82f6)",
          }} />
          <h3 style={{
            margin: 0, fontSize: 13,
            fontFamily: "'DM Mono', monospace",
            fontWeight: 500, letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.45)",
          }}>
            RISK METRICS
          </h3>
        </div>

        {/* 2×2 metric grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
        }}>
          {METRICS.map((metric, i) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              value={values[metric.key] ?? 0}
              index={i}
            />
          ))}

          {/* Sector bar spans full width */}
          {sector_concentration && Object.keys(sector_concentration).length > 0 && (
            <SectorBar sectors={sector_concentration} />
          )}

          {/* Weight pills spans full width */}
          {weights && Object.keys(weights).length > 0 && (
            <WeightsPill weights={weights} />
          )}
        </div>
      </div>
    </>
  );
}