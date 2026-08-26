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
seeded, then serves the app against it. No testnet, no faucet, no test POL.

```bash
docker compose up --build
```

Then open <http://localhost:5173>.

To approve activities you need the instructor wallet. In MetaMask:

1. **Add network** — RPC `http://127.0.0.1:8545`, chainId `31337`, symbol `ETH`.
2. **Import account** — use Hardhat account #0, which the deploy script grants
   `INSTRUCTOR_ROLE`:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   This is a public, well-known Hardhat test key. It holds no real funds — never
   reuse it on a public network.

Stop with `Ctrl+C`; `docker compose down -v` also clears the chain state.

### Option B — Run it directly

```bash
# 1. contracts
cd contracts
npm install
npm test                 # 30 passing

# 2. local chain + deploy (terminal 1)
npm run node

# 3. deploy + seed (terminal 2)
npm run deploy:local
npm run seed:local       # optional demo data

# 4. app (terminal 3)
cd ../frontend
npm install
npm run dev              # http://localhost:5173
```

After a local deploy, copy the addresses from `contracts/deployments/localhost.json`
into `frontend/src/contracts/addresses.json`.

> Use the npm scripts rather than `npx hardhat …`. On a machine without a local
> install, `npx` will try to fetch Hardhat 3.x, which this project does not use.

### Option C — Just look at the live data

Clone, `cd frontend && npm install && npm run dev`, and open the **Verify** tab. It
reads the live Amoy contracts — no wallet, no keys, no setup.

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
still work.

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

## App features

- **Role-aware UI** — the wallet's on-chain role decides which panels it can reach.
- **Student** — balance, progress to the next milestone, badge gallery, activity register.
- **Instructor** — approve activities, optional IPFS evidence upload.
- **Admin** — grant and revoke `INSTRUCTOR_ROLE`, address book.
- **Honors** — leaderboard ranked by SCT, rebuilt from on-chain events.
- **Verify** — public, read-only lookup of any address; shareable `?verify=0x…` link.
- **Badge export** — download any badge as SVG or PNG.
- **Address book** — local address→name labels, stored in the browser only, never on-chain.

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
│   ├── test/reward.test.js            # 30 unit tests
│   ├── deployments/                   # addresses written by deploy.js
│   └── hardhat.config.js
└── frontend/                     # Vite + React
    └── src/
        ├── App.jsx                    # all panels
        ├── labels.js                  # address book (localStorage)
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

Fund the deployer with test POL from a faucet first — the
[Google Cloud](https://cloud.google.com/application/web3/faucet/polygon/amoy) or
[QuickNode](https://faucet.quicknode.com/polygon/amoy) faucets both work. About
0.2 POL covers a deploy and many approvals.

The script prints ready-to-run `hardhat verify` commands, writes
`deployments/amoy.json`, and grants the deployer `INSTRUCTOR_ROLE`. Copy the printed
addresses into `frontend/src/contracts/addresses.json`.

> The default Polygon RPC (`rpc-amoy.polygon.technology`) currently fails DNS
> resolution. The config defaults to `https://polygon-amoy.drpc.org` instead. Note
> that its free tier caps `eth_getLogs` at 10,000 blocks per request, which is why
> the app queries logs in chunks.

---

## Testing

```bash
cd contracts
npm test        # 30 passing
npm run gas     # measured gas for deploy and each operation
```

Coverage spans setup and ownership wiring, minting, access control, input
validation, milestone logic including double-award protection, badge access
control, and the six soulbound cases.

Measured on the current build (Polygon at ~30 gwei):

| Operation | Gas | ≈ Cost |
|---|---|---|
| Deploy (3 contracts) | 3,763,535 | one-time |
| Approve activity | 123,478 | ~0.004 POL |
| Approve + 1 badge | 209,500 | ~0.006 POL |
| Approve + 3 badges | 450,992 | ~0.014 POL |

---

## Getting instructor access on the live contracts

Reading is open to everyone. To *approve* activities on the deployed Amoy stack, an
address needs `INSTRUCTOR_ROLE`, which only the admin can grant — from the Admin
panel, or directly:

```
RewardManager.grantRole(keccak256("INSTRUCTOR_ROLE"), <address>)
```

Alternatively, run `docker compose up` and use the local chain, where account #0 is
already an instructor.

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
