#!/bin/bash
# Waits for the chain container to publish its deployment record, points the app
# at those addresses, then serves the app.
set -e

DEPLOYMENT="/deployments/localhost.json"
READY_MARKER="/deployments/.container-ready"

echo "[laurel] waiting for the chain to finish deploying ..."
for i in $(seq 1 180); do
  [ -f "$READY_MARKER" ] && [ -f "$DEPLOYMENT" ] && break
  if [ "$i" = "180" ]; then
    echo "[laurel] no deployment record after 180s — is the 'chain' service healthy?"
    exit 1
  fi
  sleep 1
done

node -e "
  const fs = require('fs');
  const d = JSON.parse(fs.readFileSync('$DEPLOYMENT', 'utf8'));
  const out = {
    successToken: d.successToken,
    rewardManager: d.rewardManager,
    achievementBadge: d.achievementBadge,
    chainId: d.chainId,
    deployBlock: d.deployBlock,
  };
  fs.writeFileSync('src/contracts/addresses.json', JSON.stringify(out, null, 2) + '\n');
  console.log('[laurel] app pointed at RewardManager', d.rewardManager, '(chainId ' + d.chainId + ')');
"

exec npm run dev -- --host 0.0.0.0
