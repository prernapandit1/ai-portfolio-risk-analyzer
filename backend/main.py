"""
main.py — FastAPI application entry point for the AI Investment Risk Analyzer.

Exposes:
  POST /api/analyze  — Full portfolio analysis (risk metrics, Monte Carlo,
                       correlation matrix, LSTM volatility forecast, AI advice)
  GET  /api/health   — Health check

Run with:
  uvicorn main:app --reload --port 8000
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

from risk_engine import RiskEngine
from lstm_model import LSTMForecaster
from ai_advisor import get_advisor

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Singletons (initialised once at startup) ──────────────────────────────────
risk_engine: RiskEngine = None
advisor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise shared resources on startup; clean up on shutdown."""
    global risk_engine, advisor

    logger.info("Starting up — initialising RiskEngine and AIAdvisor…")
    risk_engine = RiskEngine(market_ticker="SPY")
    advisor = get_advisor()
    logger.info("Startup complete. Advisor type: %s", type(advisor).__name__)

    yield  # ── application runs here ──

    logger.info("Shutting down…")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Investment Risk Analyzer",
    description="Portfolio risk metrics, Monte Carlo simulation, LSTM volatility forecasting, and AI rebalancing advice.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class Holding(BaseModel):
    """A single portfolio holding."""
    ticker: str = Field(..., description="Stock ticker symbol, e.g. 'AAPL'")
    shares: float = Field(..., gt=0, description="Number of shares held (must be > 0)")

    @validator("ticker")
    def normalise_ticker(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned or not cleaned.replace(".", "").replace("-", "").isalnum():
            raise ValueError(f"'{v}' does not look like a valid ticker symbol.")
        return cleaned


class AnalyzeRequest(BaseModel):
    """Request body for POST /api/analyze."""
    portfolio: List[Holding] = Field(
        ...,
        min_items=1,
        max_items=20,
        description="List of holdings (1–20 positions).",
    )
    period: str = Field(
        default="5y",
        description="Historical data period for yfinance, e.g. '1y', '2y', '5y'.",
    )
    run_lstm: bool = Field(
        default=True,
        description="Whether to run the LSTM volatility forecast (slower; set false for quick analysis).",
    )

    @validator("period")
    def validate_period(cls, v: str) -> str:
        allowed = {"1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y"}
        if v not in allowed:
            raise ValueError(f"period must be one of {sorted(allowed)}, got '{v}'.")
        return v


def success_response(data: Any) -> Dict:
    """Wrap data in the standard success envelope."""
    return {"status": "success", "data": data}


def error_response(message: str, code: int = 400) -> JSONResponse:
    """Return a standard error JSON response."""
    return JSONResponse(
        status_code=code,
        content={"status": "error", "message": message},
    )


# ── Middleware: request timing ─────────────────────────────────────────────────

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    """Attach X-Process-Time header (seconds) to every response."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{elapsed:.3f}s"
    return response


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["Utility"])
async def health_check():
    """
    Health check endpoint.

    Returns:
        JSON confirming the service is running and which advisor type is active.
    """
    return success_response({
        "service": "AI Investment Risk Analyzer",
        "version": "1.0.0",
        "advisor_type": type(advisor).__name__,
        "status": "healthy",
    })


@app.post("/api/analyze", tags=["Analysis"])
async def analyze_portfolio(request: AnalyzeRequest):
    """
    Full portfolio analysis endpoint.

    Performs:
    1. Fetches 5-year historical price data via yfinance.
    2. Computes risk metrics: Sharpe Ratio, Beta, VaR (95%), Max Drawdown.
    3. Calculates sector concentration and correlation matrix.
    4. Runs 1 000-path Monte Carlo simulation (252 trading days).
    5. Optionally trains an LSTM per ticker and forecasts 30-day volatility.
    6. Calls the AI advisor for plain-English rebalancing recommendations.

    Request body:
        portfolio: list of {ticker, shares}
        period:    historical data window (default "5y")
        run_lstm:  whether to run LSTM forecasting (default true)

    Returns:
        Standard success envelope containing:
          - risk_metrics
          - monte_carlo
          - correlation_matrix
          - volatility_forecast  (per-ticker LSTM output, or {} if run_lstm=False)
          - ai_advice
          - meta                 (tickers analysed, weights, timing)
    """
    holdings_raw = [{"ticker": h.ticker, "shares": h.shares} for h in request.portfolio]
    tickers = [h.ticker for h in request.portfolio]
    logger.info("Analyze request — tickers: %s | period: %s | lstm: %s",
                tickers, request.period, request.run_lstm)

    # ── 1. Fetch data & compute risk metrics ──────────────────────────────────
    t0 = time.perf_counter()
    try:
        risk_metrics = risk_engine.analyze_portfolio(holdings_raw, period=request.period)
    except ValueError as exc:
        logger.warning("Invalid tickers in request: %s", exc)
        return error_response(str(exc), code=422)
    except Exception as exc:
        logger.exception("Unexpected error in risk engine")
        return error_response(f"Risk engine error: {exc}", code=500)

    valid_tickers = risk_metrics["tickers"]
    price_data = risk_engine.fetch_data(valid_tickers, period=request.period)

    t_risk = time.perf_counter() - t0
    logger.info("Risk metrics computed in %.2fs", t_risk)

    # ── 2. LSTM volatility forecast ───────────────────────────────────────────
    volatility_forecast: Dict = {}
    t_lstm = 0.0

    if request.run_lstm:
        t1 = time.perf_counter()
        volatility_forecast = LSTMForecaster.forecast_all(
            price_data,
            exclude=["SPY"],
        )
        t_lstm = time.perf_counter() - t1
        logger.info("LSTM forecasts complete in %.2fs for %d tickers",
                    t_lstm, len(volatility_forecast))

    # ── 3. AI rebalancing advice ──────────────────────────────────────────────
    t2 = time.perf_counter()
    try:
        ai_advice = advisor.get_advice(risk_metrics)
    except Exception as exc:
        logger.error("AI advisor failed: %s", exc)
        ai_advice = {
            "bullets": ["AI advice unavailable at this time. Please try again later."],
            "raw": str(exc),
            "model": "error",
            "input_summary": {},
        }
    t_ai = time.perf_counter() - t2
    logger.info("AI advice generated in %.2fs", t_ai)

    # ── 4. Format correlation matrix for JSON ─────────────────────────────────
    corr_raw = risk_metrics.pop("correlation_matrix", {})
    # Convert any nested DataFrames / numpy types to plain Python dicts
    corr_serialisable = {
        row: {col: round(float(val), 4) for col, val in cols.items()}
        for row, cols in corr_raw.items()
    }

    # ── 5. Assemble response ──────────────────────────────────────────────────
    individual_returns = risk_metrics.pop("individual_returns", {})  # internal; not sent

    response_data = {
        "risk_metrics": {
            "tickers":               risk_metrics["tickers"],
            "weights":               risk_metrics["weights"],
            "sharpe_ratio":          risk_metrics["sharpe_ratio"],
            "beta":                  risk_metrics["beta"],
            "var_95":                risk_metrics["var_95"],
            "max_drawdown":          risk_metrics["max_drawdown"],
            "sector_concentration":  risk_metrics["sector_concentration"],
        },
        "monte_carlo":          risk_metrics["monte_carlo"],
        "correlation_matrix":   corr_serialisable,
        "volatility_forecast":  volatility_forecast,
        "ai_advice":            ai_advice,
        "meta": {
            "tickers_requested":  tickers,
            "tickers_analysed":   valid_tickers,
            "tickers_skipped":    [t for t in tickers if t not in valid_tickers],
            "period":             request.period,
            "lstm_enabled":       request.run_lstm,
            "timing": {
                "risk_engine_s": round(t_risk, 2),
                "lstm_s":        round(t_lstm, 2),
                "ai_advisor_s":  round(t_ai, 2),
                "total_s":       round(time.perf_counter() - t0, 2),
            },
        },
    }

    logger.info(
        "Analysis complete — tickers: %s | total: %.2fs",
        valid_tickers,
        response_data["meta"]["timing"]["total_s"],
    )
    return success_response(response_data)


# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler — returns a clean JSON error instead of a 500 traceback."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "An unexpected server error occurred. Please try again.",
            "detail": str(exc),
        },
    )


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)