import { useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import type { PaperTrade } from "~/lib/paperTrades";
import { closePaperTrade } from "~/lib/paperTrades";

export type { PaperTrade } from "~/lib/paperTrades";

export interface PaperTradeLogProps {
  trades: PaperTrade[];
}

/**
 * Full paper-trading journal.
 * Shows all trades in a table, allows closing open trades,
 * and displays summary stats.
 */
export function PaperTradeLog({ trades }: PaperTradeLogProps) {
  const router = useRouter();
  const [closingId, setClosingId] = useState<string | null>(null);

  const handleCloseTrade = useCallback(
    async (id: string) => {
      setClosingId(id);
      try {
        await closePaperTrade({ id });
        await router.invalidate();
      } catch (err) {
        console.error("Failed to close trade:", err);
      } finally {
        setClosingId(null);
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

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-4 text-xl font-semibold">📒 Paper Trade Log</h2>

      {trades.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No trades logged yet — open a paper trade from a signal card to get
          started.
        </p>
      ) : (
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
                {trades.map((t) => {
                  const isClosing = closingId === t.id;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 font-medium">{t.symbol}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase ${
                            t.direction === "long"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${t.entryPrice.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {t.exitPrice !== undefined
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
