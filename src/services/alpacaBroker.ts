/**
 * Alpaca Markets brokerage wrapper.
 *
 * Wraps Alpaca's Trading API (paper or live) behind a clean interface used by
 * the UI and auto-trader. Every function returns `{ success, ...data } | { success: false, error }`
 * so callers never have to catch exceptions.
 */

import { createServerFn } from "@tanstack/react-start";
import type AlpacaClass from "@alpacahq/alpaca-trade-api";

// Minimal position shape used by mapPosition — avoids importing the full SDK.
interface AlpacaRawPosition {
  symbol: string;
  qty: unknown;
  avgEntryPrice: unknown;
  marketValue: unknown;
  unrealizedPl: unknown;
  costBasis: unknown;
  currentPrice: unknown;
  side?: string;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  symbol: string;
  direction: "long" | "short";
  shares: number;
  entryPrice?: number; // only used for limit orders; if omitted → market order
  stopLoss?: number;
  takeProfit?: number;
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPercent: number;
  side: "long" | "short";
  costBasis: number;
  currentPrice: number;
}

export interface AlpacaAccount {
  buyingPower: number;
  cash: number;
  equity: number;
  longMarketValue: number;
  shortMarketValue: number;
  dayTradeCount: number;
  patternDayTrader: boolean;
  status: string;
}

export type AlpacaResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
let _initError: string | null = null;

async function getClient(): Promise<any> {
  if (_client) return _client;
  if (_initError) return null;

  const keyId = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  const paper = process.env.ALPACA_PAPER !== "false"; // default to paper

  if (!keyId || !secret) {
    _initError = "Alpaca API keys not set (ALPACA_API_KEY / ALPACA_API_SECRET)";
    return null;
  }

  try {
    // Dynamic import keeps the Alpaca SDK out of the client bundle
    const { Alpaca } = await import("@alpacahq/alpaca-trade-api");
    _client = new Alpaca({ keyId, secret, paper });
    return _client;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    _initError = `Failed to initialize Alpaca client: ${msg}`;
    return null;
  }
}

/** Reset the client (e.g. when keys are updated). */
export function resetAlpacaClient(): void {
  _client = null;
  _initError = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(val: unknown, fallback = 0): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function mapPosition(p: AlpacaRawPosition): AlpacaPosition {
  const qty = parseNumber(p.qty);
  const avgEntryPrice = parseNumber(p.avgEntryPrice);
  const marketValue = parseNumber(p.marketValue);
  const unrealizedPl = parseNumber(p.unrealizedPl);
  const costBasis = parseNumber(p.costBasis);
  const currentPrice = parseNumber(p.currentPrice);
  const unrealizedPlPercent =
    costBasis !== 0 ? (unrealizedPl / costBasis) * 100 : 0;

  const side: "long" | "short" = parseNumber(p.qty) >= 0 ? "long" : "short";

  return {
    symbol: p.symbol,
    qty: Math.abs(qty),
    avgEntryPrice,
    marketValue,
    unrealizedPl,
    unrealizedPlPercent: Math.round(unrealizedPlPercent * 100) / 100,
    side,
    costBasis,
    currentPrice,
  };
}

function toSide(direction: "long" | "short"): "buy" | "sell" {
  return direction === "long" ? "buy" : "sell";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Place an order on Alpaca. Uses a market order when `entryPrice` is not
 * provided; otherwise places a limit order at that price.
 */
export async function placeOrder(
  params: PlaceOrderParams,
): Promise<AlpacaResult<any>> {
  const alpaca = await getClient();
  if (!alpaca) {
      return { success: false, error: _initError ?? "Alpaca client not available" };
    }

    try {
      const side = toSide(params.direction);
      const notionalAmount = params.entryPrice
        ? params.entryPrice * params.shares
        : undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let order: any;
      if (params.entryPrice !== undefined) {
      order = await alpaca.trading.orders.limit({
        symbol: params.symbol,
        qty: params.shares,
        side,
        limitPrice: params.entryPrice,
        timeInForce: "day",
      });
    } else {
      order = await alpaca.trading.orders.market({
        symbol: params.symbol,
        qty: params.shares,
        side,
        timeInForce: "day",
      });
    }

    console.log(
      `[alpacaBroker] Order placed: ${params.symbol} ${params.direction} ${params.shares} shares (id=${order.id})`,
    );
    return { success: true, data: order };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[alpacaBroker] placeOrder failed for ${params.symbol}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Close an open position for the given symbol.
 */
export async function closePosition(
  symbol: string,
): Promise<AlpacaResult<any>> {
  const alpaca = await getClient();
  if (!alpaca) {
    return { success: false, error: _initError ?? "Alpaca client not available" };
  }

  try {
    const order = await alpaca.trading.positions.deleteOpenPosition({
      symbolOrAssetId: symbol,
    });
    console.log(`[alpacaBroker] Position closed: ${symbol} (orderId=${order.id})`);
    return { success: true, data: order };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[alpacaBroker] closePosition failed for ${symbol}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Fetch all current positions from Alpaca.
 */
export async function getPositions(): Promise<AlpacaResult<AlpacaPosition[]>> {
  const alpaca = await getClient();
  if (!alpaca) {
    return { success: false, error: _initError ?? "Alpaca client not available" };
  }

  try {
    const positions = await alpaca.trading.positions.getAllOpenPositions();
    return { success: true, data: positions.map(mapPosition) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[alpacaBroker] getPositions failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Fetch the account summary from Alpaca.
 */
export async function getAccount(): Promise<AlpacaResult<AlpacaAccount>> {
  const alpaca = await getClient();
  if (!alpaca) {
    return { success: false, error: _initError ?? "Alpaca client not available" };
  }

  try {
    const account = await alpaca.trading.account.getAccount();
    return {
      success: true,
      data: {
        buyingPower: parseNumber(account.buyingPower),
        cash: parseNumber(account.cash),
        equity: parseNumber(account.equity),
        longMarketValue: parseNumber(account.longMarketValue),
        shortMarketValue: parseNumber(account.shortMarketValue),
        dayTradeCount: parseNumber(account.daytradeCount, 0),
        patternDayTrader: account.patternDayTrader === true,
        status: account.status ?? "UNKNOWN",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[alpacaBroker] getAccount failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Test the connection to Alpaca without throwing.
 * Returns `{ success: true }` when API keys are valid and the account is reachable.
 */
export async function validateConnection(): Promise<
  { success: true } | { success: false; error: string }
> {
  const alpaca = await getClient();
  if (!alpaca) {
    return { success: false, error: _initError ?? "Alpaca client not available" };
  }

  try {
    const check = await alpaca.trading.validateConnection();
    if (check.ok) {
      return { success: true };
    }
    return { success: false, error: check.message };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Check whether Alpaca keys are configured (does not validate them).
 */
export function hasKeys(): boolean {
  const keyId = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  return Boolean(keyId && secret);
}

// ---------------------------------------------------------------------------
// Server functions (client-facing RPC wrappers)
// ---------------------------------------------------------------------------

/** Close an Alpaca position by symbol (from the client). */
export const closeAlpacaPosition = createServerFn({ method: "POST" }).handler(
  async (symbol: string): Promise<AlpacaResult<AlpacaPosition[]>> => {
    const result = await closePosition(symbol);
    if (!result.success) return result;

    // Return updated positions list after the close
    return getPositions();
  },
);

/** Fetch Alpaca positions (from the client). */
export const fetchAlpacaPositions = createServerFn({ method: "GET" }).handler(
  async (): Promise<AlpacaResult<AlpacaPosition[]>> => {
    return getPositions();
  },
);

/** Fetch Alpaca account (from the client). */
export const fetchAlpacaAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<AlpacaResult<AlpacaAccount>> => {
    return getAccount();
  },
);

/** Check Alpaca connection status (from the client). */
export const checkAlpacaConnection = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ connected: boolean; error?: string }> => {
    if (!hasKeys()) {
      return { connected: false, error: "API keys not configured" };
    }
    const result = await validateConnection();
    return { connected: result.success, error: result.success ? undefined : result.error };
  },
);
