import YahooFinance from "yahoo-finance2";

import { getWatchlist } from "~/lib/watchlist";

// Singleton instance — Yahoo Finance v4 requires explicit instantiation
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

/** Market data types for TradePulse AI */

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap: number;
  timestamp: number;
}

export interface MarketDataResult {
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
  fetchedAt: number;
}

export interface HistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalResult {
  symbol: string;
  candles: HistoricalCandle[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run async tasks with a concurrency cap — never more than `limit` in flight.
 */
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

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

/**
 * Convert a yahoo-finance2 QuoteResponse object into our internal Quote type.
 * Returns null when required fields are missing (e.g. delisted / untradeable).
 */
function mapQuote(
  symbol: string,
  raw: Record<string, unknown>,
): Quote | null {
  const price = asNumber(raw.regularMarketPrice);
  if (price === undefined) return null;

  return {
    symbol,
    price,
    change: asNumber(raw.regularMarketChange) ?? 0,
    changePercent: asNumber(raw.regularMarketChangePercent) ?? 0,
    volume: asNumber(raw.regularMarketVolume) ?? 0,
    high: asNumber(raw.regularMarketDayHigh) ?? price,
    low: asNumber(raw.regularMarketDayLow) ?? price,
    open: asNumber(raw.regularMarketOpen) ?? price,
    previousClose: asNumber(raw.regularMarketPreviousClose) ?? price,
    marketCap: asNumber(raw.marketCap) ?? 0,
    timestamp: Date.now(),
  };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch real-time quotes for a list of symbols using Yahoo Finance.
 * Caps concurrent requests at 5 to keep memory usage low.
 */
export async function fetchQuotes(symbols: string[]): Promise<MarketDataResult> {
  const errors: { symbol: string; message: string }[] = [];
  const quotes: Quote[] = [];

  const tasks = symbols.map((symbol) => async () => {
    try {
      const raw = (await yahooFinance.quote(symbol)) as Record<string, unknown>;
      const quote = mapQuote(symbol, raw);
      if (quote) {
        quotes.push(quote);
      } else {
        errors.push({ symbol, message: `No price data returned for ${symbol}` });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, message });
    }
  });

  await withConcurrencyLimit(tasks, 5);

  return {
    quotes,
    errors,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch daily OHLCV candles for a single symbol covering the last `days`
 * calendar days. Returns up to `days` candles (weekends/holidays excluded by
 * Yahoo Finance so the actual count may be lower).
 */
export async function fetchHistorical(
  symbol: string,
  days: number,
): Promise<HistoricalResult> {
  try {
    const now = new Date();
    const period1 = new Date(now);
    period1.setDate(period1.getDate() - days);

    // yahoo-finance2 v4 historical accepts Date objects for period1/period2
    const rows = await yahooFinance.historical(symbol, {
      period1,
      period2: now,
      interval: "1d",
    });

    const candles: HistoricalCandle[] = rows.map((row) => ({
      date: row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date ?? ""),
      open: Number(row.open) || 0,
      high: Number(row.high) || 0,
      low: Number(row.low) || 0,
      close: Number(row.close) || 0,
      volume: Number(row.volume) || 0,
    }));

    return { symbol, candles };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[marketData] Historical fetch failed for ${symbol}: ${message}`);
    return { symbol, candles: [] };
  }
}

/**
 * Convenience: fetch quotes for the full default watchlist.
 */
export async function fetchAllData(): Promise<MarketDataResult> {
  return fetchQuotes(getWatchlist());
}
