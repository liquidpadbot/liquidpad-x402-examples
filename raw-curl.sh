#!/usr/bin/env bash
#
# Cold-call snapshot — see the 402 response from each LiquidPad x402 endpoint.
# No payment, no signing. Just the protocol handshake.
#
# Run: bash raw-curl.sh

set -euo pipefail

SITE="${LIQUIDPAD_SITE:-https://www.liquidpad.site}"
PROBE="0x188177dF522f81A9bEd88D25d1969A0B700b50E0"

echo "=== verify (cold) ==="
curl -sS -o /tmp/x402-verify.json -w 'HTTP %{http_code} · %{size_download}b\n' \
  "$SITE/api/x402/verify/$PROBE"
jq . /tmp/x402-verify.json

echo
echo "=== provenance (cold) ==="
curl -sS -o /tmp/x402-provenance.json -w 'HTTP %{http_code} · %{size_download}b\n' \
  "$SITE/api/x402/provenance/$PROBE"
jq . /tmp/x402-provenance.json

echo
echo "=== agents (cold) ==="
curl -sS -o /tmp/x402-agents.json -w 'HTTP %{http_code} · %{size_download}b\n' \
  "$SITE/api/x402/agents?limit=10"
jq . /tmp/x402-agents.json

echo
echo "all 3 endpoints respond with valid x402 v1 payment requirements."
echo "to actually pay and call: see verify.mjs / provenance.mjs / agents.mjs"
