import type { MarketDataResult } from "~/services/marketData";
import { fetchHistorical } from "~/services/marketData";
import {
  calculateRSI,
  calculateEMA,
  calculateSMA,
  detectMACrossover,
  detectVolumeSpike,
  findSupportResistance,
} from "~/engine/indicators";

/** A single trade setup surfaced by the scanner */
export interface TradeSetup {
  symbol: string;
  signal: "buy" | "sell" | "hold";
  confidence: number; // 0–100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  indicators: string[];
  reason: string;
}

export interface ScanResult {
  setups: TradeSetup[];
  scannedAt: number;
  symbolsScanned: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run async tasks with a concurrency cap. */
async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await tasks[idx]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scans the watchlist against market data and historical candles,
 * computes technical indicators, and returns ranked trade setups.
 */
export async function scanWatchlist(
  symbols: string[],
  data: MarketDataResult,
): Promise<ScanResult> {
  const setups: TradeSetup[] = [];
  const symbolsScanned: string[] = [];

  // Build tasks — one per symbol
  const tasks = symbols.map((symbol) => async () => {
    try {
      // Fetch 60 days of historical candles
      const hist = await fetchHistorical(symbol, 60);
      if (hist.candles.length === 0) return;

      // Find the matching quote for the current price
      const quote = data.quotes.find((q) => q.symbol === symbol);
      if (!quote) return;

      const closes = hist.candles.map((c) => c.close);
      const highs = hist.candles.map((c) => c.high);
      const lows = hist.candles.map((c) => c.low);
      const volumes = hist.candles.map((c) => c.volume);

      if (closes.length < 22) return; // Need at least 22 bars for SMA(50) and MA crossover

      // --- Indicator calculations ---
      const rsi = calculateRSI(closes, 14);
      const macd = detectMACrossover(closes, 9, 21);
      const sma50 = calculateSMA(closes, 50);
      const sr = findSupportResistance(highs, lows, 20);

      // Average volume over last 20 days (excluding today)
      const recentVolumes = volumes.slice(-21, -1); // 20 days before today
      const avgVolume =
        recentVolumes.length > 0
          ? recentVolumes.reduce((a, v) => a + v, 0) / recentVolumes.length
          : 0;
      const todayVolume = volumes[volumes.length - 1];
      const volumeSpike = detectVolumeSpike(todayVolume, avgVolume, 1.5);

      const currentPrice = quote.price;

      // --- Confidence scoring ---
      let confidence = 0;
      const reasons: string[] = [];
      const indicators: string[] = [];

      // RSI scoring
      if (rsi.signal === "bullish") {
        confidence += 25;
        reasons.push(`RSI oversold (${rsi.value})`);
        indicators.push(`RSI: ${rsi.value} (oversold)`);
      } else if (rsi.signal === "bearish") {
        confidence -= 25;
        reasons.push(`RSI overbought (${rsi.value})`);
        indicators.push(`RSI: ${rsi.value} (overbought)`);
      } else {
        indicators.push(`RSI: ${rsi.value} (neutral)`);
      }

      // MA crossover
      if (macd.signal === "bullish" && macd.crossover) {
        confidence += 30;
        reasons.push("Bullish MA crossover (9/21 EMA)");
        indicators.push("MA: bullish crossover");
      } else if (macd.signal === "bearish" && macd.crossover) {
        confidence -= 30;
        reasons.push("Bearish MA crossover (9/21 EMA)");
        indicators.push("MA: bearish crossover");
      } else if (macd.signal === "bullish") {
        indicators.push("MA: bullish (no crossover)");
      } else if (macd.signal === "bearish") {
        indicators.push("MA: bearish (no crossover)");
      } else {
        indicators.push("MA: none");
      }

      // Volume spike + price near support
      const nearSupport =
        sr.support !== null &&
        Math.abs(currentPrice - sr.support) / currentPrice < 0.03;
      if (volumeSpike && nearSupport) {
        confidence += 25;
        reasons.push("Volume spike near support");
        indicators.push(`Vol spike + near support (${sr.support})`);
      } else if (volumeSpike) {
        reasons.push("Volume spike detected");
        indicators.push("Volume spike (no support proximity)");
      }

      // Price above/below SMA(50)
      if (sma50 > 0) {
        if (currentPrice > sma50) {
          confidence += 20;
          reasons.push("Price above SMA(50)");
          indicators.push(`Above SMA(50)=${sma50.toFixed(2)}`);
        } else {
          confidence -= 20;
          reasons.push("Price below SMA(50)");
          indicators.push(`Below SMA(50)=${sma50.toFixed(2)}`);
        }
      }

      // Determine signal
      let signal: "buy" | "sell" | "hold";
      if (confidence >= 30) signal = "buy";
      else if (confidence <= -30) signal = "sell";
      else signal = "hold";

      // Clamp confidence to -100..100 for storage, use absolute value
      const absConfidence = Math.min(100, Math.abs(confidence));

      // Entry / Stop Loss / Take Profit
      const entryPrice = currentPrice;
      const stopLoss =
        sr.support !== null
          ? Math.min(sr.support * 0.995, currentPrice * 0.98)
          : currentPrice * 0.98;
      const takeProfit =
        sr.resistance !== null
          ? sr.resistance
          : currentPrice * 1.03;

      symbolsScanned.push(symbol);

      setups.push({
        symbol,
        signal,
        confidence: absConfidence,
        entryPrice: Math.round(entryPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        takeProfit: Math.round(takeProfit * 100) / 100,
        indicators,
        reason: reasons.join("; ") || "No strong signals",
      });
    } catch (err: unknown) {
      // Silently skip symbols where historical fetch fails
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scanner] Skipping ${symbol}: ${message}`);
    }
  });

  // Fetch all historical data with concurrency cap of 3
  await withConcurrencyLimit(tasks, 3);

  // Sort by confidence descending (highest confidence first)
  setups.sort((a, b) => b.confidence - a.confidence);

  return {
    setups,
    scannedAt: Date.now(),
    symbolsScanned,
  };
}
