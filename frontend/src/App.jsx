import { useState } from "react";
import PortfolioInput    from "./components/PortfolioInput";
import RiskScoreCard     from "./components/RiskScoreCard";
import MonteCarloChart   from "./components/MonteCarloChart";
import HeatmapChart      from "./components/HeatmapChart";
import VolatilityChart   from "./components/VolatilityChart";
import AIAdvisorPanel    from "./components/AIAdvisorPanel";

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ children, delay = 0 }) {
  return (
    <div style={{
      animation: "sectionFadeIn 0.6s ease forwards",
      animationDelay: `${delay}s`,
      opacity: 0,
    }}>
      {children}
    </div>
  );
}

// ── Loading overlay ────────────────────────────────────────────────────────────
function LoadingOverlay() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(8,14,30,0.85)",
      backdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      {/* Orbital spinner */}
      <div style={{ position: "relative", width: 64, height: 64, marginBottom: 24 }}>
        <div style={{
          position: "absolute", inset: 0,
          border: "2px solid rgba(110,231,247,0.15)",
          borderTop: "2px solid #6ee7f7",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: 10,
          border: "2px solid rgba(167,139,250,0.15)",
          borderTop: "2px solid #a78bfa",
          borderRadius: "50%",
          animation: "spin 1.6s linear infinite reverse",
        }} />
        <div style={{
          position: "absolute", inset: 20,
          background: "rgba(110,231,247,0.1)",
          borderRadius: "50%",
          animation: "pulse 2s ease-in-out infinite",
        }} />
      </div>

      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 18, fontWeight: 800,
        color: "#f0f4ff", letterSpacing: "-0.02em",
        marginBottom: 8,
      }}>
        Analyzing Portfolio…
      </div>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 12, color: "rgba(255,255,255,0.35)",
        letterSpacing: "0.05em",
      }}>
        Fetching data · Computing risk metrics · Running simulations
      </div>
    </div>
  );
}

// ── Hero header ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{
      textAlign: "center",
      padding: "48px 24px 32px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      marginBottom: 32,
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        marginBottom: 14,
      }}>
        <div style={{
          width: 40, height: 40,
          background: "linear-gradient(135deg, #6ee7f7, #3b82f6, #a78bfa)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <h1 style={{
          margin: 0,
          fontSize: "clamp(22px, 4vw, 34px)",
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          background: "linear-gradient(90deg, #f0f4ff 0%, #6ee7f7 50%, #a78bfa 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          AI Investment Risk Analyzer
        </h1>
      </div>

      <p style={{
        margin: 0, maxWidth: 560, marginLeft: "auto", marginRight: "auto",
        fontFamily: "'DM Mono', monospace",
        fontSize: 13, color: "rgba(255,255,255,0.4)",
        lineHeight: 1.7, letterSpacing: "0.02em",
      }}>
        Portfolio risk metrics · Monte Carlo simulation · LSTM volatility forecasting · GPT rebalancing advice
      </p>
    </header>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "60px 24px",
      color: "rgba(255,255,255,0.2)",
      fontFamily: "'DM Mono', monospace",
      textAlign: "center",
      gap: 12,
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M2 2v20h20"/><path d="M6 16l4-8 4 5 4-9"/>
      </svg>
      <p style={{ margin: 0, fontSize: 14 }}>
        Enter your portfolio above and click <strong style={{ color: "rgba(255,255,255,0.4)" }}>Analyze</strong> to see results.
      </p>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);

  const hasVolForecast =
    results?.volatility_forecast &&
    Object.keys(results.volatility_forecast).length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #080e1e;
          color: #f0f4ff;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        /* Subtle grid texture on body */
        body::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(110,231,247,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(110,231,247,0.015) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        #root { position: relative; z-index: 1; }

        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes sectionFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Thin scrollbar */
        ::-webkit-scrollbar       { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
        ::-webkit-scrollbar-thumb { background: rgba(110,231,247,0.25); border-radius: 3px; }
      `}</style>

      {loading && <LoadingOverlay />}

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px 60px" }}>
        <Header />

        {/* ── Main grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: results ? "340px 1fr" : "1fr",
          gap: 24,
          alignItems: "start",
        }}>
          {/* Left column: input form (always visible) */}
          <div style={{ position: "sticky", top: 24 }}>
            <PortfolioInput
              onResults={setResults}
              onLoading={setLoading}
            />
          </div>

          {/* Right column: results */}
          {results ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Row 1: Risk metrics + AI advisor side-by-side */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 360px",
                gap: 24,
                alignItems: "start",
              }}>
                <Section delay={0.05}>
                  <RiskScoreCard riskMetrics={results.risk_metrics} />
                </Section>
                <Section delay={0.1}>
                  <AIAdvisorPanel aiAdvice={results.ai_advice} />
                </Section>
              </div>

              {/* Row 2: Monte Carlo full width */}
              <Section delay={0.15}>
                <MonteCarloChart monteCarloData={results.monte_carlo} />
              </Section>

              {/* Row 3: Heatmap + Volatility side-by-side */}
              <div style={{
                display: "grid",
                gridTemplateColumns: hasVolForecast ? "1fr 1fr" : "1fr",
                gap: 24,
                alignItems: "start",
              }}>
                <Section delay={0.2}>
                  <HeatmapChart correlationMatrix={results.correlation_matrix} />
                </Section>
                {hasVolForecast && (
                  <Section delay={0.25}>
                    <VolatilityChart volatilityForecast={results.volatility_forecast} />
                  </Section>
                )}
              </div>

              {/* Meta footer */}
              {results.meta && (
                <div style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.2)",
                  textAlign: "center",
                  lineHeight: 1.8,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}>
                  Analysed: {results.meta.tickers_analysed?.join(", ")} ·
                  Period: {results.meta.period} ·
                  Total time: {results.meta.timing?.total_s}s
                  {results.meta.tickers_skipped?.length > 0 && (
                    <span style={{ color: "#f87171", marginLeft: 8 }}>
                      · Skipped: {results.meta.tickers_skipped.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </>
  );
}
