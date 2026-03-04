import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt$ = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const fmtK = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return fmt$(v);
};

// Downsample to N evenly-spaced points for performance
function downsample(arr, n) {
  if (!arr || arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const p95 = payload.find((p) => p.dataKey === "p95")?.value;
  const p50 = payload.find((p) => p.dataKey === "p50")?.value;
  const p5  = payload.find((p) => p.dataKey === "p5")?.value;
  const spread = p95 && p5 ? p95 - p5 : null;

  return (
    <div style={{
      background: "rgba(10,16,34,0.97)",
      border: "1.5px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      padding: "13px 16px",
      boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
      fontFamily: "'DM Mono', monospace",
      minWidth: 190,
    }}>
      <div style={{
        fontSize: 11, color: "rgba(255,255,255,0.4)",
        marginBottom: 10, letterSpacing: "0.08em",
      }}>
        DAY {label}
      </div>

      {[
        { label: "Optimistic (95th)",  value: p95, color: "#34d399" },
        { label: "Median (50th)",       value: p50, color: "#6ee7f7" },
        { label: "Pessimistic (5th)",   value: p5,  color: "#f87171" },
      ].map(({ label, value, color }) => value != null && (
        <div key={label} style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 16, marginBottom: 6,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            {label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color }}>{fmt$(value)}</span>
        </div>
      ))}

      {spread != null && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "space-between",
          fontSize: 11,
        }}>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>Outcome spread</span>
          <span style={{ color: "#fbbf24" }}>{fmt$(spread)}</span>
        </div>
      )}
    </div>
  );
}

// ── Summary stat pill ──────────────────────────────────────────────────────────
function StatPill({ label, value, color, sub }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      padding: "12px 16px",
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontFamily: "'Syne', sans-serif",
        fontWeight: 800, color, letterSpacing: "-0.02em", lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10.5, fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.25)", marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Custom legend ──────────────────────────────────────────────────────────────
function CustomLegend() {
  const items = [
    { color: "#34d399", label: "95th Percentile", dash: false, desc: "Optimistic" },
    { color: "#6ee7f7", label: "50th Percentile", dash: false, desc: "Median" },
    { color: "#f87171", label: "5th Percentile",  dash: false, desc: "Pessimistic" },
  ];

  return (
    <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
      {items.map(({ color, label, desc }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 24, height: 3, borderRadius: 2,
            background: color,
          }} />
          <span style={{
            fontSize: 11.5, fontFamily: "'DM Mono', monospace",
            color: "rgba(255,255,255,0.55)",
          }}>
            <span style={{ color }}>{label}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>· {desc}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
/**
 * MonteCarloChart
 *
 * Renders a fan chart showing the 5th / 50th / 95th percentile paths of a
 * 1 000-run Monte Carlo simulation over 252 trading days.
 *
 * Props:
 *   monteCarloData — { days: number[], p5: number[], p50: number[], p95: number[] }
 *                    as returned by the /api/analyze endpoint.
 */
export default function MonteCarloChart({ monteCarloData }) {
  const [highlightDay, setHighlightDay] = useState(null);

  // ── Build chart data ─────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!monteCarloData?.days) return [];
    const { days, p5, p50, p95 } = monteCarloData;
    const raw = days.map((d, i) => ({
      day: d,
      p5:  p5[i],
      p50: p50[i],
      p95: p95[i],
      // Recharts area between p5 and p95 → pass as [p5, p95] band
      band: [p5[i], p95[i]],
    }));
    // Downsample to 130 points — visually identical, much faster
    return downsample(raw, 130);
  }, [monteCarloData]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const last = chartData[chartData.length - 1];
    const first = chartData[0];
    const medianReturn = ((last.p50 - first.p50) / first.p50) * 100;
    const worstCase    = ((last.p5  - first.p5)  / first.p5)  * 100;
    const bestCase     = ((last.p95 - first.p95) / first.p95) * 100;
    return { last, medianReturn, worstCase, bestCase, initial: first.p50 };
  }, [chartData]);

  // ── Y-axis domain with 5% padding ────────────────────────────────────────────
  const yDomain = useMemo(() => {
    if (!chartData.length) return ["auto", "auto"];
    const allVals = chartData.flatMap((d) => [d.p5, d.p95]);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.05;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData]);

  if (!monteCarloData?.days?.length) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: "rgba(255,255,255,0.25)",
        fontFamily: "'DM Mono', monospace", fontSize: 13,
      }}>
        No simulation data available.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
      `}</style>

      <div style={{
        background: "linear-gradient(145deg, rgba(15,23,42,0.92), rgba(8,14,30,0.97))",
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        padding: "24px 24px 20px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        fontFamily: "'Syne', sans-serif",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <div style={{
                width: 30, height: 30,
                background: "linear-gradient(135deg, #3b82f6, #6ee7f7)",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M2 2v20h20"/><path d="M6 16l4-8 4 5 4-9"/>
                </svg>
              </div>
              <h3 style={{
                margin: 0, fontSize: 16, fontWeight: 800,
                color: "#f0f4ff", letterSpacing: "-0.02em",
              }}>
                Monte Carlo Simulation
              </h3>
            </div>
            <p style={{
              margin: 0, fontSize: 12,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.35)",
            }}>
              1,000 scenarios · 252 trading days · GBM model · Starting $10,000
            </p>
          </div>

          {/* Simulation badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            borderRadius: 20,
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.25)",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "mcPulse 2s infinite" }} />
            <span style={{
              fontSize: 11, fontFamily: "'DM Mono', monospace",
              color: "rgba(110,231,247,0.8)", letterSpacing: "0.06em",
            }}>
              STOCHASTIC · GBM
            </span>
          </div>
        </div>

        {/* Summary pills */}
        {stats && (
          <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            <StatPill
              label="MEDIAN END VALUE"
              value={fmtK(stats.last.p50)}
              color="#6ee7f7"
              sub={`${stats.medianReturn >= 0 ? "+" : ""}${stats.medianReturn.toFixed(1)}% return`}
            />
            <StatPill
              label="OPTIMISTIC (95TH)"
              value={fmtK(stats.last.p95)}
              color="#34d399"
              sub={`${stats.bestCase >= 0 ? "+" : ""}${stats.bestCase.toFixed(1)}% upside`}
            />
            <StatPill
              label="PESSIMISTIC (5TH)"
              value={fmtK(stats.last.p5)}
              color="#f87171"
              sub={`${stats.worstCase >= 0 ? "+" : ""}${stats.worstCase.toFixed(1)}% downside`}
            />
            <StatPill
              label="OUTCOME SPREAD"
              value={fmtK(stats.last.p95 - stats.last.p5)}
              color="#fbbf24"
              sub="95th − 5th percentile"
            />
          </div>
        )}

        {/* Chart */}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 16, left: 10, bottom: 5 }}
            onMouseMove={(state) => {
              if (state.activePayload) setHighlightDay(state.activeLabel);
            }}
            onMouseLeave={() => setHighlightDay(null)}
          >
            <defs>
              {/* Fan fill gradient — green top, red bottom */}
              <linearGradient id="fanGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#34d399" stopOpacity="0.18" />
                <stop offset="50%"  stopColor="#6ee7f7" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0.12" />
              </linearGradient>

              {/* Median line glow */}
              <filter id="medianGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="3 6"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />

            <XAxis
              dataKey="day"
              stroke="rgba(255,255,255,0.15)"
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "DM Mono, monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              label={{
                value: "Trading Days",
                position: "insideBottom",
                offset: -2,
                fill: "rgba(255,255,255,0.25)",
                fontSize: 11,
                fontFamily: "DM Mono, monospace",
              }}
              interval={25}
            />

            <YAxis
              stroke="rgba(255,255,255,0.15)"
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "DM Mono, monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtK}
              domain={yDomain}
              width={62}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "rgba(255,255,255,0.15)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            {/* Starting value reference line */}
            <ReferenceLine
              y={10000}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="6 4"
              label={{
                value: "Start $10k",
                fill: "rgba(255,255,255,0.3)",
                fontSize: 10,
                fontFamily: "DM Mono, monospace",
                position: "insideTopRight",
              }}
            />

            {/* ── Fan area between p5 and p95 ── */}
            {/* Upper bound (p95) — defines area ceiling */}
            <Area
              type="monotone"
              dataKey="p95"
              stroke="#34d399"
              strokeWidth={1.5}
              fill="url(#fanGradient)"
              dot={false}
              activeDot={false}
              strokeOpacity={0.9}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-out"
            />

            {/* Lower bound (p5) — covers the fan area beneath it with background color */}
            <Area
              type="monotone"
              dataKey="p5"
              stroke="#f87171"
              strokeWidth={1.5}
              fill="rgba(8,14,30,0.97)"   /* matches card background — hides fanGradient below p5 */
              dot={false}
              activeDot={{ r: 4, fill: "#f87171", stroke: "rgba(10,16,34,0.9)", strokeWidth: 2 }}
              strokeOpacity={0.9}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-out"
            />

            {/* Median line — drawn on top with glow filter */}
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#6ee7f7"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "#6ee7f7", stroke: "rgba(10,16,34,0.9)", strokeWidth: 2 }}
              filter="url(#medianGlow)"
              isAnimationActive={true}
              animationDuration={1400}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ marginTop: 18 }}>
          <CustomLegend />
        </div>

        {/* Footer note */}
        <p style={{
          margin: "14px 0 0",
          fontSize: 10.5,
          fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.2)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Simulated using Geometric Brownian Motion parameterised from historical returns.
          Not financial advice. Past performance does not guarantee future results.
        </p>
      </div>

      <style>{`
        @keyframes mcPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}