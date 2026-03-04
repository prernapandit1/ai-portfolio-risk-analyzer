import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtPctShort = (v) => `${(v * 100).toFixed(0)}%`;

function downsample(arr, n) {
  if (!arr || arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

// ── Volatility regime classification ──────────────────────────────────────────
function getVolRegime(vol) {
  if (vol < 0.15) return { label: "Low Vol",      color: "#34d399", bg: "rgba(52,211,153,0.1)"  };
  if (vol < 0.25) return { label: "Normal",        color: "#6ee7f7", bg: "rgba(110,231,247,0.1)" };
  if (vol < 0.40) return { label: "Elevated",      color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  };
  return              { label: "High Vol",         color: "#f87171", bg: "rgba(248,113,113,0.1)"  };
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function VolTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const hist     = payload.find((p) => p.dataKey === "historical");
  const forecast = payload.find((p) => p.dataKey === "forecast");
  const val      = hist?.value ?? forecast?.value;
  const isForecast = !!forecast?.value;
  const regime   = val != null ? getVolRegime(val) : null;

  return (
    <div style={{
      background: "rgba(8,14,30,0.97)",
      border: "1.5px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: "12px 15px",
      fontFamily: "'DM Mono', monospace",
      fontSize: 12,
      boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
      minWidth: 190,
    }}>
      <div style={{
        fontSize: 10.5, color: "rgba(255,255,255,0.35)",
        marginBottom: 8, letterSpacing: "0.08em",
      }}>
        {label}
        {isForecast && (
          <span style={{
            marginLeft: 8, padding: "2px 6px", borderRadius: 4,
            background: "rgba(167,139,250,0.15)",
            color: "#a78bfa", fontSize: 9.5,
          }}>
            FORECAST
          </span>
        )}
      </div>

      {val != null && (
        <>
          <div style={{
            fontSize: 20, fontFamily: "'Syne', sans-serif",
            fontWeight: 800, color: "#f0f4ff",
            letterSpacing: "-0.02em", marginBottom: 8,
          }}>
            {fmtPct(val)}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>
              annualised
            </span>
          </div>
          {regime && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 20,
              background: regime.bg,
              border: `1px solid ${regime.color}40`,
              fontSize: 10.5, color: regime.color,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: regime.color, display: "inline-block",
              }} />
              {regime.label}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Stock selector tab ─────────────────────────────────────────────────────────
function TickerTab({ ticker, active, regime, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: "1.5px solid",
        cursor: "pointer",
        fontFamily: "'DM Mono', monospace",
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: "0.05em",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 6,
        ...(active ? {
          background: "rgba(110,231,247,0.1)",
          borderColor: "#6ee7f7",
          color: "#6ee7f7",
        } : {
          background: "transparent",
          borderColor: "rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.45)",
        }),
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "rgba(110,231,247,0.3)";
          e.currentTarget.style.color = "rgba(110,231,247,0.7)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "rgba(255,255,255,0.45)";
        }
      }}
    >
      {ticker}
      {regime && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: regime.color, flexShrink: 0,
        }} />
      )}
    </button>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────────
function StatPill({ label, value, color, sub }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      padding: "11px 15px",
      flex: 1,
      minWidth: 110,
    }}>
      <div style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 5,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 19, fontFamily: "'Syne', sans-serif",
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

// ── Main component ─────────────────────────────────────────────────────────────
/**
 * VolatilityChart
 *
 * Displays historical realised volatility (solid line) and LSTM-forecasted
 * 30-day volatility (dashed line, purple) for each ticker in the portfolio.
 * A dropdown/tab bar switches between stocks.
 *
 * Props:
 *   volatilityForecast — { [ticker]: {
 *       historical_dates: string[], historical_vol: number[],
 *       forecast_dates: string[],   forecast_vol: number[],
 *       last_historical_vol: number
 *   }}
 */
export default function VolatilityChart({ volatilityForecast }) {
  const tickers = useMemo(
    () => Object.keys(volatilityForecast || {}),
    [volatilityForecast]
  );
  const [activeTicker, setActiveTicker] = useState(() => tickers[0] ?? null);

  // Switch ticker if the active one disappears (e.g. re-run)
  const currentTicker = tickers.includes(activeTicker) ? activeTicker : tickers[0];

  // ── Build chart data for the selected ticker ────────────────────────────────
  const { chartData, stats } = useMemo(() => {
    if (!currentTicker || !volatilityForecast?.[currentTicker]) {
      return { chartData: [], stats: null };
    }

    const d = volatilityForecast[currentTicker];
    const histPoints = downsample(
      d.historical_dates.map((date, i) => ({
        date,
        historical: d.historical_vol[i],
        forecast: null,
        type: "historical",
      })),
      80
    );

    // Stitch: the last historical point + all forecast points form a continuous line
    const junction = {
      date: d.historical_dates[d.historical_dates.length - 1],
      historical: d.last_historical_vol,
      forecast: d.last_historical_vol, // overlap so lines connect
      type: "junction",
    };

    const forecastPoints = d.forecast_dates.map((date, i) => ({
      date,
      historical: null,
      forecast: d.forecast_vol[i],
      type: "forecast",
    }));

    const all = [...histPoints, junction, ...forecastPoints];

    // Stats
    const histVols   = d.historical_vol;
    const forecastVols = d.forecast_vol;
    const avgHist    = histVols.reduce((a, b) => a + b, 0) / histVols.length;
    const minHist    = Math.min(...histVols);
    const maxHist    = Math.max(...histVols);
    const avgForecast = forecastVols.reduce((a, b) => a + b, 0) / forecastVols.length;
    const delta      = avgForecast - avgHist;

    return {
      chartData: all,
      stats: {
        current:     d.last_historical_vol,
        avgHist,
        minHist,
        maxHist,
        avgForecast,
        delta,
      },
    };
  }, [currentTicker, volatilityForecast]);

  // ── Y domain ────────────────────────────────────────────────────────────────
  const yDomain = useMemo(() => {
    if (!chartData.length) return [0, 1];
    const vals = chartData
      .flatMap((d) => [d.historical, d.forecast])
      .filter((v) => v != null);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.12;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData]);

  // ── Regime per ticker (for tab dot color) ───────────────────────────────────
  const tickerRegimes = useMemo(() => {
    const out = {};
    tickers.forEach((t) => {
      const last = volatilityForecast?.[t]?.last_historical_vol ?? 0;
      out[t] = getVolRegime(last);
    });
    return out;
  }, [tickers, volatilityForecast]);

  // ── Forecast separator date (vertical reference line) ───────────────────────
  const splitDate = useMemo(() => {
    const d = volatilityForecast?.[currentTicker];
    return d?.historical_dates?.[d.historical_dates.length - 1] ?? null;
  }, [currentTicker, volatilityForecast]);

  if (!tickers.length) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 260, color: "rgba(255,255,255,0.25)",
        fontFamily: "'DM Mono', monospace", fontSize: 13,
      }}>
        LSTM forecast not available. Enable it in the portfolio form.
      </div>
    );
  }

  const currentRegime = currentTicker ? tickerRegimes[currentTicker] : null;

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

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <div style={{
              width: 30, height: 30,
              background: "linear-gradient(135deg, #a78bfa, #f0abfc)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3 style={{
              margin: 0, fontSize: 16, fontWeight: 800,
              color: "#f0f4ff", letterSpacing: "-0.02em",
            }}>
              LSTM Volatility Forecast
            </h3>
          </div>
          <p style={{
            margin: 0, fontSize: 12,
            fontFamily: "'DM Mono', monospace",
            color: "rgba(255,255,255,0.35)",
          }}>
            2-layer LSTM · 60-day rolling window · 30-day forward forecast · annualised volatility
          </p>
        </div>

        {/* ── Ticker tabs ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {tickers.map((ticker) => (
            <TickerTab
              key={ticker}
              ticker={ticker}
              active={ticker === currentTicker}
              regime={tickerRegimes[ticker]}
              onClick={() => setActiveTicker(ticker)}
            />
          ))}
        </div>

        {/* ── Summary stats ── */}
        {stats && (
          <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            <StatPill
              label="CURRENT VOL"
              value={fmtPct(stats.current)}
              color={currentRegime?.color ?? "#6ee7f7"}
              sub={currentRegime?.label}
            />
            <StatPill
              label="HIST AVG (90d)"
              value={fmtPct(stats.avgHist)}
              color="rgba(255,255,255,0.7)"
              sub={`${fmtPct(stats.minHist)} – ${fmtPct(stats.maxHist)} range`}
            />
            <StatPill
              label="30-DAY FORECAST"
              value={fmtPct(stats.avgForecast)}
              color="#a78bfa"
              sub="LSTM avg prediction"
            />
            <StatPill
              label="VOL DELTA"
              value={`${stats.delta >= 0 ? "+" : ""}${fmtPct(stats.delta)}`}
              color={stats.delta > 0.02 ? "#f87171" : stats.delta < -0.02 ? "#34d399" : "#fbbf24"}
              sub={stats.delta > 0.02 ? "Rising tension" : stats.delta < -0.02 ? "Easing" : "Stable"}
            />
          </div>
        )}

        {/* ── Chart ── */}
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 16, left: 8, bottom: 5 }}
          >
            <defs>
              {/* Historical area fill */}
              <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#6ee7f7" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#6ee7f7" stopOpacity="0.01" />
              </linearGradient>

              {/* Forecast area fill */}
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.01" />
              </linearGradient>

              {/* Glow filter for forecast line */}
              <filter id="forecastGlow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
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
              dataKey="date"
              stroke="rgba(255,255,255,0.1)"
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "DM Mono, monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              interval={Math.floor(chartData.length / 6)}
              tickFormatter={(v) => {
                if (!v) return "";
                const d = new Date(v);
                return `${d.toLocaleString("en", { month: "short" })} '${String(d.getFullYear()).slice(2)}`;
              }}
            />

            <YAxis
              stroke="rgba(255,255,255,0.1)"
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "DM Mono, monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtPctShort}
              domain={yDomain}
              width={42}
              label={{
                value: "Ann. Vol",
                angle: -90,
                position: "insideLeft",
                fill: "rgba(255,255,255,0.2)",
                fontSize: 10,
                fontFamily: "DM Mono, monospace",
                dx: -2,
              }}
            />

            <Tooltip
              content={<VolTooltip />}
              cursor={{
                stroke: "rgba(255,255,255,0.12)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            {/* Forecast start reference line */}
            {splitDate && (
              <ReferenceLine
                x={splitDate}
                stroke="rgba(167,139,250,0.45)"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: "Forecast →",
                  fill: "rgba(167,139,250,0.65)",
                  fontSize: 10,
                  fontFamily: "DM Mono, monospace",
                  position: "insideTopRight",
                  dy: -4,
                }}
              />
            )}

            {/* Volatility regime bands (horizontal reference lines) */}
            {[
              { y: 0.15, label: "15% — Low/Normal",   color: "#34d399" },
              { y: 0.25, label: "25% — Normal/Elev",  color: "#fbbf24" },
              { y: 0.40, label: "40% — Elev/High",    color: "#f87171" },
            ].map(({ y, label, color }) => (
              <ReferenceLine
                key={y}
                y={y}
                stroke={color}
                strokeOpacity={0.18}
                strokeDasharray="4 8"
                label={{
                  value: label,
                  fill: color,
                  fillOpacity: 0.45,
                  fontSize: 9,
                  fontFamily: "DM Mono, monospace",
                  position: "insideTopRight",
                }}
              />
            ))}

            {/* Historical area */}
            <Area
              type="monotone"
              dataKey="historical"
              stroke="#6ee7f7"
              strokeWidth={2}
              fill="url(#histGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#6ee7f7", stroke: "rgba(8,14,30,0.9)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />

            {/* Forecast area — dashed stroke */}
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#a78bfa"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              fill="url(#forecastGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#a78bfa", stroke: "rgba(8,14,30,0.9)", strokeWidth: 2 }}
              connectNulls={false}
              filter="url(#forecastGlow)"
              isAnimationActive
              animationDuration={1100}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* ── Legend ── */}
        <div style={{
          display: "flex", gap: 20, justifyContent: "center",
          flexWrap: "wrap", marginTop: 16,
        }}>
          {[
            { color: "#6ee7f7", label: "Historical Volatility", dashed: false },
            { color: "#a78bfa", label: "LSTM 30-Day Forecast",  dashed: true  },
          ].map(({ color, label, dashed }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="24" height="3" style={{ overflow: "visible" }}>
                <line
                  x1="0" y1="1.5" x2="24" y2="1.5"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeDasharray={dashed ? "5 3" : "none"}
                  strokeLinecap="round"
                />
              </svg>
              <span style={{
                fontSize: 11.5, fontFamily: "'DM Mono', monospace",
                color: "rgba(255,255,255,0.5)",
              }}>
                <span style={{ color }}>{label}</span>
              </span>
            </div>
          ))}
        </div>

        {/* ── Regime guide ── */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap",
          justifyContent: "center", marginTop: 14,
        }}>
          {[
            { label: "Low  < 15%",       color: "#34d399" },
            { label: "Normal  15–25%",   color: "#6ee7f7" },
            { label: "Elevated  25–40%", color: "#fbbf24" },
            { label: "High  > 40%",      color: "#f87171" },
          ].map(({ label, color }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 20,
              background: `${color}12`,
              border: `1px solid ${color}30`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
              <span style={{
                fontSize: 10.5, fontFamily: "'DM Mono', monospace", color,
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <p style={{
          margin: "14px 0 0",
          fontSize: 10.5,
          fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.2)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          LSTM trained on 5y of rolling 21-day realised volatility.
          Forecast is indicative only — model accuracy degrades beyond 10–15 days.
        </p>
      </div>
    </>
  );
}