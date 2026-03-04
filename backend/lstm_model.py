"""
lstm_model.py — LSTM-based 30-day volatility forecasting for the AI Investment Risk Analyzer.

Provides the LSTMForecaster class which trains a 2-layer LSTM neural network on
rolling 60-day windows of realised volatility and predicts the next 30 days.
"""

import numpy as np
import pandas as pd
import logging
from typing import Dict, List, Tuple, Optional

from sklearn.preprocessing import MinMaxScaler
from keras.models import Sequential, load_model
from keras.layers import LSTM, Dense, Dropout
from keras.callbacks import EarlyStopping, ReduceLROnPlateau

logger = logging.getLogger(__name__)

# ── Hyperparameters ────────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 60    # Rolling input window (trading days)
FORECAST_HORIZON = 30   # Days to predict forward
VOL_WINDOW = 21         # Rolling window for realised volatility (trading days)
LSTM_UNITS = 50         # Units per LSTM layer
DROPOUT_RATE = 0.2
EPOCHS = 10
BATCH_SIZE = 32
TRAIN_SPLIT = 0.80
# ──────────────────────────────────────────────────────────────────────────────


class LSTMForecaster:
    """
    Trains a 2-layer LSTM model on historical realised volatility and forecasts
    the next ``FORECAST_HORIZON`` trading days for a single asset.

    Workflow
    --------
    1. ``train(prices)``   — compute rolling vol → scale → build sequences → fit model
    2. ``predict(prices)`` — uses the last ``SEQUENCE_LENGTH`` days as seed → iterative forecast
    3. ``forecast_all(price_data)`` — convenience wrapper for a whole portfolio dict

    Architecture
    ------------
    Input  → LSTM(50, return_sequences=True) → Dropout(0.2)
           → LSTM(50)                         → Dropout(0.2)
           → Dense(1)
    Loss: MSE  |  Optimiser: Adam
    """

    def __init__(self):
        """Initialise forecaster with empty model and scaler."""
        self.model: Optional[Sequential] = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self._is_trained: bool = False

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _compute_volatility(self, prices: pd.DataFrame) -> pd.Series:
        """
        Compute annualised rolling realised volatility from price data.

        Volatility = rolling std of daily log-returns × √252, over ``VOL_WINDOW`` days.

        Args:
            prices: DataFrame with a 'Close' column (or a plain price Series).

        Returns:
            Series of annualised daily volatility values, NaN-dropped.
        """
        series = prices["Close"] if isinstance(prices, pd.DataFrame) else prices
        log_returns = np.log(series / series.shift(1)).dropna()
        volatility = log_returns.rolling(window=VOL_WINDOW).std() * np.sqrt(252)
        return volatility.dropna()

    def _make_sequences(
        self, scaled_data: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Slide a window of length ``SEQUENCE_LENGTH`` over the data to build
        (X, y) training pairs.

        Args:
            scaled_data: 1-D array of scaled volatility values.

        Returns:
            Tuple of:
              - X: shape (n_samples, SEQUENCE_LENGTH, 1)
              - y: shape (n_samples,)
        """
        X, y = [], []
        for i in range(SEQUENCE_LENGTH, len(scaled_data)):
            X.append(scaled_data[i - SEQUENCE_LENGTH: i])
            y.append(scaled_data[i])
        return np.array(X).reshape(-1, SEQUENCE_LENGTH, 1), np.array(y)

    def _build_model(self) -> Sequential:
        """
        Construct and compile the 2-layer LSTM architecture.

        Returns:
            Compiled Keras Sequential model.
        """
        model = Sequential(name="volatility_lstm")

        model.add(LSTM(
            units=LSTM_UNITS,
            return_sequences=True,
            input_shape=(SEQUENCE_LENGTH, 1),
            name="lstm_1",
        ))
        model.add(Dropout(DROPOUT_RATE, name="dropout_1"))

        model.add(LSTM(
            units=LSTM_UNITS,
            return_sequences=False,
            name="lstm_2",
        ))
        model.add(Dropout(DROPOUT_RATE, name="dropout_2"))

        model.add(Dense(units=1, name="output"))

        model.compile(optimizer="adam", loss="mean_squared_error")
        return model

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def train(self, prices: pd.DataFrame) -> Dict:
        """
        Fit the LSTM model on rolling realised volatility derived from ``prices``.

        Steps
        -----
        1. Compute annualised rolling volatility.
        2. Scale to [0, 1] with MinMaxScaler (fit on train split only).
        3. Build (X, y) sequences with a 60-day rolling window.
        4. Split 80 / 20 into train / test sets.
        5. Train with EarlyStopping (patience=10) and ReduceLROnPlateau.

        Args:
            prices: DataFrame with a 'Close' column containing price history.
                    Needs at least ``SEQUENCE_LENGTH + VOL_WINDOW + 10`` rows
                    (~90 trading days ≈ 4–5 months).

        Returns:
            Dictionary with training diagnostics:
              - 'train_loss':    final training loss
              - 'val_loss':      final validation loss
              - 'epochs_run':    actual number of epochs (may be < EPOCHS due to early stopping)
              - 'train_samples': number of training sequences
              - 'test_samples':  number of test sequences

        Raises:
            ValueError: If there is insufficient price history to build sequences.
        """
        volatility = self._compute_volatility(prices)

        min_required = SEQUENCE_LENGTH + VOL_WINDOW + 10
        if len(volatility) < min_required:
            raise ValueError(
                f"Insufficient data: need at least {min_required} data points "
                f"after computing rolling volatility, got {len(volatility)}. "
                "Try using a longer history period (e.g. period='5y')."
            )

        # Scale using only the training portion to avoid data leakage
        vol_array = volatility.values.reshape(-1, 1)
        split_idx = int(len(vol_array) * TRAIN_SPLIT)

        self.scaler.fit(vol_array[:split_idx])
        scaled = self.scaler.transform(vol_array).flatten()

        X, y = self._make_sequences(scaled)

        # Recalculate split on sequence arrays (sequences start at index SEQUENCE_LENGTH)
        n_train = int(len(X) * TRAIN_SPLIT)
        X_train, X_test = X[:n_train], X[n_train:]
        y_train, y_test = y[:n_train], y[n_train:]

        logger.info(
            "Training LSTM on %d sequences (%d train / %d test)…",
            len(X), len(X_train), len(X_test),
        )

        self.model = self._build_model()

        callbacks = [
            EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True),
            ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5, min_lr=1e-6),
        ]

        history = self.model.fit(
            X_train, y_train,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            validation_data=(X_test, y_test),
            callbacks=callbacks,
            verbose=0,
        )

        self._is_trained = True
        self._last_volatility = volatility  # cache for predict()

        epochs_run = len(history.history["loss"])
        return {
            "train_loss":    round(float(history.history["loss"][-1]), 6),
            "val_loss":      round(float(history.history["val_loss"][-1]), 6),
            "epochs_run":    epochs_run,
            "train_samples": int(len(X_train)),
            "test_samples":  int(len(X_test)),
        }

    def predict(self, prices: pd.DataFrame) -> Dict:
        """
        Generate a 30-day volatility forecast using the trained model.

        Uses the last ``SEQUENCE_LENGTH`` days of realised volatility as the
        seed sequence and iteratively predicts one step ahead, appending each
        prediction to the rolling window (autoregressive / "walk-forward" style).

        Args:
            prices: DataFrame with a 'Close' column.  Can be the same data used
                    for training or a fresh slice ending at "today".

        Returns:
            Dictionary with:
              - 'historical_dates':    list of ISO date strings for historical window
              - 'historical_vol':      list of annualised vol values (historical portion)
              - 'forecast_dates':      list of ISO date strings for the 30-day forecast
              - 'forecast_vol':        list of predicted annualised vol values
              - 'last_historical_vol': last observed volatility value (for chart continuity)

        Raises:
            RuntimeError: If ``train()`` has not been called before ``predict()``.
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError(
                "Model has not been trained. Call train(prices) before predict()."
            )

        volatility = self._compute_volatility(prices)
        vol_array = volatility.values.reshape(-1, 1)
        scaled = self.scaler.transform(vol_array).flatten()

        # Seed: last SEQUENCE_LENGTH observations
        if len(scaled) < SEQUENCE_LENGTH:
            raise ValueError(
                f"Need at least {SEQUENCE_LENGTH} volatility observations to forecast; "
                f"got {len(scaled)}."
            )

        seed = list(scaled[-SEQUENCE_LENGTH:])
        predictions_scaled: List[float] = []

        for _ in range(FORECAST_HORIZON):
            seq = np.array(seed[-SEQUENCE_LENGTH:]).reshape(1, SEQUENCE_LENGTH, 1)
            next_val = float(self.model.predict(seq, verbose=0)[0, 0])
            predictions_scaled.append(next_val)
            seed.append(next_val)

        # Inverse-transform back to annualised volatility
        forecast_vol = self.scaler.inverse_transform(
            np.array(predictions_scaled).reshape(-1, 1)
        ).flatten().tolist()

        # Build date indices
        last_date = volatility.index[-1]
        business_days = pd.bdate_range(start=last_date, periods=FORECAST_HORIZON + 1)[1:]
        forecast_dates = [d.strftime("%Y-%m-%d") for d in business_days]

        # Return a trailing window of historical vol for context in the chart
        HISTORY_WINDOW = 90
        hist_series = volatility.iloc[-HISTORY_WINDOW:]
        historical_dates = [d.strftime("%Y-%m-%d") for d in hist_series.index]
        historical_vol = [round(float(v), 6) for v in hist_series.values]

        return {
            "historical_dates":    historical_dates,
            "historical_vol":      historical_vol,
            "forecast_dates":      forecast_dates,
            "forecast_vol":        [round(v, 6) for v in forecast_vol],
            "last_historical_vol": round(float(volatility.iloc[-1]), 6),
        }

    def train_and_predict(self, prices: pd.DataFrame) -> Dict:
        """
        Convenience method: train then immediately predict.

        Args:
            prices: DataFrame with a 'Close' column.

        Returns:
            Merged dictionary containing both training diagnostics and forecast output.
        """
        train_info = self.train(prices)
        forecast = self.predict(prices)
        return {**train_info, **forecast}

    # -------------------------------------------------------------------------
    # Portfolio-level helper
    # -------------------------------------------------------------------------

    @staticmethod
    def forecast_all(
        price_data: Dict[str, pd.DataFrame],
        exclude: Optional[List[str]] = None,
    ) -> Dict[str, Dict]:
        """
        Train a separate LSTM forecaster for each ticker and return all forecasts.

        A fresh ``LSTMForecaster`` instance is created per ticker so models are
        fully independent.

        Args:
            price_data: Dictionary of ticker → price DataFrame (from RiskEngine.fetch_data).
            exclude:    Optional list of tickers to skip (e.g. ["SPY"]).

        Returns:
            Dictionary of ticker → forecast dict (same structure as ``predict()``).
            Tickers that fail to train are logged and omitted from the result.
        """
        exclude = set(t.upper() for t in (exclude or []))
        results: Dict[str, Dict] = {}

        for ticker, df in price_data.items():
            if ticker.upper() in exclude:
                continue
            try:
                forecaster = LSTMForecaster()
                result = forecaster.train_and_predict(df)
                results[ticker] = result
                logger.info("LSTM forecast complete for %s", ticker)
            except Exception as exc:
                logger.error("LSTM forecast failed for %s: %s", ticker, exc)

        return results