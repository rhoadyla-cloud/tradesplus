import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoTradeConfig {
  minConfidence: number;
  maxOpenTrades: number;
  sharesPerTrade: number;
  enabled: boolean;
}

export interface AutoTradeResult {
  opened: string[];
  closed: string[];
  errors: string[];
}

export interface AutoTraderStatus {
  config: AutoTradeConfig;
  lastRun: {
    timestamp: number;
    opened: string[];
    closed: string[];
    errors: string[];
  };
}

// ---------------------------------------------------------------------------
// Module-level state (server-side only — loaded lazily)
// ---------------------------------------------------------------------------

let _state: {
  config: AutoTradeConfig;
  lastRun: AutoTraderStatus["lastRun"];
} | null = null;

function getState() {
  if (!_state) {
    _state = {
      config: {
        minConfidence: 20,
        maxOpenTrades: 5,
        sharesPerTrade: 100,
        enabled: false,
      },
      lastRun: {
        timestamp: 0,
        opened: [],
        closed: [],
        errors: [],
      },
    };
  }
  return _state;
}

// ---------------------------------------------------------------------------
// Server functions (client-facing RPC wrappers)
// Each handler uses dynamic imports so no server-only deps leak to the client bundle.
// ---------------------------------------------------------------------------

/** Trigger a full auto-trader cycle. */
export const triggerAutoTrade = createServerFn({ method: "POST" }).handler(
  async (): Promise<AutoTradeResult> => {
    const state = getState();
    const opened: string[] = [];
    const closed: string[] = [];
    const errors: string[] = [];

    if (!state.config.enabled) {
      return { opened, closed, errors };
    }

    // Dynamic imports keep server-only deps out of the client bundle
    const {
      _getPaperTrades,
      _openPaperTrade,
      _closePaperTradeAtPrice,
    } = await import("~/lib/paperTrades");

    // ---- Phase 1: Close trades that hit stop-loss or take-profit ----
    const openTrades = _getPaperTrades().filter((t) => t.status === "open");

    if (openTrades.length > 0) {
      const symbols = [...new Set(openTrades.map((t) => t.symbol))];
      const { fetchQuotes } = await import("~/services/marketData");
      const quoteResult = await fetchQuotes(symbols);
      const quoteMap = new Map(quoteResult.quotes.map((q) => [q.symbol, q]));

      for (const trade of openTrades) {
        const quote = quoteMap.get(trade.symbol);
        if (!quote) continue;

        const currentPrice = quote.price;
        let shouldClose = false;
        let closeReason = "";

        if (trade.direction === "long") {
          if (currentPrice <= trade.stopLoss) {
            shouldClose = true;
            closeReason = "stop-loss";
          } else if (currentPrice >= trade.takeProfit) {
            shouldClose = true;
            closeReason = "take-profit";
          }
        } else {
          if (currentPrice >= trade.stopLoss) {
            shouldClose = true;
            closeReason = "stop-loss";
          } else if (currentPrice <= trade.takeProfit) {
            shouldClose = true;
            closeReason = "take-profit";
          }
        }

        if (shouldClose) {
          try {
            const closedTrade = _closePaperTradeAtPrice(trade.id, currentPrice);
            const pnlStr =
              closedTrade.pnl !== undefined
                ? closedTrade.pnl >= 0
                  ? `+$${closedTrade.pnl.toFixed(0)}`
                  : `-$${Math.abs(closedTrade.pnl).toFixed(0)}`
                : "";
            closed.push(
              `${closedTrade.symbol} ${closedTrade.direction} (${closeReason}) ${pnlStr}`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Close failed ${trade.symbol}: ${msg}`);
          }
        }
      }
    }

    // ---- Phase 2: Open new trades for highest-confidence signals ----
    const stillOpen = _getPaperTrades().filter((t) => t.status === "open");

    if (stillOpen.length < state.config.maxOpenTrades) {
      const slots = state.config.maxOpenTrades - stillOpen.length;

      try {
        const { fetchAllData } = await import("~/services/marketData");
        const { scanWatchlist } = await import("~/engine/scanner");
        const { getWatchlist } = await import("~/lib/watchlist");

        const wlSymbols = getWatchlist();
        const marketData = await fetchAllData();
        const scanResult = await scanWatchlist(wlSymbols, marketData);

        const actionable = scanResult.setups
          .filter(
            (s) =>
              (s.signal === "buy" || s.signal === "sell") &&
              s.confidence >= state.config.minConfidence,
          )
          .filter((s) => !stillOpen.some((t) => t.symbol === s.symbol))
          .slice(0, slots);

        for (const setup of actionable) {
          try {
            const direction = setup.signal === "sell" ? "short" : "long";
            _openPaperTrade({
              symbol: setup.symbol,
              direction,
              entryPrice: setup.entryPrice,
              stopLoss: setup.stopLoss,
              takeProfit: setup.takeProfit,
              shares: state.config.sharesPerTrade,
            });
            opened.push(
              `${setup.symbol} ${direction} @ $${setup.entryPrice.toFixed(2)}`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Open failed ${setup.symbol}: ${msg}`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Scan failed: ${msg}`);
      }
    }

    state.lastRun = { timestamp: Date.now(), opened, closed, errors };
    return { opened, closed, errors };
  },
);

/** Get current auto-trader config + last run info. */
export const getAutoTraderStatus = createServerFn({
  method: "GET",
}).handler(async (): Promise<AutoTraderStatus> => {
  const state = getState();
  return {
    config: { ...state.config },
    lastRun: { ...state.lastRun },
  };
});

/** Update auto-trader config (partial merge). */
export const setAutoTraderConfig = createServerFn({
  method: "POST",
}).handler(
  async (patch: Partial<AutoTradeConfig>): Promise<AutoTraderStatus> => {
    const state = getState();
    if (patch.enabled !== undefined) state.config.enabled = patch.enabled;
    if (patch.minConfidence !== undefined)
      state.config.minConfidence = patch.minConfidence;
    if (patch.maxOpenTrades !== undefined)
      state.config.maxOpenTrades = patch.maxOpenTrades;
    if (patch.sharesPerTrade !== undefined)
      state.config.sharesPerTrade = patch.sharesPerTrade;
    return {
      config: { ...state.config },
      lastRun: { ...state.lastRun },
    };
  },
);
