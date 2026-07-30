import { useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import type { PaperTrade } from "~/lib/paperTrades";
import { closePaperTrade } from "~/lib/paperTrades";
import { closeAlpacaPosition } from "~/services/alpacaBroker";
import type { AlpacaPosition, AlpacaAccount } from "~/services/alpacaBroker";
import type { TradingMode } from "~/lib/tradingMode";

export type { PaperTrade } from "~/lib/paperTrades";

export interface PaperTradeLogProps {
  trades: PaperTrade[];
  tradingMode?: TradingMode;
  alpacaPositions?: AlpacaPosition[];
  alpacaAccount?: AlpacaAccount | null;
  alpacaConnected?: boolean;
}

/**
 * Full trading journal. Shows paper trades in paper mode, Alpaca positions
 * in Alpaca mode. Displays summary stats and allows closing open positions.
 */
export function PaperTradeLog({
  trades,
  tradingMode = "paper",
  alpacaPositions = [],
  alpacaAccount = null,
  alpacaConnected = false,
}: PaperTradeLogProps) {
  const router = useRouter();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  const handleCloseTrade = useCallback(
    async (id: string) => {
      setClosingId(id);
      try {
        await closePaperTrade({ data: { id } });
        await router.invalidate();
      } catch (err) {
        console.error("Failed to close trade:", err);
      } finally {
        setClosingId(null);
      }
    },
    [router],
  );

  const handleCloseAlpacaPosition = useCallback(
    async (symbol: string) => {
      setClosingSymbol(symbol);
      try {
        const result = await closeAlpacaPosition({ data: symbol });
        if (!result.success) {
          alert(`Failed to close ${symbol}: ${result.error}`);
        }
        await router.invalidate();
      } catch (err) {
        console.error("Failed to close Alpaca position:", err);
      } finally {
        setClosingSymbol(null);
      }
    },
    [router],
  );

  // Summary calculations
  const closedTrades = trades.filter((t) => t.status === "closed");
  const openTrades = trades.filter((t) => t.status === "open");
  const winningTrades = closedTrades.filter(
    (t) => t.pnl !== undefined && t.pnl > 0,
  );
  const totalPnl = trades.reduce(
    (sum, t) => sum + (t.pnl ?? 0),
    0,
  );
  const winRate =
    closedTrades.length > 0
      ? Math.round((winningTrades.length / closedTrades.length) * 100)
      : null;

  // Format currency
  const fmt = (n: number): string =>
    n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;

  // Alpaca summary
  const alpacaTotalPnl = alpacaPositions.reduce(
    (sum, p) => sum + p.unrealizedPl,
    0,
  );

  const isAlpaca = tradingMode === "alpaca";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-4 text-xl font-semibold">
        {isAlpaca ? "🏦 Alpaca Positions" : "📒 Paper Trade Log"}
      </h2>

      {/* ---- Alpaca Account Summary ---- */}
      {isAlpaca && alpacaAccount && (
        <div className="mb-4 rounded-md bg-purple-50 p-3 dark:bg-purple-950/30">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Equity</span>
              <p className="font-bold text-gray-800 dark:text-gray-200">
                ${alpacaAccount.equity.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Buying Power</span>
              <p className="font-bold text-gray-800 dark:text-gray-200">
                ${alpacaAccount.buyingPower.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Cash</span>
              <p className="font-bold text-gray-800 dark:text-gray-200">
                ${alpacaAccount.cash.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Day Trades</span>
              <p className="font-bold text-gray-800 dark:text-gray-200">
                {alpacaAccount.dayTradeCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- Alpaca Positions Table ---- */}
      {isAlpaca && alpacaPositions.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Entry</th>
                  <th className="pb-2 text-right font-medium">Current</th>
                  <th className="pb-2 text-right font-medium">Market Value</th>
                  <th className="pb-2 text-right font-medium">Unreal. P&L</th>
                  <th className="pb-2 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {alpacaPositions.map((p) => {
                  const isClosing = closingSymbol === p.symbol;
                  return (
                    <tr
                      key={p.symbol}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 font-medium">{p.symbol}</td>
                      <td className="py-2 text-right font-mono">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase ${
                            p.side === "long"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          }`}
                        >
                          {p.side}
                        </span>{" "}
                        {p.qty}
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${p.avgEntryPrice.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${p.currentPrice.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${p.marketValue.toFixed(2)}
                      </td>
                      <td
                        className={`py-2 text-right font-mono ${
                          p.unrealizedPl >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {fmt(p.unrealizedPl)} ({p.unrealizedPlPercent >= 0 ? "+" : ""}{p.unrealizedPlPercent}%)
                      </td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => handleCloseAlpacaPosition(p.symbol)}
                          disabled={isClosing}
                          className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        >
                          {isClosing ? "Closing…" : "Close"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Alpaca summary row */}
          <div className="mt-4 rounded-md bg-gray-50 p-3 dark:bg-gray-800/50">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Total Unreal. P&L
                </span>
                <p
                  className={`text-lg font-bold ${
                    alpacaTotalPnl >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {fmt(alpacaTotalPnl)}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Positions
                </span>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {alpacaPositions.length}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Long / Short
                </span>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {alpacaPositions.filter((p) => p.side === "long").length} /{" "}
                  {alpacaPositions.filter((p) => p.side === "short").length}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Status
                </span>
                <p className="text-lg font-bold text-green-600">
                  {alpacaAccount?.status ?? "OK"}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : isAlpaca && !alpacaConnected ? (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/30">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            ⚠️ Alpaca API keys not configured. Set <code>ALPACA_API_KEY</code> and{" "}
            <code>ALPACA_API_SECRET</code> environment variables to connect.
          </p>
        </div>
      ) : isAlpaca && alpacaPositions.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No open positions. Place an order from a signal card to get started.
        </p>
      ) : trades.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No trades logged yet — open a paper trade from a signal card to get
          started.
        </p>
      ) : (
        /* ---- Paper Trade Table ---- */
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 text-right font-medium">Entry</th>
                  <th className="pb-2 text-right font-medium">Current/Exit</th>
                  <th className="pb-2 text-right font-medium">P&L</th>
                  <th className="pb-2 text-center font-medium">Status</th>
                  <th className="pb-2 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {trades
                  .filter(
                    (t) =>
                      t &&
                      typeof t.entryPrice === "number" &&
                      typeof t.symbol === "string",
                  )
                  .map((t) => {
                    const isClosing = closingId === t.id;
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-gray-100 dark:border-gray-800"
                      >
                        <td className="py-2 font-medium">{t.symbol ?? "—"}</td>
                        <td className="py-2">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase ${
                              t.direction === "long"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}
                          >
                            {t.direction ?? "—"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono">
                          $
                          {t.entryPrice?.toFixed(2) ?? "—"}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {t.exitPrice !== undefined &&
                          t.exitPrice !== null
                            ? `$${t.exitPrice.toFixed(2)}`
                            : "—"}
                        </td>
                      <td
                        className={`py-2 text-right font-mono ${
                          t.pnl !== undefined
                            ? t.pnl >= 0
                              ? "text-green-600"
                              : "text-red-600"
                            : "text-gray-400"
                        }`}
                      >
                        {t.pnl !== undefined ? fmt(t.pnl) : "—"}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.status === "open"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {t.status === "open" && (
                          <button
                            onClick={() => handleCloseTrade(t.id)}
                            disabled={isClosing}
                            className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                          >
                            {isClosing ? "Closing…" : "Close"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary row */}
          <div className="mt-4 rounded-md bg-gray-50 p-3 dark:bg-gray-800/50">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Total P&L
                </span>
                <p
                  className={`text-lg font-bold ${
                    totalPnl >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {fmt(totalPnl)}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Win Rate
                </span>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {winRate !== null ? `${winRate}%` : "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Total Trades
                </span>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {trades.length}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Open / Closed
                </span>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {openTrades.length} / {closedTrades.length}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
