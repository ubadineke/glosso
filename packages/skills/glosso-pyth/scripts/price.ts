/**
 * glosso-pyth skill — price feed script
 *
 * Fetches real-time price data from Pyth Network via the Hermes API.
 * No API key required — Hermes is a free public endpoint.
 *
 * Usage:
 *   tsx scripts/price.ts SOL/USD
 *   tsx scripts/price.ts BTC/USD ETH/USD SOL/USD
 */

// Pyth Hermes price feed IDs (mainnet)
// Full list: https://pyth.network/developers/price-feed-ids
const FEED_IDS: Record<string, string> = {
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'USDC/USD': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  'USDT/USD': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  'JUP/USD': '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  'BONK/USD': '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
  'WIF/USD': '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  'PYTH/USD': '0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff',
  'RAY/USD': '0x91568baa8beb53db23eb3fb7f22c6e8bd303d103919e19733f2bb642d3e7987a',
};

const HERMES_URL = 'https://hermes.pyth.network';

interface PriceResult {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: string;
  feedId: string;
}

/**
 * Fetch the latest price for one or more asset pairs.
 *
 * @param symbols - e.g. "SOL/USD", "BTC/USD"
 * @returns Array of price results
 */
export async function glosso_price(
  ...symbols: string[]
): Promise<PriceResult[]> {
  if (symbols.length === 0) {
    throw new Error('At least one symbol is required. Supported: ' + Object.keys(FEED_IDS).join(', '));
  }

  // Resolve feed IDs
  const feeds: Array<{ symbol: string; id: string }> = [];
  for (const symbol of symbols) {
    const normalized = symbol.toUpperCase().replace(/\s/g, '');
    const id = FEED_IDS[normalized];
    if (!id) {
      throw new Error(
        `Unknown symbol "${symbol}". Supported: ${Object.keys(FEED_IDS).join(', ')}`
      );
    }
    feeds.push({ symbol: normalized, id });
  }

  // Fetch from Hermes API
  const ids = feeds.map((f) => f.id.replace('0x', ''));
  const params = ids.map((id) => `ids[]=${id}`).join('&');
  const url = `${HERMES_URL}/v2/updates/price/latest?${params}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Hermes API error (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as {
    parsed: Array<{
      id: string;
      price: {
        price: string;
        conf: string;
        expo: number;
        publish_time: number;
      };
    }>;
  };

  const results: PriceResult[] = [];

  for (const feed of feeds) {
    const cleanId = feed.id.replace('0x', '');
    const entry = data.parsed?.find((p) => p.id === cleanId);
    if (!entry) {
      throw new Error(`No price data returned for ${feed.symbol}`);
    }

    const price =
      parseFloat(entry.price.price) * Math.pow(10, entry.price.expo);
    const confidence =
      parseFloat(entry.price.conf) * Math.pow(10, entry.price.expo);

    results.push({
      symbol: feed.symbol,
      price: parseFloat(price.toFixed(6)),
      confidence: parseFloat(confidence.toFixed(6)),
      timestamp: new Date(entry.price.publish_time * 1000).toISOString(),
      feedId: feed.id,
    });
  }

  return results;
}

/**
 * Get the list of supported price feed symbols.
 */
export function glosso_supported_feeds(): string[] {
  return Object.keys(FEED_IDS);
}

// CLI entry point
if (require.main === module || process.argv[1]?.includes('price')) {
  const symbols = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (symbols.length === 0) {
    console.log('Supported feeds:', glosso_supported_feeds().join(', '));
    console.log('\nUsage: tsx scripts/price.ts SOL/USD [BTC/USD] [ETH/USD]');
    process.exit(0);
  }

  glosso_price(...symbols)
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
