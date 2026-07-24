/**
 * Curated watchlist of liquid, high-volume US stocks suitable for day trading.
 * Focus: large-cap equities and major ETFs with tight spreads and high liquidity.
 */
export const DEFAULT_WATCHLIST: string[] = [
  "AAPL",  // Apple Inc.
  "MSFT",  // Microsoft Corporation
  "NVDA",  // NVIDIA Corporation
  "SPY",   // SPDR S&P 500 ETF Trust
  "TSLA",  // Tesla, Inc.
  "META",  // Meta Platforms, Inc.
  "AMZN",  // Amazon.com, Inc.
  "GOOGL", // Alphabet Inc. (Class A)
  "AMD",   // Advanced Micro Devices, Inc.
  "QQQ",   // Invesco QQQ Trust (Nasdaq-100)
  "JPM",   // JPMorgan Chase & Co.
  "BA",    // The Boeing Company
  "NFLX",  // Netflix, Inc.
  "INTC",  // Intel Corporation
  "DIS",   // The Walt Disney Company
];

/**
 * Returns the default watchlist. Can be extended to support user-customized lists
 * or persistence in the future.
 */
export function getWatchlist(): string[] {
  return [...DEFAULT_WATCHLIST];
}
