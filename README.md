# Laurel — Token-Based Success Award and Gamification System

A blockchain-powered campus engagement reward platform. Students earn **Success Tokens
(SCT, ERC-20)** for verified academic activities and unlock **Achievement Badges
(ERC-721, fully on-chain art)** as they hit milestones. Instructors approve activities;
smart contracts mint the rewards; everything is auditable on-chain.

> Senior project — Efkan Kasaboğlu · Student ID 220304023

---

## Core Loop

```
Activity → Proof upload (IPFS) → Instructor approval → Smart contract → Token minted → Wallet
```

| Layer | What it does |
|-------|--------------|
| **SuccessToken** (ERC-20, `SCT`) | Fungible reward token, owner-only mint (owner = RewardManager) |
| **RewardManager** (AccessControl) | Instructors approve activities → mint SCT, track cumulative earnings, auto-award milestone badges |
| **AchievementBadge** (ERC-721, `BADGE`) | On-chain SVG medallions (bronze/silver/gold tiers), no IPFS needed |

**Milestones:** 50 SCT → *Active Member* (L1) · 100 SCT → *Star Performer* (L2) · 200 SCT → *Campus Legend* (L3).

Activity evidence files are pinned to **IPFS** (via Pinata); only the CID is stored on-chain.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Smart contracts | Solidity 0.8.24 (evm: cancun), OpenZeppelin v5 |
| Framework | Hardhat v2 |
| Frontend | React + Vite, Tailwind CSS v4, ethers.js v6 |
| Wallet | MetaMask |
| Networks | Hardhat local (31337), Polygon Amoy testnet (80002) |
| Storage | IPFS / Pinata (evidence files) |

Design system: **"Laurel"** — chartered academic ledger aesthetic (parchment / brass / ink),
Fraunces + Hanken Grotesk + IBM Plex Mono. Badge art and brand mark are laurel-wreath themed.

---

## Project Structure

```
tokenbased/
├── contracts/                  # Hardhat project
│   ├── contracts/
│   │   ├── SuccessToken.sol         # ERC-20, owner-only mint
│   │   ├── RewardManager.sol        # AccessControl + milestone badge auto-mint
│   │   └── AchievementBadge.sol     # ERC-721, on-chain SVG metadata
│   ├── test/reward.test.js          # 24 unit tests
│   ├── scripts/deploy.js            # network-aware deploy + role wiring
│   ├── scripts/seed.js              # demo data (activities + badges)
│   └── hardhat.config.js
└── frontend/                   # Vite + React app
    └── src/
        ├── App.jsx                  # 3-panel UI + NFT badge gallery
        ├── index.css                # "Laurel" design system
        ├── ipfs.js                  # Pinata upload helper
        └── contracts/               # addresses.json + ABIs
```

**Frontend panels:** Student (balance + activity history + NFT badge gallery) ·
Instructor (approve & mint, IPFS evidence upload) · Admin (role management + system info).

---

## Quick Start

### 1. Smart contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test            # 24 passing
```

### 2. Local blockchain + deploy

```bash
# Terminal 1 — start a local node
npx hardhat node

# Terminal 2 — deploy all 3 contracts + wire roles
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/seed.js   --network localhost   # optional demo data
```

`deploy.js` writes `deployments/localhost.json` and the frontend reads addresses from
`frontend/src/contracts/addresses.json` (update it if addresses change).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

**MetaMask (localhost):** add network "Hardhat Local" — RPC `http://127.0.0.1:8545`,
chainId `31337`. Import Hardhat Account #0 (holds INSTRUCTOR_ROLE) to approve activities.

---

## Configuration

Secrets live in gitignored `.env` files (templates provided as `.env.example`).

| File | Keys |
|------|------|
| `contracts/.env` | `DEPLOYER_PRIVATE_KEY`, RPC URL, `POLYGONSCAN_API_KEY` (for verify) |
| `frontend/.env` | `VITE_PINATA_JWT` (IPFS upload), optional `VITE_PINATA_GATEWAY` |

When `VITE_PINATA_JWT` is unset the IPFS upload UI hides gracefully; manual activity
references still work.

---

## Deploy to Polygon Amoy

```bash
cd contracts
# fund the deployer with test POL from a faucet, then:
npx hardhat run scripts/deploy.js --network amoy
# update frontend/src/contracts/addresses.json with the printed addresses + chainId 80002
```

**MetaMask (Amoy):** network "Polygon Amoy Testnet", RPC `https://rpc-amoy.polygon.technology`,
chainId `80002`.

Contract verification commands are printed by the deploy script (needs `POLYGONSCAN_API_KEY`).

---

## License

Academic project. Not audited for production use.
