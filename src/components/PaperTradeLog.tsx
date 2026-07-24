/** A single paper-trade entry */
export interface PaperTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: number;
  exitTime: number | null;
  pnl: number | null;
  status: "open" | "closed";
  notes: string;
}

export interface PaperTradeLogProps {
  trades: PaperTrade[];
}

/**
 * Placeholder component for the paper-trading journal.
 * Renders an empty table until trades are logged.
 */
export function PaperTradeLog({ trades }: PaperTradeLogProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-4 text-xl font-semibold">📒 Paper Trade Log</h2>
      {trades.length === 0 ? (
        <p className="py-8 text-center text-gray-400">No trades logged yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Direction</th>
                <th className="pb-2 font-medium">Entry</th>
                <th className="pb-2 font-medium">Exit</th>
                <th className="pb-2 font-medium">P&L</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 font-medium">{t.symbol}</td>
                  <td className="py-2">{t.direction}</td>
                  <td className="py-2">{t.entryPrice}</td>
                  <td className="py-2">{t.exitPrice ?? "—"}</td>
                  <td
                    className={`py-2 ${t.pnl !== null && t.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {t.pnl !== null ? `$${t.pnl.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        t.status === "open"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
