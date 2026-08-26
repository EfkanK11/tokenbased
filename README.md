# Laurel — Token-Based Success Award and Gamification System

A blockchain reward ledger for campus engagement. Instructors approve student
activities; smart contracts mint **Success Tokens (SCT, ERC-20)** and automatically
award **Achievement Badges (ERC-721)** at earning milestones. Badges are
**soulbound** — they cannot be sold or transferred — and their artwork is generated
entirely on-chain, so it never depends on a server staying online.

> Graduation project — Efkan Kasaboğlu · Student ID 220304023

---

## Live deployment

All three contracts are deployed and **source-verified** on Polygon Amoy testnet
(chainId `80002`). Anyone can read the ledger without an account or a wallet.

| Contract | Type | Address |
|---|---|---|
| SuccessToken | ERC-20 · `SCT` | [`0x980233928E995907F85264Fb00cEC13a094fb65a`](https://amoy.polygonscan.com/address/0x980233928E995907F85264Fb00cEC13a094fb65a) |
| RewardManager | AccessControl | [`0xfCa029578Aa84dDCfee999c7B5576A99DE4F9F00`](https://amoy.polygonscan.com/address/0xfCa029578Aa84dDCfee999c7B5576A99DE4F9F00) |
| AchievementBadge | ERC-721 + ERC-5192 | [`0xdeE6Be7F0F756E82e8F5818961B1467FD2cb026E`](https://amoy.polygonscan.com/address/0xdeE6Be7F0F756E82e8F5818961B1467FD2cb026E) |

`frontend/src/contracts/addresses.json` already points at these, so a fresh clone
runs against the live chain with no configuration.

---

## Quick start

### Option A — Docker (self-contained, recommended)

Brings up a local blockchain with the contracts deployed, roles wired and demo data
seeded, then serves the app against it. No testnet, no faucet, no test POL — Node.js
does not even need to be installed.

```bash
docker compose up --build
```

Then open <http://localhost:5173>. The **Verify** tab works immediately with no
wallet: paste `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` to see the seeded
student's tokens and badges.

To approve activities yourself, add the local network in MetaMask — RPC
`http://127.0.0.1:8545`, chainId `31337`, symbol `ETH` — and import Hardhat account
#0, which the deploy script grants `INSTRUCTOR_ROLE`:

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

This is a public, well-known Hardhat test key. It holds no real funds — never reuse
it on a public network.

Stop with `Ctrl+C`; `docker compose down -v` also clears the chain state.

### Option B — Run it directly

```bash
# 1. contracts
cd contracts
npm install
npm test

# 2. local chain (terminal 1)
npm run node

# 3. deploy + seed (terminal 2)
npm run deploy:local
npm run seed:local

# 4. app (terminal 3)
cd ../frontend
npm install
npm run dev              # http://localhost:5173
```

After a local deploy, copy the addresses from `contracts/deployments/localhost.json`
into `frontend/src/contracts/addresses.json`. Docker does this step automatically.

> Use the npm scripts rather than `npx hardhat …`. Without a local install, `npx`
> fetches Hardhat 3.x, which this project does not use.

### Option C — Just look at the live data

```bash
cd frontend && npm install && npm run dev
```

The **Verify** tab reads the live Amoy contracts directly — no local chain, no
wallet, no keys.

---

## How it works

```
Activity → evidence (IPFS, optional) → instructor approval → RewardManager
        → SCT minted → milestone check → badge minted + locked → events → UI
```

Steps three through five are a **single atomic transaction**. If the caller lacks
`INSTRUCTOR_ROLE`, or any input is invalid, the whole thing reverts — there is no
state where a half-written record exists.

### The three contracts

| Contract | Responsibility |
|---|---|
| **SuccessToken** | The reward currency. Minting is `onlyOwner`. |
| **RewardManager** | The brain. `approveActivity()` mints SCT, tracks lifetime earnings, and awards milestone badges. Holds the role registry. |
| **AchievementBadge** | Milestone NFTs. Artwork is generated on-chain; transfers are blocked. |

### Trust model

At deployment both token contracts **transfer their ownership to RewardManager**.
From that point there is exactly one account in the system that can mint anything,
and it is a contract, not a person. A direct `mint()` call from any wallet — the
admin's included — reverts with `onlyOwner`.

Roles are enforced on-chain, not in the interface: the app hides panels the wallet
cannot use, but hiding a button proves nothing, so every entry point checks the
caller's role itself.

### Milestones

| Threshold | Badge | Level |
|---|---|---|
| 50 SCT | Active Member | 1 (bronze) |
| 100 SCT | Star Performer | 2 (silver) |
| 200 SCT | Campus Legend | 3 (gold) |

Awarded from cumulative earnings, each exactly once. A single approval that crosses
several thresholds mints several badges.

### Soulbound badges (ERC-5192)

`AchievementBadge` overrides ERC-721's `_update` hook and reverts when both `from`
and `to` are non-zero — that is, on a wallet-to-wallet transfer. Minting and burning
still work, so the owner can delete their own badge but can never hand it to anyone.

ERC-5192 itself does not enforce anything; it *declares*. The contract implements
`locked()`, emits `Locked` on mint, and reports interface id `0xb45a3c0e` so wallets
and marketplaces know the token is bound. The enforcement is the `_update` override.

### On-chain artwork

`tokenURI()` returns a `data:application/json;base64,…` payload whose `image` field
is itself a `data:image/svg+xml;base64,…` string. The SVG is composed in Solidity.
There is no URL anywhere in the chain of data, so no server or IPFS pin can break
the badge.

IPFS (via Pinata) is used only for optional bulky evidence files; only the CID goes
on-chain.

---

## Project structure

```
tokenbased/
├── docker-compose.yml            # local chain + app, one command
├── contracts/                    # Hardhat project
│   ├── contracts/
│   │   ├── SuccessToken.sol           # ERC-20, owner-only mint
│   │   ├── RewardManager.sol          # AccessControl, milestones, mint authority
│   │   └── AchievementBadge.sol       # ERC-721 + ERC-5192, on-chain SVG
│   ├── scripts/
│   │   ├── deploy.js                  # deploy, transfer ownership, wire roles
│   │   ├── seed.js                    # demo activity (local only)
│   │   └── gas.js                     # measure deploy + operation gas
│   ├── test/reward.test.js            # unit tests
│   ├── deployments/                   # addresses written by deploy.js
│   └── hardhat.config.js
└── frontend/                     # Vite + React
    └── src/
        ├── App.jsx                    # student, instructor, admin, honors, verify
        ├── labels.js                  # address book (localStorage only)
        ├── ipfs.js                    # Pinata upload helper
        ├── index.css                  # "Laurel" design system
        └── contracts/                 # addresses.json + ABIs
```

---

## Configuration

Secrets live in gitignored `.env` files; templates are committed as `.env.example`.

| File | Keys | Needed for |
|---|---|---|
| `contracts/.env` | `DEPLOYER_PRIVATE_KEY`, `AMOY_RPC_URL`, `POLYGONSCAN_API_KEY` | Deploying and verifying on Amoy |
| `frontend/.env` | `VITE_PINATA_JWT`, `VITE_PINATA_GATEWAY` | IPFS evidence upload |

Neither is required to run the app or read the live chain. With `VITE_PINATA_JWT`
unset the upload control simply hides; plain-text activity references still work.

> `VITE_*` variables are compiled into the browser bundle and are therefore public.
> Scope the Pinata key to `pinFileToIPFS` only. A production deployment should proxy
> uploads through a server instead.

---

## Deploying your own stack

```bash
cd contracts
cp .env.example .env          # fill in DEPLOYER_PRIVATE_KEY
npm run deploy:amoy
```

Fund the deployer with test POL first — the
[Google Cloud](https://cloud.google.com/application/web3/faucet/polygon/amoy) or
[QuickNode](https://faucet.quicknode.com/polygon/amoy) faucets both work; ~0.2 POL
covers a deploy and many approvals. The script prints ready-to-run `hardhat verify`
commands and grants the deployer `INSTRUCTOR_ROLE`. Copy the printed addresses into
`frontend/src/contracts/addresses.json`.

> The default Polygon RPC (`rpc-amoy.polygon.technology`) currently fails DNS
> resolution, so the config defaults to `https://polygon-amoy.drpc.org`. Its free
> tier caps `eth_getLogs` at 10,000 blocks per request, which is why the app queries
> logs in chunks.

---

## Testing

```bash
npm test        # unit tests: access control, milestones, validation, soulbound
npm run gas     # measured gas for deploy and each operation
```

Measured on the deployed build, Polygon at ~30 gwei:

| Operation | Gas | ≈ Cost |
|---|---|---|
| Deploy (3 contracts) | 3,763,535 | one-time |
| Approve activity | 123,478 | ~0.004 POL |
| Approve + 3 badges | 450,992 | ~0.014 POL |

---

## Tech stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.24 (evm `cancun`, viaIR, optimizer 200), OpenZeppelin v5 |
| Tooling | Hardhat v2, Chai |
| Frontend | React 19, Vite, Tailwind CSS v4, ethers.js v6 |
| Wallet | MetaMask |
| Networks | Hardhat local (31337), Polygon Amoy (80002) |
| Storage | On-chain SVG for badges; IPFS/Pinata for evidence files |

---

## License

MIT
