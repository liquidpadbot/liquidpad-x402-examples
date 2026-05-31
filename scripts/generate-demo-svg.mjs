#!/usr/bin/env node
/**
 * Generate an animated SVG showing the x402 cold-call → 402 → paid-retry flow.
 *
 * Output: ./demo.svg — self-contained, no external assets, autoplay on GitHub
 * and Twitter image previews.
 *
 * No deps. Plain Node + string templating.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "demo.svg");

// ─── Frames ──────────────────────────────────────────────────────────────
// Each frame is an array of lines (rendered cumulatively).
// Timestamps in seconds. Total duration ~12s, then loops.

const FRAMES = [
  {
    t: 0,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "curl -i https://liquidpad.site/api/x402/verify/0xABC..." },
    ],
  },
  {
    t: 1.4,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "curl -i https://liquidpad.site/api/x402/verify/0xABC..." },
      { c: "", s: "" },
      { c: "#ff6b6b", s: "HTTP/2 402 Payment Required" },
    ],
  },
  {
    t: 2.6,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "curl -i https://liquidpad.site/api/x402/verify/0xABC..." },
      { c: "", s: "" },
      { c: "#ff6b6b", s: "HTTP/2 402 Payment Required" },
      { c: "#a9bad6", s: '{ "scheme": "exact", "asset": "USDC",' },
      { c: "#a9bad6", s: '  "maxAmountRequired": "1000",  // $0.001' },
      { c: "#a9bad6", s: '  "network": "eip155:8453",     // Base' },
      { c: "#a9bad6", s: '  "payTo": "0x1881...50E0" }' },
    ],
  },
  {
    t: 4.6,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "node verify.mjs 0xABC..." },
    ],
  },
  {
    t: 5.4,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "node verify.mjs 0xABC..." },
      { c: "", s: "" },
      { c: "#a9bad6", s: "→ signing EIP-3009 transferWithAuthorization..." },
    ],
  },
  {
    t: 6.6,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "node verify.mjs 0xABC..." },
      { c: "", s: "" },
      { c: "#a9bad6", s: "→ signing EIP-3009 transferWithAuthorization..." },
      { c: "#a9bad6", s: "→ retrying with X-PAYMENT header..." },
    ],
  },
  {
    t: 7.6,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "node verify.mjs 0xABC..." },
      { c: "", s: "" },
      { c: "#a9bad6", s: "→ signing EIP-3009 transferWithAuthorization..." },
      { c: "#a9bad6", s: "→ retrying with X-PAYMENT header..." },
      { c: "#a9bad6", s: "→ facilitator settling on Base..." },
    ],
  },
  {
    t: 8.8,
    lines: [
      { c: "#7289aa", s: "$ " },
      { c: "#eaf2ff", s: "node verify.mjs 0xABC..." },
      { c: "", s: "" },
      { c: "#a9bad6", s: "→ signing EIP-3009 transferWithAuthorization..." },
      { c: "#a9bad6", s: "→ retrying with X-PAYMENT header..." },
      { c: "#a9bad6", s: "→ facilitator settling on Base..." },
      { c: "", s: "" },
      { c: "#31ffa0", s: "✓ HTTP 200" },
      { c: "#eaf2ff", s: '{ "verified": true, "name": "LiquidPad",' },
      { c: "#eaf2ff", s: '  "kind": "platform", "agentId": 50962 }' },
      { c: "", s: "" },
      { c: "#20dbff", s: "settled tx: 0xa1f2...3c4d" },
      { c: "#7289aa", s: "cost:       $0.001 USDC" },
    ],
  },
];

const LOOP_DURATION = 12; // seconds — frames + 3s pause before loop

// ─── Geometry ────────────────────────────────────────────────────────────
const WIDTH = 760;
const HEIGHT = 440;
const PADDING_X = 24;
const PADDING_TOP = 56; // space for window chrome
const LINE_HEIGHT = 22;
const FONT_SIZE = 14;
const FONT_FAMILY =
  "ui-monospace, 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace";

// ─── Build SVG ───────────────────────────────────────────────────────────

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function frameKeyframes(frameIdx) {
  // Each frame visible from its t to either next.t or LOOP_DURATION.
  const start = FRAMES[frameIdx].t;
  const end = frameIdx + 1 < FRAMES.length ? FRAMES[frameIdx + 1].t : LOOP_DURATION;
  const startPct = (start / LOOP_DURATION) * 100;
  const endPct = (end / LOOP_DURATION) * 100;

  // Slight easing: opacity 0 → 1 over first 5% of frame's life, then 1 → 0
  // for last 2% of frame's life (so consecutive frames overlap briefly).
  const fadeInPct = startPct + (endPct - startPct) * 0.05;
  const fadeOutPct = startPct + (endPct - startPct) * 0.98;

  return `
@keyframes frame-${frameIdx} {
  0%, ${startPct.toFixed(2)}%, ${endPct.toFixed(2)}%, 100% { opacity: 0; }
  ${fadeInPct.toFixed(2)}%, ${fadeOutPct.toFixed(2)}% { opacity: 1; }
}
.frame-${frameIdx} {
  animation: frame-${frameIdx} ${LOOP_DURATION}s linear infinite;
  opacity: 0;
}`;
}

function renderLine(line, lineIdx) {
  const y = PADDING_TOP + (lineIdx + 1) * LINE_HEIGHT;
  if (!line.s) return "";
  return `<text x="${PADDING_X}" y="${y}" fill="${line.c || "#eaf2ff"}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" xml:space="preserve">${escapeXml(line.s)}</text>`;
}

function renderFrame(frame, idx) {
  const lines = frame.lines.map(renderLine).join("");
  return `<g class="frame-${idx}">${lines}</g>`;
}

const css = FRAMES.map((_, i) => frameKeyframes(i)).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="LiquidPad x402 demo">
<title>LiquidPad x402: cold call → 402 → pay → 200</title>
<style>${css}</style>

<!-- Background -->
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0a0e1a"/>
    <stop offset="100%" stop-color="#040912"/>
  </linearGradient>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" rx="14" ry="14" fill="url(#bg)"/>
<rect width="${WIDTH}" height="${HEIGHT}" rx="14" ry="14" fill="none" stroke="#1f2a44" stroke-width="1"/>

<!-- Window chrome -->
<circle cx="22" cy="24" r="6" fill="#ff5f57"/>
<circle cx="42" cy="24" r="6" fill="#febc2e"/>
<circle cx="62" cy="24" r="6" fill="#28c840"/>
<text x="${WIDTH / 2}" y="29" text-anchor="middle" fill="#7289aa" font-family="${FONT_FAMILY}" font-size="12">liquidpad.site/api/x402/verify  ·  agent-payable</text>

<!-- Frames -->
${FRAMES.map(renderFrame).join("\n")}

<!-- Footer brand -->
<text x="${WIDTH - PADDING_X}" y="${HEIGHT - 14}" text-anchor="end" fill="#3a4a6a" font-family="${FONT_FAMILY}" font-size="11">liquidpad.site/x402  ·  x402 v1  ·  USDC on Base</text>
</svg>`;

writeFileSync(OUT, svg, "utf-8");
console.log(`✓ wrote ${OUT}`);
console.log(`  size: ${(svg.length / 1024).toFixed(1)}kb`);
console.log(`  loop: ${LOOP_DURATION}s, ${FRAMES.length} frames`);
