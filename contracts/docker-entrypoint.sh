#!/bin/bash
# Starts a local Hardhat chain, deploys the three contracts, wires the roles,
# and seeds demo activity so the app has something to show immediately.
set -e

READY_MARKER="/app/deployments/.container-ready"

# The repo ships a deployments/localhost.json from earlier local runs, and Docker
# seeds an empty named volume from the image. Clear both so nothing downstream can
# read stale addresses before this container has finished deploying.
rm -f "$READY_MARKER" /app/deployments/localhost.json

echo "[laurel] starting local chain on 0.0.0.0:8545 ..."
npx hardhat node --hostname 0.0.0.0 > /tmp/hardhat-node.log 2>&1 &
NODE_PID=$!

echo "[laurel] waiting for the RPC to accept connections ..."
for i in $(seq 1 90); do
  if node -e "
      fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }),
      }).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));
    " 2>/dev/null; then
    break
  fi
  if [ "$i" = "90" ]; then
    echo "[laurel] chain did not come up in time; last log lines:"
    tail -20 /tmp/hardhat-node.log
    exit 1
  fi
  sleep 1
done

echo "[laurel] deploying contracts ..."
npx hardhat run scripts/deploy.js --network localhost

echo "[laurel] seeding demo activity ..."
npx hardhat run scripts/seed.js --network localhost || echo "[laurel] seed skipped"

touch "$READY_MARKER"

echo ""
echo "[laurel] ================================================"
echo "[laurel]  chain ready — RPC http://127.0.0.1:8545"
echo "[laurel]  chainId 31337"
echo "[laurel]  instructor = Hardhat account #0"
echo "[laurel] ================================================"
echo ""

wait "$NODE_PID"
