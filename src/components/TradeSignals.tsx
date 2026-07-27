import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import type { TradeSetup } from "~/engine/scanner";
import type { Quote } from "~/services/marketData";
import type { AutoTraderStatus } from "~/engine/autoTrader";
import { openPaperTrade } from "~/lib/paperTrades";
import { setAutoTraderConfig, triggerAutoTrade } from "~/engine/autoTrader";

export interface TradeSignalsProps {
  setups: TradeSetup[];
  quotes?: Quote[];
  loading?: boolean;
  autoTraderStatus?: AutoTraderStatus;
}

type SignalFilter = "all" | "buy" | "sell" | "hold";

/** Format a timestamp as a relative or absolute time string. */
function fmtTime(ts: number): string {
  if (ts === 0) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
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
  autoTraderStatus,
}: TradeSignalsProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [openingTrade, setOpeningTrade] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  // Local state for auto-trader status so the UI updates instantly on toggle
  const [status, setStatus] = useState<AutoTraderStatus | undefined>(
    autoTraderStatus,
  );

  // Sync when loader data changes
  useEffect(() => {
    if (autoTraderStatus) setStatus(autoTraderStatus);
  }, [autoTraderStatus]);

  // 60-second auto-trader polling
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      try {
        await triggerAutoTrade();
      } catch (err) {
        console.error("[auto-trader] Poll failed:", err);
      }
      await router.invalidate();
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [router]);

  const handleOpenTrade = useCallback(
    async (setup: TradeSetup) => {
      setOpeningTrade(setup.symbol);
      try {
        const direction = setup.signal === "sell" ? "short" : "long";
        await openPaperTrade({
          symbol: setup.symbol,
          direction,
          entryPrice: setup.entryPrice,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          shares: 100,
        });
        await router.invalidate();
      } catch (err) {
        console.error("Failed to open paper trade:", err);
      } finally {
        setOpeningTrade(null);
      }
    },
    [router],
  );

  const handleToggle = useCallback(async () => {
    setToggling(true);
    const newEnabled = !status?.config.enabled;
    try {
      const updated = await setAutoTraderConfig({ enabled: newEnabled });
      setStatus(updated);
    } catch (err) {
      console.error("Failed to toggle auto-trader:", err);
    } finally {
      setToggling(false);
    }
  }, [status?.config.enabled]);

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

  // Sort: confidence descending
  const sorted = [...setups].sort((a, b) => b.confidence - a.confidence);

  // Apply filter
  const filtered =
    filter === "all" ? sorted : sorted.filter((s) => s.signal === filter);

  // Summary
  const strongest =
    sorted.length > 0
      ? sorted.reduce((best, s) =>
          s.confidence > best.confidence ? s : best,
        )
      : null;

  const enabled = status?.config.enabled ?? false;
  const last = status?.lastRun;

  // Build last-action summary string
  const actions: string[] = [];
  if (last && last.timestamp > 0) {
    for (const o of last.opened) actions.push(`Opened ${o}`);
    for (const c of last.closed) actions.push(`Closed ${c}`);
  }
  const summary = actions.length > 0 ? actions.join(" · ") : "No actions yet";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-4 text-xl font-semibold">📊 Trade Signals</h2>

      {/* ---- Auto-Trade Status Bar ---- */}
      <div className="mb-4 rounded-lg border bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
        <div className="flex items-center justify-between gap-3">
          {/* Left: status dot + label */}
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  enabled ? "animate-ping bg-green-400" : ""
                }`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  enabled ? "bg-green-500" : "bg-red-400"
                }`}
              />
            </span>
            <span
              className={`text-sm font-semibold ${
                enabled ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              Auto-Trade: {enabled ? "ON" : "OFF"}
            </span>
          </div>

          {/* Right: toggle switch */}
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              onChange={handleToggle}
              disabled={toggling}
            />
            <div className="h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-indigo-300 dark:bg-gray-600 dark:peer-focus:ring-indigo-700" />
          </label>
        </div>

        {/* Last run info */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Last run:{" "}
            <span className="font-mono text-gray-700 dark:text-gray-300">
              {fmtTime(last?.timestamp ?? 0)}
            </span>
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="max-w-md truncate">{summary}</span>
        </div>

        {/* Last-run errors */}
        {last && last.errors.length > 0 && (
          <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            {last.errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}
      </div>

      {/* Scanned setups */}
      {hasSetups ? (
        <>
          {/* Summary bar */}
          <div className="mb-3 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {sorted.length} setup{sorted.length !== 1 ? "s" : ""} found
            {strongest && (
              <>
                {" • "}strongest:{" "}
                <span className="font-bold">{strongest.symbol}</span> at{" "}
                {strongest.confidence}% confidence
              </>
            )}
          </div>

          {/* Filter buttons */}
          <div className="mb-4 flex gap-2">
            {(["all", "buy", "sell", "hold"] as SignalFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>

          {/* Signal cards */}
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No {filter === "all" ? "" : filter} signals found
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((s) => (
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
                      <div className="flex items-center gap-1.5">
                        {/* Confidence progress bar */}
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${
                              s.confidence >= 60
                                ? "bg-green-500"
                                : s.confidence >= 30
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${s.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                          {s.confidence}%
                        </span>
                      </div>
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

                  {/* Open Paper Trade button */}
                  <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                    <button
                      onClick={() => handleOpenTrade(s)}
                      disabled={openingTrade === s.symbol}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {openingTrade === s.symbol
                        ? "Opening…"
                        : "📝 Open Paper Trade"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
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
