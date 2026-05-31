/**
 * Pay-per-request agents registry example.
 *
 * Calls https://www.liquidpad.site/api/x402/agents with x402.
 *
 * Run:
 *   PRIVATE_KEY=0x... node agents.mjs [limit]
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

const SITE = process.env.LIQUIDPAD_SITE || "https://www.liquidpad.site";

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const pk = process.env.PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  die("set PRIVATE_KEY=0x... (64 hex chars). Wallet must hold a few cents of USDC on Base mainnet.");
}

const limit = Number(process.argv[2] || "20");
if (!Number.isFinite(limit) || limit < 1 || limit > 1000) {
  die("limit must be 1..1000");
}

const account = privateKeyToAccount(pk);
console.log(`payer wallet:  ${account.address}`);
console.log(`limit:         ${limit}\n`);

// $0.005 max per call (5x default $0.001 — agents endpoint is 5000 atomic).
const client = createWalletClient({ account, transport: http(), chain: base });
const fetchWithPay = wrapFetchWithPayment(fetch, client, BigInt(10000));

const url = `${SITE}/api/x402/agents?limit=${limit}`;
console.log(`→ GET ${url}\n`);

try {
  const res = await fetchWithPay(url, { method: "GET" });
  const body = await res.json();

  console.log(`← HTTP ${res.status}`);

  if (body.ok && body.agents) {
    console.log(`\nregistry summary:`);
    console.log(`  total:         ${body.total}`);
    console.log(`  verifiedCount: ${body.verifiedCount}`);
    console.log(`  totalDeploys:  ${body.totalDeploys}`);
    console.log(`\nfirst ${Math.min(5, body.agents.length)} agents:`);
    for (const a of body.agents.slice(0, 5)) {
      const tag = a.verified ? " [verified]" : "";
      console.log(
        `  ${a.address}${tag}  deploys=${a.deployCount}  symbols=[${(a.recentSymbols || []).join(",")}]`,
      );
    }
  } else {
    console.log("body:", JSON.stringify(body, null, 2));
  }

  const settle = res.headers.get("x-payment-response");
  if (settle) {
    const decoded = decodeXPaymentResponse(settle);
    console.log(`\n✓ settled tx: ${decoded.txHash || decoded.transaction || "n/a"}`);
    console.log(`  network:    ${decoded.networkId || "n/a"}`);
    console.log(`  payer:      ${decoded.payer || "n/a"}`);
  }
} catch (err) {
  die(err?.message || String(err));
}
