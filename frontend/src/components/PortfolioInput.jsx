import { useState, useCallback } from "react";
import axios from "axios";

const DEFAULT_HOLDINGS = [
  { ticker: "AAPL", shares: "10" },
  { ticker: "GOOGL", shares: "5" },
  { ticker: "TSLA", shares: "8" },
];

const PERIOD_OPTIONS = [
  { value: "1y", label: "1 Year" },
  { value: "2y", label: "2 Years" },
  { value: "3y", label: "3 Years" },
  { value: "5y", label: "5 Years" },
];

/** Thin animated spinner */
function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 18, height: 18 }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="60"
        strokeDashoffset="20"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A single removable holding row */
function HoldingRow({ holding, index, onChange, onRemove, canRemove, error }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: "10px",
        alignItems: "center",
        animation: "rowSlideIn 0.25s ease forwards",
        animationDelay: `${index * 0.04}s`,
        opacity: 0,
      }}
    >
      {/* Ticker input */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="TICKER"
          value={holding.ticker}
          maxLength={6}
          onChange={(e) => onChange(index, "ticker", e.target.value.toUpperCase())}
          style={{
            width: "100%",
            padding: "11px 14px",
            background: error?.ticker ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${error?.ticker ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 10,
            color: "#f0f4ff",
            fontSize: 14,
            fontFamily: "'DM Mono', monospace",
            fontWeight: 500,
            letterSpacing: "0.08em",
            outline: "none",
            transition: "border-color 0.2s, background 0.2s",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            if (!error?.ticker) e.target.style.borderColor = "#6ee7f7";
          }}
          onBlur={(e) => {
            if (!error?.ticker) e.target.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        />
        {error?.ticker && (
          <span style={{
            position: "absolute", bottom: -18, left: 4,
            fontSize: 11, color: "#f87171", fontFamily: "'DM Mono', monospace",
          }}>
            {error.ticker}
          </span>
        )}
      </div>

      {/* Shares input */}
      <div style={{ position: "relative" }}>
        <input
          type="number"
          placeholder="Shares"
          value={holding.shares}
          min="0.01"
          step="any"
          onChange={(e) => onChange(index, "shares", e.target.value)}
          style={{
            width: "100%",
            padding: "11px 14px",
            background: error?.shares ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${error?.shares ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 10,
            color: "#f0f4ff",
            fontSize: 14,
            fontFamily: "'DM Mono', monospace",
            outline: "none",
            transition: "border-color 0.2s, background 0.2s",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            if (!error?.shares) e.target.style.borderColor = "#6ee7f7";
          }}
          onBlur={(e) => {
            if (!error?.shares) e.target.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        />
        {error?.shares && (
          <span style={{
            position: "absolute", bottom: -18, left: 4,
            fontSize: 11, color: "#f87171", fontFamily: "'DM Mono', monospace",
          }}>
            {error.shares}
          </span>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        title="Remove row"
        style={{
          width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: canRemove ? "rgba(239,68,68,0.1)" : "transparent",
          border: `1.5px solid ${canRemove ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 8,
          color: canRemove ? "#f87171" : "rgba(255,255,255,0.2)",
          cursor: canRemove ? "pointer" : "not-allowed",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (canRemove) e.currentTarget.style.background = "rgba(239,68,68,0.2)";
        }}
        onMouseLeave={(e) => {
          if (canRemove) e.currentTarget.style.background = "rgba(239,68,68,0.1)";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

/**
 * PortfolioInput
 * Dynamic form for entering stock tickers + share quantities.
 * On submit, POSTs to /api/analyze and passes the result up via onResults().
 */
export default function PortfolioInput({ onResults, onLoading }) {
  const [holdings, setHoldings] = useState(DEFAULT_HOLDINGS);
  const [period, setPeriod] = useState("5y");
  const [runLstm, setRunLstm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [apiError, setApiError] = useState("");

  /* ── Validation ─────────────────────────────────────────────────────────── */
  const validate = useCallback(() => {
    const rowErrors = holdings.map((h) => {
      const e = {};
      if (!h.ticker.trim()) e.ticker = "Required";
      else if (!/^[A-Z0-9.\-]{1,6}$/.test(h.ticker)) e.ticker = "Invalid";
      if (!h.shares || isNaN(parseFloat(h.shares)) || parseFloat(h.shares) <= 0)
        e.shares = "Must be > 0";
      return e;
    });
    setErrors(rowErrors);
    return rowErrors.every((e) => Object.keys(e).length === 0);
  }, [holdings]);

  /* ── Row management ─────────────────────────────────────────────────────── */
  const handleChange = useCallback((index, field, value) => {
    setHoldings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setErrors((prev) => {
      const next = [...prev];
      if (next[index]) delete next[index][field];
      return next;
    });
    setApiError("");
  }, []);

  const addRow = useCallback(() => {
    if (holdings.length >= 20) return;
    setHoldings((prev) => [...prev, { ticker: "", shares: "" }]);
    setErrors((prev) => [...prev, {}]);
  }, [holdings.length]);

  const removeRow = useCallback((index) => {
    setHoldings((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setApiError("");
    setLoading(true);
    onLoading?.(true);

    const portfolio = holdings.map((h) => ({
      ticker: h.ticker.trim().toUpperCase(),
      shares: parseFloat(h.shares),
    }));

    try {
      const { data } = await axios.post("http://localhost:8000/api/analyze", {
        portfolio,
        period,
        run_lstm: runLstm,
      });

      if (data.status === "success") {
        onResults?.(data.data);
      } else {
        setApiError(data.message || "Analysis failed.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        "Could not connect to the backend. Is it running on port 8000?";
      setApiError(msg);
    } finally {
      setLoading(false);
      onLoading?.(false);
    }
  }, [holdings, period, runLstm, validate, onResults, onLoading]);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Google Fonts + keyframes injected once */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(110,231,247,0); }
          50%       { box-shadow: 0 0 16px 2px rgba(110,231,247,0.15); }
        }
        @keyframes shimmer {
          from { background-position: -200% center; }
          to   { background-position:  200% center; }
        }

        .analyze-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(110,231,247,0.25);
        }
        .analyze-btn:not(:disabled):active {
          transform: translateY(0);
        }
        .add-row-btn:hover {
          border-color: rgba(110,231,247,0.4) !important;
          color: #6ee7f7 !important;
        }
      `}</style>

      <div
        style={{
          background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(10,16,32,0.98))",
          border: "1.5px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "28px 28px 24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          fontFamily: "'Syne', sans-serif",
          animation: "pulseGlow 4s ease-in-out infinite",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {/* Decorative icon */}
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #6ee7f7, #3b82f6)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <h2 style={{
              margin: 0, fontSize: 18, fontWeight: 800,
              color: "#f0f4ff", letterSpacing: "-0.02em",
            }}>
              Portfolio Builder
            </h2>
          </div>
          <p style={{
            margin: 0, fontSize: 12.5,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.02em",
          }}>
            Enter tickers + share counts · max 20 positions
          </p>
        </div>

        {/* Column labels */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: "10px",
          marginBottom: 10,
          paddingLeft: 2,
        }}>
          {["TICKER", "SHARES", ""].map((label, i) => (
            <span key={i} style={{
              fontSize: 10,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.12em",
              fontWeight: 500,
            }}>
              {label}
            </span>
          ))}
        </div>

        {/* Holding rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {holdings.map((holding, index) => (
            <HoldingRow
              key={index}
              holding={holding}
              index={index}
              onChange={handleChange}
              onRemove={removeRow}
              canRemove={holdings.length > 1}
              error={errors[index]}
            />
          ))}
        </div>

        {/* Add row button */}
        {holdings.length < 20 && (
          <button
            className="add-row-btn"
            onClick={addRow}
            style={{
              width: "100%",
              padding: "10px",
              background: "transparent",
              border: "1.5px dashed rgba(255,255,255,0.12)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.35)",
              fontSize: 13,
              fontFamily: "'DM Mono', monospace",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "all 0.2s",
              marginBottom: 20,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Position
            <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.6 }}>
              ({holdings.length}/20)
            </span>
          </button>
        )}

        {/* Options row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 12, marginBottom: 20,
        }}>
          {/* Period selector */}
          <div>
            <label style={{
              display: "block", fontSize: 10,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em",
              marginBottom: 7,
            }}>
              HISTORY PERIOD
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "'DM Mono', monospace",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    border: "1.5px solid",
                    ...(period === opt.value
                      ? {
                          background: "rgba(110,231,247,0.12)",
                          borderColor: "#6ee7f7",
                          color: "#6ee7f7",
                        }
                      : {
                          background: "transparent",
                          borderColor: "rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.4)",
                        }),
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* LSTM toggle */}
          <div>
            <label style={{
              display: "block", fontSize: 10,
              fontFamily: "'DM Mono', monospace",
              color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em",
              marginBottom: 7,
            }}>
              LSTM FORECAST
            </label>
            <button
              onClick={() => setRunLstm((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1.5px solid",
                cursor: "pointer",
                transition: "all 0.2s",
                ...(runLstm
                  ? {
                      background: "rgba(110,231,247,0.08)",
                      borderColor: "rgba(110,231,247,0.3)",
                      color: "#6ee7f7",
                    }
                  : {
                      background: "transparent",
                      borderColor: "rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.35)",
                    }),
              }}
            >
              {/* Toggle pill */}
              <div style={{
                width: 32, height: 18,
                borderRadius: 9,
                background: runLstm ? "#6ee7f7" : "rgba(255,255,255,0.15)",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute",
                  top: 3, left: runLstm ? 17 : 3,
                  width: 12, height: 12,
                  borderRadius: "50%",
                  background: runLstm ? "#0f172a" : "rgba(255,255,255,0.6)",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                {runLstm ? "Enabled" : "Disabled"}
              </span>
              {runLstm && (
                <span style={{
                  fontSize: 10, fontFamily: "'DM Mono', monospace",
                  color: "rgba(110,231,247,0.6)",
                }}>
                  +30–90s
                </span>
              )}
            </button>
          </div>
        </div>

        {/* API error */}
        {apiError && (
          <div style={{
            padding: "11px 14px",
            background: "rgba(239,68,68,0.08)",
            border: "1.5px solid rgba(239,68,68,0.25)",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            fontFamily: "'DM Mono', monospace",
            color: "#fca5a5",
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 1, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {apiError}
          </div>
        )}

        {/* Submit button */}
        <button
          className="analyze-btn"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.04em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.2s",
            ...(loading
              ? {
                  background: "rgba(110,231,247,0.06)",
                  color: "rgba(255,255,255,0.3)",
                }
              : {
                  background: "linear-gradient(135deg, #6ee7f7 0%, #3b82f6 100%)",
                  backgroundSize: "200% auto",
                  color: "#0a1020",
                  boxShadow: "0 4px 20px rgba(110,231,247,0.2)",
                }),
          }}
        >
          {loading ? (
            <>
              <Spinner />
              <span>Analyzing Portfolio…</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span>Analyze Portfolio</span>
            </>
          )}
        </button>

        {/* Footer note */}
        <p style={{
          margin: "14px 0 0",
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: "rgba(255,255,255,0.2)",
          textAlign: "center",
          letterSpacing: "0.03em",
        }}>
          Data via Yahoo Finance · Risk metrics computed server-side
        </p>
      </div>
    </>
  );
}