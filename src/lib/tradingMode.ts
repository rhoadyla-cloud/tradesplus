/**
 * Trading mode state management.
 *
 * Tracks whether the UI / auto-trader should operate in "paper" (default) or
 * "alpaca" mode. Mode is stored in-memory server-side (like paperTrades).
 */

import { createServerFn } from "@tanstack/react-start";

export type TradingMode = "paper" | "alpaca";

// Module-level state (server-side only)
let _mode: TradingMode = "paper";

/** Get the current trading mode. */
export const getTradingMode = createServerFn({ method: "GET" }).handler(
  async (): Promise<TradingMode> => {
    return _mode;
  },
);

/** Set the trading mode. */
export const setTradingMode = createServerFn({ method: "POST" }).handler(
  async (mode: TradingMode): Promise<TradingMode> => {
    _mode = mode;
    return _mode;
  },
);

/** Raw accessor for server-side code (no RPC). */
export function _getTradingMode(): TradingMode {
  return _mode;
}
