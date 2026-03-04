"""
ai_advisor.py — AI-powered portfolio rebalancing advisor for the Investment Risk Analyzer.

Uses LangChain with OpenAI GPT-3.5-turbo to generate plain-English rebalancing
suggestions based on computed risk metrics. Keeps responses concise (≤200 words)
and structured as actionable bullet points.
"""

import os
import logging
from typing import Dict, List, Optional

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from langchain_core.messages import AIMessage

load_dotenv()

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
DEFAULT_MODEL = "llama-3.3-70b-versatile"
MAX_TOKENS = 300          # Generous ceiling; prompt instructs <200 word response
TEMPERATURE = 0.4         # Slightly creative but grounded
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert portfolio risk analyst and financial advisor. Your role is to \
review a client's portfolio risk metrics and provide clear, actionable rebalancing \
advice in plain English.

Rules:
- Respond ONLY with 3–4 concise bullet points (use "•" as the bullet character).
- Each bullet must be a specific, actionable recommendation.
- Keep the entire response under 200 words.
- Avoid jargon where possible; explain any technical terms briefly.
- Do NOT include any preamble, greeting, or closing statement.
- Do NOT number the bullets.
- Base your advice strictly on the metrics provided.
"""

HUMAN_PROMPT_TEMPLATE = """\
Here are the current portfolio risk metrics:

PORTFOLIO OVERVIEW
──────────────────
• Tickers held:          {tickers}
• Portfolio weights:     {weights}

RISK METRICS
────────────
• Sharpe Ratio:          {sharpe_ratio}  (>1 = good, 0.5–1 = moderate, <0.5 = poor)
• Portfolio Beta:        {beta}          (1.0 = market-neutral; >1.2 = high market sensitivity)
• Value at Risk (95%):   {var_95}        (max expected daily loss with 95% confidence)
• Max Drawdown:          {max_drawdown}  (worst peak-to-trough decline in history)

SECTOR EXPOSURE
───────────────
{sector_concentration}

HIGHEST BETA STOCK
──────────────────
• {highest_beta_ticker} has the highest individual beta of {highest_beta_value}

MONTE CARLO OUTLOOK (252 days)
───────────────────────────────
• Median projected value:    ${mc_median_end:,.0f}  (starting from $10,000)
• Pessimistic (5th pct):     ${mc_p5_end:,.0f}
• Optimistic (95th pct):     ${mc_p95_end:,.0f}

Based on these metrics, provide 3–4 specific rebalancing recommendations.
"""


class AIAdvisor:
    """
    Generates plain-English portfolio rebalancing advice using LangChain + OpenAI.

    The advisor takes the structured risk metrics dict produced by ``RiskEngine``
    and formats it into a prompt for GPT-3.5-turbo, returning bullet-point
    suggestions suitable for display in the ``AIAdvisorPanel`` component.

    Attributes:
        model_name (str): OpenAI model identifier.
        llm (ChatGroq):  LangChain chat model instance.
        chain: LangChain runnable chain (prompt | llm).
    """

    def __init__(self, model_name: str = DEFAULT_MODEL):
        """
        Initialise the advisor, loading the OpenAI API key from the environment.

        Args:
            model_name: OpenAI model to use (default: gpt-3.5-turbo).

        Raises:
            EnvironmentError: If GROQ_API_KEY is not set.
        """
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GROQ_API_KEY is not set. "
                "Add it to backend/.env or export it as an environment variable."
            )

        self.model_name = model_name
        self.llm = ChatGroq(
            model=model_name,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            api_key=api_key,
        )

        system_msg = SystemMessagePromptTemplate.from_template(SYSTEM_PROMPT)
        human_msg = HumanMessagePromptTemplate.from_template(HUMAN_PROMPT_TEMPLATE)
        self.prompt = ChatPromptTemplate.from_messages([system_msg, human_msg])
        self.chain = self.prompt | self.llm

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _find_highest_beta_stock(
        self,
        price_data: Dict[str, object],
        market_ticker: str = "SPY",
    ) -> tuple:
        """
        Identify the ticker with the highest individual beta from pre-computed
        individual returns stored in the risk metrics dict.

        Args:
            price_data:    Dict of ticker → list of daily returns
                           (from risk_metrics['individual_returns']).
            market_ticker: Market benchmark ticker to exclude.

        Returns:
            Tuple of (ticker_str, beta_float). Returns ("N/A", 1.0) on failure.
        """
        import numpy as np

        market_returns = price_data.get(market_ticker)
        if market_returns is None:
            return ("N/A", 1.0)

        market_arr = np.array(market_returns)
        best_ticker, best_beta = "N/A", 0.0

        for ticker, returns in price_data.items():
            if ticker == market_ticker:
                continue
            try:
                arr = np.array(returns)
                min_len = min(len(arr), len(market_arr))
                if min_len < 30:
                    continue
                cov = np.cov(arr[-min_len:], market_arr[-min_len:])
                beta = cov[0, 1] / cov[1, 1] if cov[1, 1] != 0 else 1.0
                if abs(beta) > abs(best_beta):
                    best_beta = beta
                    best_ticker = ticker
            except Exception:
                continue

        return (best_ticker, round(float(best_beta), 3))

    def _format_sector_concentration(self, sector_dict: Dict[str, float]) -> str:
        """
        Format sector concentration dict as a readable multi-line string.

        Args:
            sector_dict: Mapping of sector name → weight (0–1).

        Returns:
            Indented string with one sector per line, sorted by weight descending.
        """
        if not sector_dict:
            return "  No sector data available"
        lines = []
        for sector, weight in sorted(sector_dict.items(), key=lambda x: -x[1]):
            bar = "█" * int(weight * 20)  # simple ASCII bar (max 20 chars)
            lines.append(f"  {sector:<25} {weight * 100:5.1f}%  {bar}")
        return "\n".join(lines)

    def _format_weights(self, weights: Dict[str, float]) -> str:
        """
        Format portfolio weights as a compact inline string.

        Args:
            weights: Mapping of ticker → weight (0–1).

        Returns:
            String like "AAPL 45.2% | GOOGL 32.1% | TSLA 22.7%"
        """
        parts = [f"{t} {w * 100:.1f}%" for t, w in
                 sorted(weights.items(), key=lambda x: -x[1])]
        return " | ".join(parts)

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def get_advice(self, risk_metrics: Dict) -> Dict:
        """
        Generate rebalancing advice from a risk metrics dictionary.

        Builds a structured prompt from the metrics, calls GPT-3.5-turbo via
        LangChain, and parses the response into a list of bullet-point strings.

        Args:
            risk_metrics: Dictionary as returned by ``RiskEngine.analyze_portfolio()``.
                          Expected keys: tickers, weights, sharpe_ratio, beta, var_95,
                          max_drawdown, sector_concentration, monte_carlo,
                          individual_returns.

        Returns:
            Dictionary with:
              - 'bullets':    list of str — the 3–4 recommendation strings (bullet char stripped)
              - 'raw':        str — the full raw LLM response
              - 'model':      str — model name used
              - 'input_summary': dict — key metrics echoed back for transparency

        Raises:
            RuntimeError: If the LLM call fails after retries.
        """
        try:
            # --- Extract and derive values for the prompt ---
            tickers = risk_metrics.get("tickers", [])
            weights = risk_metrics.get("weights", {})
            sharpe = risk_metrics.get("sharpe_ratio", 0.0)
            beta = risk_metrics.get("beta", 1.0)
            var_95 = risk_metrics.get("var_95", 0.0)
            max_dd = risk_metrics.get("max_drawdown", 0.0)
            sector_conc = risk_metrics.get("sector_concentration", {})
            mc = risk_metrics.get("monte_carlo", {})
            individual_returns = risk_metrics.get("individual_returns", {})

            # Monte Carlo end-of-period values
            mc_p5_end  = mc["p5"][-1]  if mc.get("p5")  else 10000
            mc_p50_end = mc["p50"][-1] if mc.get("p50") else 10000
            mc_p95_end = mc["p95"][-1] if mc.get("p95") else 10000

            # Highest-beta individual stock
            highest_beta_ticker, highest_beta_value = self._find_highest_beta_stock(
                individual_returns
            )

            # Human-readable formatting
            sharpe_str = f"{sharpe:.3f}"
            beta_str   = f"{beta:.3f}"
            var_str    = f"{var_95 * 100:.2f}% daily loss"
            max_dd_str = f"{max_dd * 100:.2f}%"
            tickers_str = ", ".join(tickers)
            weights_str = self._format_weights(weights)
            sector_str  = self._format_sector_concentration(sector_conc)

            # --- Invoke the chain ---
            logger.info("Calling %s for portfolio advice on: %s", self.model_name, tickers_str)

            response: AIMessage = self.chain.invoke({
                "tickers":              tickers_str,
                "weights":              weights_str,
                "sharpe_ratio":         sharpe_str,
                "beta":                 beta_str,
                "var_95":               var_str,
                "max_drawdown":         max_dd_str,
                "sector_concentration": sector_str,
                "highest_beta_ticker":  highest_beta_ticker,
                "highest_beta_value":   str(highest_beta_value),
                "mc_median_end":        mc_p50_end,
                "mc_p5_end":            mc_p5_end,
                "mc_p95_end":           mc_p95_end,
            })

            raw_text: str = response.content.strip()

            # --- Parse bullet points ---
            bullets = self._parse_bullets(raw_text)

            return {
                "bullets": bullets,
                "raw": raw_text,
                "model": self.model_name,
                "input_summary": {
                    "sharpe_ratio": sharpe,
                    "beta": beta,
                    "var_95_pct": round(var_95 * 100, 2),
                    "max_drawdown_pct": round(max_dd * 100, 2),
                    "highest_beta_stock": f"{highest_beta_ticker} ({highest_beta_value})",
                    "dominant_sector": max(sector_conc, key=sector_conc.get) if sector_conc else "N/A",
                },
            }

        except Exception as exc:
            logger.error("AIAdvisor.get_advice failed: %s", exc)
            raise RuntimeError(f"Failed to generate AI advice: {exc}") from exc

    def _parse_bullets(self, raw_text: str) -> List[str]:
        """
        Parse the raw LLM response into a clean list of bullet-point strings.

        Handles both "•" bullets and fallback line-by-line splitting.

        Args:
            raw_text: Raw string returned by the LLM.

        Returns:
            List of non-empty strings, each representing one recommendation.
            The leading bullet character (•, -, *) is stripped.
        """
        lines = raw_text.splitlines()
        bullets: List[str] = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Strip common bullet characters
            for char in ("•", "-", "*", "·", "▸", "→"):
                if stripped.startswith(char):
                    stripped = stripped[len(char):].strip()
                    break
            if stripped:
                bullets.append(stripped)

        # Fallback: if no line-by-line parsing worked, return the whole response
        if not bullets:
            bullets = [raw_text.strip()]

        return bullets[:4]   # Cap at 4 bullets as per spec


# ── Fallback advisor (no API key required) ────────────────────────────────────

class FallbackAdvisor:
    """
    Rule-based fallback advisor used when no OpenAI API key is available.

    Generates deterministic rebalancing suggestions based on threshold logic
    applied to the risk metrics. Useful for development / demo mode.
    """

    def get_advice(self, risk_metrics: Dict) -> Dict:
        """
        Generate rule-based advice without calling any external API.

        Args:
            risk_metrics: Same structure as accepted by ``AIAdvisor.get_advice()``.

        Returns:
            Dictionary matching the structure returned by ``AIAdvisor.get_advice()``,
            with 'model' set to 'rule-based-fallback'.
        """
        sharpe   = risk_metrics.get("sharpe_ratio", 0.0)
        beta     = risk_metrics.get("beta", 1.0)
        var_95   = risk_metrics.get("var_95", 0.0)
        max_dd   = risk_metrics.get("max_drawdown", 0.0)
        sectors  = risk_metrics.get("sector_concentration", {})
        weights  = risk_metrics.get("weights", {})

        bullets: List[str] = []

        # Sharpe ratio advice
        if sharpe < 0.5:
            bullets.append(
                f"Your Sharpe Ratio of {sharpe:.2f} is below 0.5, indicating poor "
                "risk-adjusted returns. Consider replacing underperforming positions "
                "with lower-volatility assets or broad index ETFs."
            )
        elif sharpe < 1.0:
            bullets.append(
                f"Your Sharpe Ratio of {sharpe:.2f} is moderate. Look to trim high-"
                "volatility positions and add dividend-paying or defensive stocks to "
                "improve risk-adjusted performance."
            )
        else:
            bullets.append(
                f"Your Sharpe Ratio of {sharpe:.2f} is strong. Maintain your current "
                "allocation but continue monitoring for volatility spikes."
            )

        # Beta advice
        if beta > 1.3:
            bullets.append(
                f"Portfolio beta of {beta:.2f} means your portfolio moves significantly "
                "more than the market. Add low-beta defensive stocks (utilities, consumer "
                "staples) or bonds to reduce market sensitivity."
            )
        elif beta < 0.7:
            bullets.append(
                f"Portfolio beta of {beta:.2f} is very defensive. If you have a long "
                "time horizon, consider adding growth-oriented positions to improve "
                "upside potential."
            )

        # Sector concentration advice
        if sectors:
            top_sector, top_weight = max(sectors.items(), key=lambda x: x[1])
            if top_weight > 0.5:
                bullets.append(
                    f"Over {top_weight * 100:.0f}% of your portfolio is in {top_sector}. "
                    "This concentration increases sector-specific risk — diversify into "
                    "at least 2–3 additional sectors."
                )

        # VaR advice
        if var_95 > 0.03:
            bullets.append(
                f"Your daily VaR (95%) of {var_95 * 100:.1f}% is elevated. On a bad day "
                "you could lose more than this. Consider adding defensive hedges or "
                "reducing position sizes in your most volatile holdings."
            )

        # Max drawdown advice
        if max_dd < -0.40:
            bullets.append(
                f"A historical max drawdown of {max_dd * 100:.1f}% is severe. "
                "Implementing a trailing stop-loss strategy or adding uncorrelated "
                "assets (e.g. bonds, gold) could limit future drawdowns."
            )

        if not bullets:
            bullets.append(
                "Your portfolio metrics look healthy overall. Continue monitoring "
                "quarterly and rebalance if any single sector exceeds 40% of holdings."
            )

        bullets = bullets[:4]
        raw = "\n".join(f"• {b}" for b in bullets)

        return {
            "bullets": bullets,
            "raw": raw,
            "model": "rule-based-fallback",
            "input_summary": {
                "sharpe_ratio": sharpe,
                "beta": beta,
                "var_95_pct": round(var_95 * 100, 2),
                "max_drawdown_pct": round(max_dd * 100, 2),
                "highest_beta_stock": "N/A",
                "dominant_sector": max(sectors, key=sectors.get) if sectors else "N/A",
            },
        }


def get_advisor() -> "AIAdvisor | FallbackAdvisor":
    """
    Factory function that returns an ``AIAdvisor`` if GROQ_API_KEY is set,
    otherwise returns a ``FallbackAdvisor`` for development/demo use.

    Returns:
        AIAdvisor or FallbackAdvisor instance.
    """
    load_dotenv()
    if os.getenv("GROQ_API_KEY"):
        try:
            return AIAdvisor()
        except Exception as exc:
            logger.warning("Could not initialise AIAdvisor (%s). Using fallback.", exc)
    logger.info("GROQ_API_KEY not found — using rule-based FallbackAdvisor.")
    return FallbackAdvisor()