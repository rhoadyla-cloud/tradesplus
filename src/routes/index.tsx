import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";

import { PaperTradeLog } from "~/components/PaperTradeLog";
import type { PaperTrade } from "~/components/PaperTradeLog";
import { TradeSignals } from "~/components/TradeSignals";
import type { TradeSetup } from "~/engine/scanner";
import type { AutoTraderStatus } from "~/engine/autoTrader";
import { getWatchlist } from "~/lib/watchlist";
import type { MarketDataResult } from "~/services/marketData";

// Read the (optional) business name at request time so the placeholder can be
// personalized by writing site.json — no rebuild needed. Resolves relative to the
// server's working directory (the site root). Falls back to "" if absent/invalid.
const getBusinessName = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    return cfg.businessName?.trim() ?? "";
  } catch {
    return "";
  }
});

/** Fetch live quotes from Yahoo Finance for the full watchlist. */
const fetchMarketData = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAllData } = await import("~/services/marketData");
  return fetchAllData();
});

/** Run the scanner on the watchlist and return ranked trade setups. */
const fetchScanResults = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    setups: TradeSetup[];
    quotes: MarketDataResult["quotes"];
    scannedAt: number;
  }> => {
    const { fetchAllData } = await import("~/services/marketData");
    const { scanWatchlist } = await import("~/engine/scanner");
    const { getWatchlist: getWl } = await import("~/lib/watchlist");

    const symbols = getWl();
    const marketData = await fetchAllData();
    const scanResult = await scanWatchlist(symbols, marketData);

    return {
      setups: scanResult.setups,
      quotes: marketData.quotes,
      scannedAt: scanResult.scannedAt,
    };
  },
);

/** Fetch all paper trades from the in-memory store. */
const fetchPaperTrades = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaperTrade[]> => {
    const { getPaperTrades } = await import("~/lib/paperTrades");
    return getPaperTrades();
  },
);

/** Fetch current auto-trader status (config + last run info). */
const fetchAutoTraderStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<AutoTraderStatus> => {
    const { getAutoTraderStatus } = await import("~/engine/autoTrader");
    return getAutoTraderStatus();
  },
);

const emptyMarketResult: MarketDataResult = {
  quotes: [],
  errors: [],
  fetchedAt: 0,
};

export const Route = createFileRoute("/")({
  loader: async () => {
    const [businessName, marketData, scanData, paperTrades, autoTraderStatus] =
      await Promise.all([
        getBusinessName(),
        fetchMarketData().catch((err) => {
          console.error("[loader] Market data fetch failed:", err);
          return emptyMarketResult;
        }),
        fetchScanResults().catch((err) => {
          console.error("[loader] Scan failed:", err);
          return { setups: [], quotes: [], scannedAt: 0 };
        }),
        fetchPaperTrades().catch((err) => {
          console.error("[loader] Paper trades fetch failed:", err);
          return [] as PaperTrade[];
        }).then((trades) =>
          // Filter out any malformed entries (e.g., missing entryPrice) to prevent SSR crashes
          trades.filter(
            (t) => t && typeof t.entryPrice === "number" && typeof t.symbol === "string",
          ),
        ),
        fetchAutoTraderStatus().catch((err) => {
          console.error("[loader] Auto-trader status fetch failed:", err);
          return {
            config: {
              minConfidence: 20,
              maxOpenTrades: 5,
              sharesPerTrade: 100,
              enabled: false,
            },
            lastRun: { timestamp: 0, opened: [], closed: [], errors: [] },
          } satisfies AutoTraderStatus;
        }),
      ]);
    return { businessName, marketData, scanData, paperTrades, autoTraderStatus };
  },
  component: Home,
});

function Home() {
  const { businessName, marketData, scanData, paperTrades, autoTraderStatus } =
    Route.useLoaderData();
  const watchlist = getWatchlist();

  // Prefer scan data (which includes its own quotes), fall back to marketData
  const setups = scanData?.setups ?? [];
  const quotes =
    scanData?.quotes && scanData.quotes.length > 0
      ? scanData.quotes
      : marketData.quotes;

  return (
    <main className="min-h-dvh px-6 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Alpha Preview
        </span>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">
          {businessName || "TradePulse AI"}
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          AI-powered market scanner for high-probability day trades
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Watching {watchlist.length} symbols:{" "}
          <span className="font-mono">{watchlist.join(", ")}</span>
        </p>
      </div>

      {/* Dashboard panels */}
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <TradeSignals
          setups={setups}
          quotes={quotes}
          autoTraderStatus={autoTraderStatus}
        />
        <PaperTradeLog trades={paperTrades ?? []} />
      </div>

      <footer className="mt-12 text-center text-sm text-gray-400 dark:text-gray-600">
        Built with{" "}
        <a
          href="https://cto.new"
          className="underline hover:text-gray-600 dark:hover:text-gray-400"
        >
          cto.new
        </a>
      </footer>
    </main>
  );
}
