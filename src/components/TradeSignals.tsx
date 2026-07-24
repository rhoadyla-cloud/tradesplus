import type { TradeSetup } from "~/engine/scanner";
import type { Quote } from "~/services/marketData";

export interface TradeSignalsProps {
  setups: TradeSetup[];
  quotes?: Quote[];
  loading?: boolean;
}

/**
 * Ranks day-trading opportunities and displays live quote data.
 * When scanned setups are available, shows full trade signal cards;
 * otherwise falls back to the live quote table.
 */
export function TradeSignals({
  setups,
  quotes,
  loading = false,
}: TradeSignalsProps) {
  if (loading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-xl font-semibold">📊 Trade Signals</h2>
        <p className="text-gray-500">Scanning market data…</p>
      </section>
    );
  }

  const hasSetups = setups.length > 0;
  const hasQuotes = quotes && quotes.length > 0;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-4 text-xl font-semibold">📊 Trade Signals</h2>

      {/* Scanned setups */}
      {hasSetups ? (
        <ul className="space-y-3">
          {setups.map((s) => (
            <li
              key={s.symbol}
              className="rounded-lg border border-gray-100 p-4 dark:border-gray-800"
            >
              {/* Header row: symbol + signal badge + confidence */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-lg font-bold">{s.symbol}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                      s.signal === "buy"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : s.signal === "sell"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {s.signal}
                  </span>
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {s.confidence}% confidence
                  </span>
                </div>
              </div>

              {/* Price levels: entry / stop / target */}
              <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-gray-400">Entry</span>
                  <p className="font-mono font-semibold">
                    ${s.entryPrice.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Stop Loss</span>
                  <p className="font-mono font-semibold text-red-600">
                    ${s.stopLoss.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Take Profit</span>
                  <p className="font-mono font-semibold text-green-600">
                    ${s.takeProfit.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Reason */}
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {s.reason}
              </p>

              {/* Indicators list */}
              {s.indicators.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.indicators.map((ind, i) => (
                    <span
                      key={i}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    >
                      {ind}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : hasQuotes ? (
        /* Live quote table when no scanned setups yet */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 text-right font-medium">Price</th>
                <th className="pb-2 text-right font-medium">Change</th>
                <th className="pb-2 text-right font-medium">%</th>
                <th className="pb-2 text-right font-medium">Volume</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr
                  key={q.symbol}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  <td className="py-2 font-medium">{q.symbol}</td>
                  <td className="py-2 text-right font-mono">
                    {q.price.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono ${
                      q.change >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {q.change >= 0 ? "+" : ""}
                    {q.change.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono ${
                      q.changePercent >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {q.changePercent >= 0 ? "+" : ""}
                    {q.changePercent.toFixed(2)}%
                  </td>
                  <td className="py-2 text-right font-mono text-gray-500">
                    {q.volume >= 1_000_000
                      ? `${(q.volume / 1_000_000).toFixed(1)}M`
                      : q.volume >= 1_000
                        ? `${(q.volume / 1_000).toFixed(1)}K`
                        : q.volume}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-gray-400">No signals yet</p>
      )}
    </section>
  );
}
