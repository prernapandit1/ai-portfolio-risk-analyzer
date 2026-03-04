import { useMemo, useState } from "react";

// ── Color interpolation ────────────────────────────────────────────────────────
/**
 * Map a correlation value [-1, 1] to an RGB color.
 * -1 → vivid red  |  0 → dark neutral  |  +1 → vivid teal-green
 */
function corrToColor(value, alpha = 1) {
  const clamped = Math.max(-1, Math.min(1, value));

  let r, g, b;
  if (clamped < 0) {
    // negative: neutral (#0e1829) → red (#ef4444)
    const t = Math.abs(clamped);
    r = Math.round(14  + t * (239 - 14));
    g = Math.round(24  + t * (68  - 24));
    b = Math.round(41  + t * (68  - 41));
  } else {
    // positive: neutral (#0e1829) → teal (#6ee7f7)
    const t = clamped;
    r = Math.round(14  + t * (110 - 14));
    g = Math.round(24  + t * (231 - 24));
    b = Math.round(41  + t * (247 - 41));
  }

  return alpha === 1
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${alpha})`;
}

/** Text color that contrasts with the cell background */
function cellTextColor(value) {
  return Math.abs(value) > 0.55 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function HeatTooltip({ cell, pos }) {
  if (!cell) return null;
  const { rowTicker, colTicker, value } = cell;
  const isSelf = rowTicker === colTicker;

  return (
    <div style={{
      position: "fixed",
      left: pos.x + 14,
      top:  pos.y - 10,
      background: "rgba(8,14,30,0.97)",
      border: "1.5px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 14px",
      fontFamily: "'DM Mono', monospace",
      fontSize: 12,
      color: "#f0f4ff",
      pointerEvents: "none",
      zIndex: 999,
      boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
      minWidth: 170,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: 2,
          background: corrToColor(value),
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 500 }}>
          {rowTicker} × {colTicker}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>Correlation</span>
        <span style={{
          color: value > 0 ? "#6ee7f7" : value < 0 ? "#f87171" : "rgba(255,255,255,0.6)",
          fontWeight: 500,
        }}>
          {isSelf ? "1.000 (self)" : value.toFixed(4)}
        </span>
      </div>

      {!isSelf && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 11, color: "rgba(255,255,255,0.35)",
        }}>
          {Math.abs(value) >= 0.7
            ? "⚠ Highly correlated — low diversification benefit"
            : Math.abs(value) >= 0.4
            ? "Moderately correlated"
            : "Low correlation — good diversification"}
        </div>
      )}
    </div>
  );
}

// ── Color scale legend ─────────────────────────────────────────────────────────
function ColorScaleLegend() {
  const stops = 80;
  const swatchW = 240;
  const swatchH = 12;

  // Build gradient as SVG rects
  const rects = Array.from({ length: stops }, (_, i) => {
    const val = -1 + (2 * i) / (stops - 1);
    return (
      <rect
        key={i}
        x={(i / stops) * swatchW}
        y={0}
        width={swatchW / stops + 0.5}
        height={swatchH}
        fill={corrToColor(val)}
      />
    );
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: "'DM Mono', monospace",
    }}>
      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>−1.0</span>
      <div style={{ position: "relative" }}>
        <svg width={swatchW} height={swatchH} style={{ borderRadius: 4, display: "block" }}>
          {rects}
        </svg>
        {/* Center tick */}
        <div style={{
          position: "absolute",
          top: swatchH + 2, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9.5, color: "rgba(255,255,255,0.3)",
        }}>
          0
        </div>
      </div>
      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>+1.0</span>

      <div style={{ display: "flex", gap: 14, marginLeft: 16 }}>
        {[
          { color: "#ef4444", label: "Negative" },
          { color: "rgba(255,255,255,0.15)", label: "Uncorrelated" },
          { color: "#6ee7f7", label: "Positive" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: color, flexShrink: 0,
            }} />
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Concentration warning ──────────────────────────────────────────────────────
function ConcentrationWarning({ pairs }) {
  if (!pairs.length) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 9,
      padding: "10px 14px",
      background: "rgba(251,191,36,0.06)",
      border: "1px solid rgba(251,191,36,0.2)",
      borderRadius: 10,
      marginTop: 16,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"
        style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div>
        <div style={{
          fontSize: 11.5, fontFamily: "'DM Mono', monospace",
          color: "#fbbf24", marginBottom: 4,
        }}>
          High correlation detected
        </div>
        <div style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.4)", lineHeight: 1.6,
        }}>
          {pairs.map((p) => (
            <span key={p.pair} style={{ marginRight: 14 }}>
              {p.pair}{" "}
              <span style={{ color: "#fbbf24" }}>{p.value.toFixed(2)}</span>
            </span>
          ))}
          — consider reducing concentration in these positions.
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
/**
 * HeatmapChart
 *
 * Renders a custom SVG correlation heatmap for all tickers in the portfolio.
 * Color scale: red (−1) → dark neutral (0) → teal (+1).
 * Shows correlation value inside each cell; tooltips on hover.
 *
 * Props:
 *   correlationMatrix — { [ticker]: { [ticker]: number } }
 *                       as returned by /api/analyze
 */
export default function HeatmapChart({ correlationMatrix }) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ── Parse matrix ─────────────────────────────────────────────────────────────
  const { tickers, matrix } = useMemo(() => {
    if (!correlationMatrix) return { tickers: [], matrix: [] };
    const tickers = Object.keys(correlationMatrix);
    const matrix = tickers.map((row) =>
      tickers.map((col) => ({
        rowTicker: row,
        colTicker: col,
        value: correlationMatrix[row]?.[col] ?? 0,
      }))
    );
    return { tickers, matrix };
  }, [correlationMatrix]);

  // ── High-correlation pairs (warn if |r| > 0.7, exclude diagonal) ─────────────
  const highCorrPairs = useMemo(() => {
    const pairs = [];
    for (let r = 0; r < tickers.length; r++) {
      for (let c = r + 1; c < tickers.length; c++) {
        const val = matrix[r]?.[c]?.value ?? 0;
        if (Math.abs(val) >= 0.7) {
          pairs.push({ pair: `${tickers[r]}–${tickers[c]}`, value: val });
        }
      }
    }
    return pairs;
  }, [tickers, matrix]);

  if (!tickers.length) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 200, color: "rgba(255,255,255,0.25)",
        fontFamily: "'DM Mono', monospace", fontSize: 13,
      }}>
        No correlation data available.
      </div>
    );
  }

  // ── Cell sizing ───────────────────────────────────────────────────────────────
  const n          = tickers.length;
  const LABEL_W    = 54;   // left axis labels
  const LABEL_H    = 54;   // top axis labels
  const MAX_GRID   = 500;  // max grid area (square)
  const cellSize   = Math.max(36, Math.min(72, Math.floor(MAX_GRID / n)));
  const fontSize   = cellSize < 46 ? 9 : cellSize < 58 ? 10.5 : 12;
  const gridW      = cellSize * n;
  const gridH      = cellSize * n;
  const svgW       = LABEL_W + gridW;
  const svgH       = LABEL_H + gridH;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        .hm-cell { transition: opacity 0.15s; }
        .hm-cell:hover { opacity: 0.88; cursor: crosshair; }
      `}</style>

      <div style={{
        background: "linear-gradient(145deg, rgba(15,23,42,0.92), rgba(8,14,30,0.97))",
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        padding: "24px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        fontFamily: "'Syne', sans-serif",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <div style={{
                width: 30, height: 30,
                background: "linear-gradient(135deg, #a78bfa, #6ee7f7)",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              </div>
              <h3 style={{
                margin: 0, fontSize: 16, fontWeight: 800,
                color: "#f0f4ff", letterSpacing: "-0.02em",
              }}>
                Correlation Matrix
              </h3>
            </div>
            <p style={{
              margin: 0, fontSize: 12,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.35)",
            }}>
              Pearson pairwise correlation · 5-year daily returns · {n} assets
            </p>
          </div>

          {/* Stats badge */}
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap",
          }}>
            {[
              { label: "ASSETS", value: n },
              { label: "PAIRS", value: (n * (n - 1)) / 2 },
              { label: "HIGH CORR", value: highCorrPairs.length, warn: highCorrPairs.length > 0 },
            ].map(({ label, value, warn }) => (
              <div key={label} style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: warn ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${warn ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.07)"}`,
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 16, fontFamily: "'Syne', sans-serif",
                  fontWeight: 800, color: warn ? "#fbbf24" : "#f0f4ff",
                }}>
                  {value}
                </div>
                <div style={{
                  fontSize: 9.5, fontFamily: "'DM Mono', monospace",
                  color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SVG heatmap — horizontally scrollable on small screens */}
        <div style={{ overflowX: "auto", overflowY: "visible" }}>
          <svg
            width={svgW}
            height={svgH}
            style={{ display: "block", userSelect: "none" }}
            onMouseLeave={() => setHoveredCell(null)}
          >
            {/* ── Top axis labels ── */}
            {tickers.map((ticker, c) => (
              <text
                key={`col-${ticker}`}
                x={LABEL_W + c * cellSize + cellSize / 2}
                y={LABEL_H - 8}
                textAnchor="middle"
                dominantBaseline="auto"
                fill="rgba(255,255,255,0.55)"
                fontSize={11}
                fontFamily="DM Mono, monospace"
                fontWeight="500"
                transform={`rotate(-35, ${LABEL_W + c * cellSize + cellSize / 2}, ${LABEL_H - 8})`}
              >
                {ticker}
              </text>
            ))}

            {/* ── Left axis labels ── */}
            {tickers.map((ticker, r) => (
              <text
                key={`row-${ticker}`}
                x={LABEL_W - 8}
                y={LABEL_H + r * cellSize + cellSize / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.55)"
                fontSize={11}
                fontFamily="DM Mono, monospace"
                fontWeight="500"
              >
                {ticker}
              </text>
            ))}

            {/* ── Cells ── */}
            {matrix.map((row, r) =>
              row.map((cell, c) => {
                const { value, rowTicker, colTicker } = cell;
                const x = LABEL_W + c * cellSize;
                const y = LABEL_H + r * cellSize;
                const isSelf     = r === c;
                const isHovered  = hoveredCell?.rowTicker === rowTicker && hoveredCell?.colTicker === colTicker;
                const isRelated  = hoveredCell && (hoveredCell.rowTicker === rowTicker || hoveredCell.colTicker === colTicker);

                const fill        = corrToColor(value);
                const strokeColor = isHovered
                  ? "rgba(255,255,255,0.6)"
                  : isSelf
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.04)";

                return (
                  <g
                    key={`${r}-${c}`}
                    className="hm-cell"
                    style={{ opacity: hoveredCell && !isRelated ? 0.45 : 1 }}
                    onMouseEnter={(e) => {
                      setHoveredCell(cell);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => {
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    {/* Cell background */}
                    <rect
                      x={x + 1}
                      y={y + 1}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      rx={4}
                      fill={fill}
                      stroke={strokeColor}
                      strokeWidth={isHovered ? 1.5 : 1}
                    />

                    {/* Diagonal self-correlation: show a subtle pattern */}
                    {isSelf && (
                      <line
                        x1={x + 8} y1={y + cellSize - 8}
                        x2={x + cellSize - 8} y2={y + 8}
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={1}
                      />
                    )}

                    {/* Value label — hidden when cell is too small */}
                    {cellSize >= 40 && (
                      <text
                        x={x + cellSize / 2}
                        y={y + cellSize / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={isSelf ? "rgba(255,255,255,0.3)" : cellTextColor(value)}
                        fontSize={fontSize}
                        fontFamily="DM Mono, monospace"
                        fontWeight={Math.abs(value) > 0.6 ? "500" : "400"}
                        style={{ pointerEvents: "none" }}
                      >
                        {isSelf ? "—" : value.toFixed(2)}
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* Color scale legend */}
        <div style={{ marginTop: 18 }}>
          <ColorScaleLegend />
        </div>

        {/* High-correlation warning */}
        <ConcentrationWarning pairs={highCorrPairs} />

        {/* Interpretation guide */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginTop: 16,
        }}>
          {[
            { range: "|r| > 0.7", label: "High correlation", sub: "Low diversification benefit", color: "#f87171" },
            { range: "0.4 – 0.7", label: "Moderate",         sub: "Some co-movement",            color: "#fbbf24" },
            { range: "|r| < 0.4", label: "Low / Negative",   sub: "Good diversification",        color: "#34d399" },
          ].map(({ range, label, sub, color }) => (
            <div key={range} style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{
                fontSize: 12, fontFamily: "'DM Mono', monospace",
                color, fontWeight: 500, marginBottom: 3,
              }}>
                {range}
              </div>
              <div style={{
                fontSize: 12, fontFamily: "'DM Mono', monospace",
                color: "rgba(255,255,255,0.6)", marginBottom: 2,
              }}>
                {label}
              </div>
              <div style={{
                fontSize: 10.5, fontFamily: "'DM Mono', monospace",
                color: "rgba(255,255,255,0.3)",
              }}>
                {sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating tooltip — rendered outside the SVG for no clipping issues */}
      <HeatTooltip cell={hoveredCell} pos={tooltipPos} />
    </>
  );
}
