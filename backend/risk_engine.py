"""
risk_engine.py — Core risk calculation engine for the AI Investment Risk Analyzer.

Provides the RiskEngine class with methods for fetching market data and computing
portfolio risk metrics including Sharpe Ratio, Beta, VaR, Max Drawdown, Monte Carlo
simulation, correlation matrix, and sector concentration.
"""

import numpy as np
import pandas as pd
import yfinance as yf
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


# Sector mapping for common tickers (fallback if yfinance info is unavailable)
SECTOR_FALLBACK: Dict[str, str] = {
    "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology",
    "GOOG": "Technology", "META": "Technology", "NVDA": "Technology",
    "AMD": "Technology", "INTC": "Technology", "CRM": "Technology",
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical", "HD": "Consumer Cyclical",
    "NKE": "Consumer Cyclical", "MCD": "Consumer Defensive", "KO": "Consumer Defensive",
    "PG": "Consumer Defensive", "WMT": "Consumer Defensive",
    "JPM": "Financial Services", "BAC": "Financial Services", "GS": "Financial Services",
    "MS": "Financial Services", "V": "Financial Services", "MA": "Financial Services",
    "JNJ": "Healthcare", "PFE": "Healthcare", "UNH": "Healthcare", "ABBV": "Healthcare",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    "BA": "Industrials", "CAT": "Industrials", "GE": "Industrials",
    "NEE": "Utilities", "DUK": "Utilities",
    "SPY": "ETF", "QQQ": "ETF", "IWM": "ETF",
}


class RiskEngine:
    """
    Calculates portfolio risk metrics using historical price data from Yahoo Finance.

    Attributes:
        market_ticker (str): Ticker symbol used as the market benchmark (default: SPY).
    """

    def __init__(self, market_ticker: str = "SPY"):
        """
        Initialize RiskEngine with a market benchmark ticker.

        Args:
            market_ticker: The ticker symbol representing the broad market index.
        """
        self.market_ticker = market_ticker

    # -------------------------------------------------------------------------
    # Data Fetching
    # -------------------------------------------------------------------------

    def fetch_data(self, tickers: List[str], period: str = "5y") -> Dict[str, pd.DataFrame]:
        """
        Fetch adjusted closing price history for a list of tickers.

        Automatically includes the market benchmark ticker if not already present.

        Args:
            tickers: List of stock ticker symbols.
            period:  yfinance period string, e.g. "5y", "2y", "1y".

        Returns:
            Dictionary mapping ticker → DataFrame with columns ['Close'].

        Raises:
            ValueError: If no valid data can be retrieved for any ticker.
        """
        all_tickers = list(set(tickers + [self.market_ticker]))
        result: Dict[str, pd.DataFrame] = {}
        failed: List[str] = []

        for ticker in all_tickers:
            try:
                data = yf.download(ticker, period=period, auto_adjust=True, progress=False)
                if data.empty:
                    logger.warning("No data returned for ticker: %s", ticker)
                    failed.append(ticker)
                    continue
                result[ticker] = data[["Close"]].copy()
                result[ticker].columns = ["Close"]
            except Exception as exc:
                logger.error("Failed to fetch %s: %s", ticker, exc)
                failed.append(ticker)

        user_tickers = [t for t in tickers if t not in failed]
        if not user_tickers:
            raise ValueError(
                f"Could not retrieve data for any of the provided tickers: {tickers}. "
                "Please check that the symbols are valid."
            )

        if failed:
            logger.warning("Skipped invalid/unavailable tickers: %s", failed)

        return result

    # -------------------------------------------------------------------------
    # Returns
    # -------------------------------------------------------------------------

    def calculate_returns(self, prices: pd.DataFrame) -> pd.Series:
        """
        Compute daily percentage returns from a price series.

        Args:
            prices: DataFrame or Series with a 'Close' column, or a plain Series of prices.

        Returns:
            Series of daily returns with NaN dropped.
        """
        if isinstance(prices, pd.DataFrame):
            series = prices["Close"]
        else:
            series = prices
        return series.pct_change().dropna()

    def portfolio_returns(
        self,
        price_data: Dict[str, pd.DataFrame],
        weights: Dict[str, float],
    ) -> pd.Series:
        """
        Compute weighted portfolio daily returns.

        Args:
            price_data: Dictionary of ticker → price DataFrame.
            weights:    Dictionary of ticker → portfolio weight (should sum to 1).

        Returns:
            Series of daily portfolio returns.
        """
        returns_df = pd.DataFrame(
            {ticker: self.calculate_returns(df) for ticker, df in price_data.items()
             if ticker != self.market_ticker}
        ).dropna()

        # Normalise weights to ensure they sum to 1
        total = sum(weights.values())
        norm_weights = {t: w / total for t, w in weights.items() if t in returns_df.columns}

        weight_array = np.array([norm_weights.get(t, 0.0) for t in returns_df.columns])
        return returns_df.dot(weight_array)

    # -------------------------------------------------------------------------
    # Risk Metrics
    # -------------------------------------------------------------------------

    def sharpe_ratio(self, returns: pd.Series, risk_free: float = 0.05) -> float:
        """
        Calculate the annualised Sharpe Ratio.

        Args:
            returns:   Series of daily portfolio returns.
            risk_free: Annual risk-free rate (default 5 %).

        Returns:
            Annualised Sharpe Ratio as a float. Returns 0.0 on error.
        """
        try:
            daily_rf = risk_free / 252
            excess = returns - daily_rf
            if excess.std() == 0:
                return 0.0
            return float((excess.mean() / excess.std()) * np.sqrt(252))
        except Exception as exc:
            logger.error("sharpe_ratio error: %s", exc)
            return 0.0

    def beta(
        self,
        stock_returns: pd.Series,
        market_returns: pd.Series,
    ) -> float:
        """
        Calculate beta of a stock (or portfolio) relative to the market.

        Uses the standard OLS formula: β = Cov(stock, market) / Var(market).

        Args:
            stock_returns:  Daily returns of the stock/portfolio.
            market_returns: Daily returns of the market benchmark.

        Returns:
            Beta as a float. Returns 1.0 on error.
        """
        try:
            aligned = pd.concat([stock_returns, market_returns], axis=1).dropna()
            if aligned.empty or aligned.shape[0] < 30:
                return 1.0
            cov_matrix = np.cov(aligned.iloc[:, 0], aligned.iloc[:, 1])
            return float(cov_matrix[0, 1] / cov_matrix[1, 1])
        except Exception as exc:
            logger.error("beta error: %s", exc)
            return 1.0

    def value_at_risk(self, returns: pd.Series, confidence: float = 0.95) -> float:
        """
        Calculate the historical Value at Risk (VaR) at a given confidence level.

        VaR is expressed as a positive number representing the maximum expected
        daily loss that will not be exceeded with the given confidence.

        Args:
            returns:    Series of daily returns.
            confidence: Confidence level (e.g. 0.95 for 95 %).

        Returns:
            VaR as a positive float (e.g. 0.023 means 2.3 % daily loss).
        """
        try:
            return float(abs(np.percentile(returns.dropna(), (1 - confidence) * 100)))
        except Exception as exc:
            logger.error("value_at_risk error: %s", exc)
            return 0.0

    def max_drawdown(self, prices: pd.DataFrame) -> float:
        """
        Calculate the Maximum Drawdown from a price series.

        Max Drawdown is the largest peak-to-trough decline in portfolio value.

        Args:
            prices: DataFrame with a 'Close' column (or a plain price Series).

        Returns:
            Max Drawdown as a negative float (e.g. -0.35 means -35 %).
        """
        try:
            series = prices["Close"] if isinstance(prices, pd.DataFrame) else prices
            cumulative = (1 + series.pct_change().dropna()).cumprod()
            rolling_max = cumulative.cummax()
            drawdown = (cumulative - rolling_max) / rolling_max
            return float(drawdown.min())
        except Exception as exc:
            logger.error("max_drawdown error: %s", exc)
            return 0.0

    # -------------------------------------------------------------------------
    # Monte Carlo Simulation
    # -------------------------------------------------------------------------

    def monte_carlo(
        self,
        returns: pd.Series,
        n_simulations: int = 1000,
        n_days: int = 252,
        initial_value: float = 10_000.0,
    ) -> Dict[str, list]:
        """
        Run a Monte Carlo simulation of portfolio value over future trading days.

        Uses the Geometric Brownian Motion (GBM) model parameterised by the
        historical mean and standard deviation of daily returns.

        Args:
            returns:      Series of historical daily returns.
            n_simulations: Number of simulation paths (default 1000).
            n_days:       Number of trading days to simulate (default 252 ≈ 1 year).
            initial_value: Starting portfolio value in dollars.

        Returns:
            Dictionary with keys:
              - 'days': list of day indices [0, 1, ..., n_days]
              - 'p5':   5th-percentile path (pessimistic)
              - 'p50':  50th-percentile path (median)
              - 'p95':  95th-percentile path (optimistic)
        """
        try:
            mu = returns.mean()
            sigma = returns.std()

            # Shape: (n_days, n_simulations)
            daily_returns = np.random.normal(mu, sigma, (n_days, n_simulations))
            # Prepend row of zeros so day 0 == initial_value
            price_paths = np.vstack([
                np.ones((1, n_simulations)) * initial_value,
                initial_value * np.cumprod(1 + daily_returns, axis=0),
            ])

            p5  = np.percentile(price_paths, 5,  axis=1).tolist()
            p50 = np.percentile(price_paths, 50, axis=1).tolist()
            p95 = np.percentile(price_paths, 95, axis=1).tolist()

            return {
                "days": list(range(n_days + 1)),
                "p5":  [round(v, 2) for v in p5],
                "p50": [round(v, 2) for v in p50],
                "p95": [round(v, 2) for v in p95],
            }
        except Exception as exc:
            logger.error("monte_carlo error: %s", exc)
            return {"days": [], "p5": [], "p50": [], "p95": []}

    # -------------------------------------------------------------------------
    # Correlation Matrix
    # -------------------------------------------------------------------------

    def correlation_matrix(self, returns: pd.DataFrame) -> pd.DataFrame:
        """
        Compute the pairwise Pearson correlation matrix for multiple assets.

        Args:
            returns: DataFrame where each column is the daily returns of one asset.

        Returns:
            Correlation matrix as a DataFrame (tickers as both index and columns).
        """
        try:
            return returns.dropna().corr()
        except Exception as exc:
            logger.error("correlation_matrix error: %s", exc)
            return pd.DataFrame()

    # -------------------------------------------------------------------------
    # Sector Concentration
    # -------------------------------------------------------------------------

    def sector_concentration(self, tickers: List[str]) -> Dict[str, float]:
        """
        Estimate equal-weighted sector concentration for a list of tickers.

        Attempts to retrieve sector info from yfinance; falls back to an internal
        lookup table for common tickers. Unknown tickers are labelled 'Unknown'.

        Args:
            tickers: List of stock ticker symbols (market benchmark excluded automatically).

        Returns:
            Dictionary mapping sector name → weight (0–1), summing to 1.0.
        """
        sector_counts: Dict[str, int] = {}
        user_tickers = [t for t in tickers if t != self.market_ticker]

        for ticker in user_tickers:
            sector = None
            try:
                info = yf.Ticker(ticker).info
                sector = info.get("sector") or info.get("category")
            except Exception:
                pass

            if not sector:
                sector = SECTOR_FALLBACK.get(ticker.upper(), "Unknown")

            sector_counts[sector] = sector_counts.get(sector, 0) + 1

        total = len(user_tickers) or 1
        return {s: round(c / total, 4) for s, c in sector_counts.items()}

    # -------------------------------------------------------------------------
    # Convenience: Full Portfolio Analysis
    # -------------------------------------------------------------------------

    def analyze_portfolio(
        self,
        holdings: List[Dict],  # [{"ticker": "AAPL", "shares": 10}, ...]
        period: str = "5y",
    ) -> Dict:
        """
        Perform a complete risk analysis for a portfolio of holdings.

        Fetches price data, computes weights by current market value, and returns
        all risk metrics in a single dictionary.

        Args:
            holdings: List of dicts, each with 'ticker' (str) and 'shares' (int/float).
            period:   Historical data period for yfinance (default "5y").

        Returns:
            Dictionary containing:
              - 'tickers':            list of valid tickers analysed
              - 'weights':            dict of ticker → portfolio weight
              - 'sharpe_ratio':       float
              - 'beta':               float
              - 'var_95':             float (positive, daily)
              - 'max_drawdown':       float (negative)
              - 'sector_concentration': dict of sector → weight
              - 'correlation_matrix': dict (for JSON serialisation)
              - 'monte_carlo':        dict with days / p5 / p50 / p95
              - 'individual_returns': dict of ticker → list of daily returns
        """
        tickers = [h["ticker"].upper() for h in holdings]
        shares_map = {h["ticker"].upper(): h["shares"] for h in holdings}

        # --- Fetch data ---
        price_data = self.fetch_data(tickers, period=period)
        valid_tickers = [t for t in tickers if t in price_data]

        # --- Compute market-value weights ---
        latest_prices = {
            t: float(price_data[t]["Close"].iloc[-1]) for t in valid_tickers
        }
        market_values = {t: latest_prices[t] * shares_map[t] for t in valid_tickers}
        total_value = sum(market_values.values()) or 1.0
        weights = {t: mv / total_value for t, mv in market_values.items()}

        # --- Returns ---
        returns_df = pd.DataFrame(
            {t: self.calculate_returns(price_data[t]) for t in valid_tickers}
        ).dropna()

        port_returns = returns_df.dot(
            pd.Series({t: weights[t] for t in returns_df.columns})
        )

        market_returns = self.calculate_returns(price_data[self.market_ticker])

        # --- Aggregate price series for max drawdown ---
        weighted_price = sum(
            price_data[t]["Close"] * weights[t] for t in valid_tickers
        )
        weighted_price.name = "Close"

        # --- Build correlation matrix (exclude market ticker) ---
        corr_df = self.correlation_matrix(returns_df[valid_tickers])
        corr_dict = corr_df.round(4).to_dict()

        return {
            "tickers": valid_tickers,
            "weights": {t: round(w, 4) for t, w in weights.items()},
            "sharpe_ratio": round(self.sharpe_ratio(port_returns), 4),
            "beta": round(self.beta(port_returns, market_returns), 4),
            "var_95": round(self.value_at_risk(port_returns, 0.95), 4),
            "max_drawdown": round(self.max_drawdown(pd.DataFrame({"Close": weighted_price})), 4),
            "sector_concentration": self.sector_concentration(valid_tickers),
            "correlation_matrix": corr_dict,
            "monte_carlo": self.monte_carlo(port_returns),
            "individual_returns": {
                t: returns_df[t].round(6).tolist() for t in valid_tickers
            },
        }