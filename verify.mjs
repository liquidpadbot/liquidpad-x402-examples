/**
 * Pay-per-request verify example.
 *
 * Calls https://www.liquidpad.site/api/x402/verify/{address} with x402.
 * Expects a funded EVM wallet on Base mainnet with USDC.
 *
 * Run:
 *   PRIVATE_KEY=0x... node verify.mjs <address>
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

const address = process.argv[2];
if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
  die("usage: node verify.mjs <0xtokenAddress>");
}

const account = privateKeyToAccount(pk);
console.log(`payer wallet:  ${account.address}`);
console.log(`querying:      ${address}\n`);

const client = createWalletClient({
  account,
  transport: http(),
  chain: base,
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);

const url = `${SITE}/api/x402/verify/${address.toLowerCase()}`;
console.log(`→ GET ${url}\n`);

try {
  const res = await fetchWithPay(url, { method: "GET" });
  const body = await res.json();

  console.log(`← HTTP ${res.status}`);
  console.log("body:", JSON.stringify(body, null, 2));

  const settle = res.headers.get("x-payment-response");
  if (settle) {
    const decoded = decodeXPaymentResponse(settle);
    console.log(`\n✓ settled tx: ${decoded.txHash || decoded.transaction || "n/a"}`);
    console.log(`  network:    ${decoded.networkId || "n/a"}`);
    console.log(`  payer:      ${decoded.payer || "n/a"}`);
  } else {
    console.log("\n(no x-payment-response header — endpoint may not have settled)");
  }
} catch (err) {
  die(err?.message || String(err));
}
