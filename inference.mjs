/**
 * Pay-per-inference example.
 *
 * Calls POST https://www.liquidpad.site/api/x402/inference with x402.
 * Pays $0.01 USDC per completion — no API key, no signup.
 *
 * The endpoint is OpenAI-compatible: send `messages`, get back a
 * chat.completion. Output is capped at 512 tokens.
 *
 * Run:
 *   PRIVATE_KEY=0x... node inference.mjs "your prompt here"
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

const prompt = process.argv.slice(2).join(" ").trim() || "say hello in exactly 3 words";

const account = privateKeyToAccount(pk);
console.log(`payer wallet:  ${account.address}`);
console.log(`prompt:        ${prompt}\n`);

const client = createWalletClient({ account, transport: http(), chain: base });

// Allow up to $0.02 per call (endpoint charges $0.01 — headroom for safety).
const fetchWithPay = wrapFetchWithPayment(fetch, client, BigInt(20000));

const url = `${SITE}/api/x402/inference`;
console.log(`→ POST ${url}\n`);

try {
  const res = await fetchWithPay(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      temperature: 0.7,
    }),
  });

  const body = await res.json();
  console.log(`← HTTP ${res.status}`);

  const content = body?.choices?.[0]?.message?.content;
  if (content) {
    console.log(`\n┌─ completion ${"─".repeat(48)}`);
    content.split("\n").forEach((l) => console.log(`│ ${l}`));
    console.log(`└${"─".repeat(60)}`);
    if (body.usage) {
      console.log(
        `\nusage: ${body.usage.prompt_tokens} in + ${body.usage.completion_tokens} out = ${body.usage.total_tokens} tokens`,
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
    console.log(`  cost:       $0.01 USDC`);
  }
} catch (err) {
  die(err?.message || String(err));
}
