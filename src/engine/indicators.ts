/** Technical indicator types */

export interface IndicatorResult {
  value: number;
  signal: "bullish" | "bearish" | "neutral";
  label: string;
}

/**
 * Computes Relative Strength Index (RSI) for a series of closing prices.
 * Standard Wilder's RSI formula using smoothed average gains/losses.
 */
export function calculateRSI(closes: number[], period: number = 14): IndicatorResult {
  if (closes.length < period + 1) {
    return { value: 50, signal: "neutral", label: `RSI(${period})` };
  }

  // Compute price changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss over the first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth subsequent values with Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    // No losses — RSI is 100
    return { value: 100, signal: "bearish", label: `RSI(${period})` };
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  let signal: "bullish" | "bearish" | "neutral";
  if (rsi < 30) signal = "bullish";
  else if (rsi > 70) signal = "bearish";
  else signal = "neutral";

  return {
    value: Math.round(rsi * 100) / 100,
    signal,
    label: `RSI(${period})`,
  };
}

/**
 * Simple Moving Average — arithmetic mean of the last `period` prices.
 * Returns the most recent SMA value, or 0 if there aren't enough data points.
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(prices.length - period);
  const sum = slice.reduce((acc, p) => acc + p, 0);
  return sum / period;
}

/**
 * Exponential Moving Average using the standard EMA formula.
 * First value is the SMA of the first `period` prices; subsequent values
 * use the EMA smoothing multiplier α = 2/(period + 1).
 * Returns the last EMA value, or 0 if insufficient data.
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;

  const alpha = 2 / (period + 1);

  // Seed: SMA of first `period` prices
  let ema = prices.slice(0, period).reduce((acc, p) => acc + p, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * alpha + ema;
  }

  return Math.round(ema * 100) / 100;
}

/**
 * Detects Moving Average crossover between a fast and slow EMA.
 * Compares the last TWO bars to detect crossing.
 * - Bullish crossover: fast was below slow, now fast > slow
 * - Bearish crossover: fast was above slow, now fast < slow
 */
export function detectMACrossover(
  prices: number[],
  fastPeriod: number = 9,
  slowPeriod: number = 21,
): { signal: "bullish" | "bearish" | "none"; crossover: boolean } {
  const minLen = Math.max(fastPeriod, slowPeriod) + 1;
  if (prices.length < minLen) {
    return { signal: "none", crossover: false };
  }

  // Build EMA series for the last 2 bars
  const prevPrices = prices.slice(0, prices.length - 1);
  const currPrices = prices;

  const fastPrev = calculateEMA(prevPrices, fastPeriod);
  const slowPrev = calculateEMA(prevPrices, slowPeriod);
  const fastCurr = calculateEMA(currPrices, fastPeriod);
  const slowCurr = calculateEMA(currPrices, slowPeriod);

  const fastAbovePrev = fastPrev > slowPrev;
  const fastAboveCurr = fastCurr > slowCurr;

  if (fastAboveCurr && !fastAbovePrev) {
    return { signal: "bullish", crossover: true };
  }
  if (!fastAboveCurr && fastAbovePrev) {
    return { signal: "bearish", crossover: true };
  }

  // No crossover, but report the current alignment
  if (fastAboveCurr) return { signal: "bullish", crossover: false };
  return { signal: "bearish", crossover: false };
}

/**
 * Returns true if the current volume exceeds `avgVolume * threshold`.
 */
export function detectVolumeSpike(
  volume: number,
  avgVolume: number,
  threshold: number = 1.5,
): boolean {
  if (avgVolume <= 0) return false;
  return volume > avgVolume * threshold;
}

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  crossover: "bullish" | "bearish" | "none";
}

/**
 * Computes Moving Average Convergence Divergence (MACD).
 * MACD Line = EMA(fast) - EMA(slow)
 * Signal Line = EMA(MACD Line, signalPeriod)
 * Histogram = MACD Line - Signal Line
 *
 * Crossover detection compares the current and previous bar's histogram:
 * - Bullish: histogram crosses from negative to positive
 * - Bearish: histogram crosses from positive to negative
 */
export function calculateMACD(
  prices: number[],
  fast: number = 12,
  slow: number = 26,
  signalPeriod: number = 9,
): MACDResult {
  const minLen = slow + signalPeriod;
  if (prices.length < minLen) {
    return { macdLine: 0, signalLine: 0, histogram: 0, crossover: "none" };
  }

  // Helper: full EMA series
  function emaSeries(data: number[], period: number): number[] {
    const alpha = 2 / (period + 1);
    const result: number[] = [];
    // Seed with SMA of first `period` values
    let ema = data.slice(0, period).reduce((a, v) => a + v, 0) / period;
    result.push(ema);
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * alpha + ema;
      result.push(ema);
    }
    return result;
  }

  const emaFast = emaSeries(prices, fast);
  const emaSlow = emaSeries(prices, slow);

  // Align: MACD line starts when both EMAs have values
  const offset = slow - fast;
  const macdSeries: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdSeries.push(emaFast[i + offset] - emaSlow[i]);
  }

  // Signal line = EMA of MACD series
  const signalSeries = emaSeries(macdSeries, signalPeriod);

  const macdLine = Math.round(macdSeries[macdSeries.length - 1] * 100) / 100;
  const signalLine =
    Math.round(signalSeries[signalSeries.length - 1] * 100) / 100;
  const histogram = Math.round((macdLine - signalLine) * 100) / 100;

  // Crossover: compare last two histogram values
  const prevHistogram =
    macdSeries[macdSeries.length - 2] - signalSeries[signalSeries.length - 2];
  let crossover: "bullish" | "bearish" | "none" = "none";
  if (prevHistogram <= 0 && histogram > 0) crossover = "bullish";
  else if (prevHistogram >= 0 && histogram < 0) crossover = "bearish";

  return { macdLine, signalLine, histogram, crossover };
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  position: "above" | "inside" | "below";
}

/**
 * Computes Bollinger Bands.
 * - middle = SMA(period)
 * - upper / lower = middle ± stdDev * sample stddev
 * - bandwidth = (upper - lower) / middle
 * - position: "below" if price < lower (bullish reversal signal),
 *   "above" if price > upper (bearish reversal signal), "inside" otherwise
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2,
): BollingerBandsResult {
  if (prices.length < period) {
    return { upper: 0, middle: 0, lower: 0, bandwidth: 0, position: "inside" };
  }

  const slice = prices.slice(prices.length - period);
  const middle = slice.reduce((a, v) => a + v, 0) / period;
  const variance =
    slice.reduce((a, v) => a + (v - middle) ** 2, 0) / (period - 1);
  const stdev = Math.sqrt(variance);
  const upper = middle + stdDev * stdev;
  const lower = middle - stdDev * stdev;
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0;

  const currentPrice = prices[prices.length - 1];
  let position: "above" | "inside" | "below";
  if (currentPrice < lower) position = "below";
  else if (currentPrice > upper) position = "above";
  else position = "inside";

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 10000) / 10000,
    position,
  };
}

/**
 * Identifies support and resistance levels from recent price data.
 * - Resistance = highest high in the lookback window
 * - Support = lowest low in the lookback window
 */
export function findSupportResistance(
  highs: number[],
  lows: number[],
  lookback: number = 20,
): { support: number | null; resistance: number | null } {
  const windowHighs = highs.slice(-lookback);
  const windowLows = lows.slice(-lookback);

  if (windowHighs.length === 0 || windowLows.length === 0) {
    return { support: null, resistance: null };
  }

  const resistance = Math.max(...windowHighs);
  const support = Math.min(...windowLows);

  return {
    support: Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
  };
}
