import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface PaperTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  shares: number;
  stopLoss: number;
  takeProfit: number;
  status: "open" | "closed";
  pnl?: number;
  pnlPercent?: number;
  notes?: string;
}

export interface OpenPaperTradeParams {
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  shares: number;
}

export interface ClosePaperTradeParams {
  id: string;
}

// ---------------------------------------------------------------------------
// In-memory store (server-side only — survives across requests within a
// single process, resets on restart)
// ---------------------------------------------------------------------------

const store: PaperTrade[] = [];

// ---------------------------------------------------------------------------
// Raw store functions (callable server-side without RPC overhead)
// ---------------------------------------------------------------------------

/** Return all paper trades sorted by entry date descending. */
export function _getPaperTrades(): PaperTrade[] {
  return [...store].sort(
    (a, b) =>
      new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime(),
  );
}

/** Create a new open paper trade and return it. */
export function _openPaperTrade(params: OpenPaperTradeParams): PaperTrade {
  const trade: PaperTrade = {
    id: crypto.randomUUID(),
    symbol: params.symbol,
    direction: params.direction,
    entryPrice: params.entryPrice,
    entryDate: new Date().toISOString(),
    shares: params.shares,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    status: "open",
  };
  store.push(trade);
  return trade;
}

/**
 * Close an open paper trade at the given exit price (provided by caller).
 * Use this server-side to avoid double-fetching quotes.
 */
export function _closePaperTradeAtPrice(
  id: string,
  exitPrice: number,
): PaperTrade {
  const trade = store.find((t) => t.id === id);
  if (!trade) throw new Error(`Trade ${id} not found`);
  if (trade.status === "closed") {
    throw new Error(`Trade ${id} is already closed`);
  }

  trade.exitPrice = exitPrice;
  trade.exitDate = new Date().toISOString();
  trade.status = "closed";

  if (trade.direction === "long") {
    trade.pnl = (trade.exitPrice - trade.entryPrice) * trade.shares;
    trade.pnlPercent =
      ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  } else {
    trade.pnl = (trade.entryPrice - trade.exitPrice) * trade.shares;
    trade.pnlPercent =
      ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
  }

  return trade;
}

// ---------------------------------------------------------------------------
// Server functions (client-facing RPC wrappers)
// ---------------------------------------------------------------------------

/** Return all paper trades sorted by entry date descending. */
export const getPaperTrades = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaperTrade[]> => {
    return _getPaperTrades();
  },
);

/** Create a new open paper trade and return it. */
export const openPaperTrade = createServerFn({ method: "POST" }).handler(
  async (params: OpenPaperTradeParams): Promise<PaperTrade> => {
    return _openPaperTrade(params);
  },
);

/** Close an open paper trade using the latest quote as the exit price. */
export const closePaperTrade = createServerFn({ method: "POST" }).handler(
  async (params: ClosePaperTradeParams): Promise<PaperTrade> => {
    const { fetchQuotes } = await import("~/services/marketData");

    const trade = store.find((t) => t.id === params.id);
    if (!trade) throw new Error(`Trade ${params.id} not found`);
    if (trade.status === "closed") {
      throw new Error(`Trade ${params.id} is already closed`);
    }

    const result = await fetchQuotes([trade.symbol]);
    const quote = result.quotes.find((q) => q.symbol === trade.symbol);
    if (!quote) {
      throw new Error(`Could not fetch current price for ${trade.symbol}`);
    }

    return _closePaperTradeAtPrice(params.id, quote.price);
  },
);
