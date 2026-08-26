import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { ethers } from "ethers";
import addresses from "./contracts/addresses.json";
import successTokenAbi from "./contracts/SuccessToken.abi.json";
import rewardManagerAbi from "./contracts/RewardManager.abi.json";
import achievementBadgeAbi from "./contracts/AchievementBadge.abi.json";
import { uploadToIPFS, ipfsConfigured, ipfsUrl, looksLikeCid } from "./ipfs";
import { nameFor, setLabel, allLabels, subscribeLabels } from "./labels";

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (target <= 0 || started.current) return;
    started.current = true;
    if (typeof document !== "undefined" && document.hidden) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

const EXPECTED_CHAIN_ID = BigInt(addresses.chainId);
const NETWORK_NAME =
  addresses.chainId === 80002
    ? "Polygon Amoy Testnet"
    : addresses.chainId === 31337
    ? "Hardhat Local"
    : `chainId ${addresses.chainId}`;
const INSTRUCTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INSTRUCTOR_ROLE"));

const MILESTONES = [
  { threshold: 50, level: 1, name: "Active Member" },
  { threshold: 100, level: 2, name: "Star Performer" },
  { threshold: 200, level: 3, name: "Campus Legend" },
];

function niceNum(n) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const toastBus = { listeners: new Set() };
let _toastId = 0;
function pushToast(type, msg, ttl = 4200) {
  const id = ++_toastId;
  toastBus.listeners.forEach((fn) => fn({ kind: "push", toast: { id, type, msg, ttl } }));
  return id;
}
function dismissToast(id) {
  toastBus.listeners.forEach((fn) => fn({ kind: "dismiss", id }));
}

function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (ev) => {
      if (ev.kind === "push") {
        setItems((cur) => [...cur, ev.toast]);
        if (ev.toast.ttl > 0) {
          setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== ev.toast.id)), ev.toast.ttl);
        }
      } else if (ev.kind === "dismiss") {
        setItems((cur) => cur.filter((t) => t.id !== ev.id));
      }
    };
    toastBus.listeners.add(fn);
    return () => toastBus.listeners.delete(fn);
  }, []);

  const dotColor = (t) =>
    t === "ok" ? "var(--color-forest)" : t === "err" ? "var(--color-oxblood)" : "var(--color-brass)";

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[min(20rem,calc(100vw-2.5rem))]">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="paper px-4 py-3 shadow-lg flex items-center gap-3 rise"
          style={{ borderLeft: `3px solid ${dotColor(t.type)}` }}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${t.type === "pending" ? "animate-pulse" : ""}`}
            style={{ background: dotColor(t.type) }}
          />
          <span className="text-sm text-ink leading-snug">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

const LOG_CHUNK = addresses.chainId === 31337 ? 50000 : 9500;
const LOG_CONCURRENCY = addresses.chainId === 31337 ? 1 : 16;

const READ_RPC = addresses.chainId === 31337
  ? "http://127.0.0.1:8545"
  : "https://polygon-amoy.drpc.org";
const readProvider = new ethers.JsonRpcProvider(READ_RPC, undefined, { staticNetwork: true, batchMaxCount: 1 });

function shortAddr(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}

function useLabelsVersion() {
  const [, setV] = useState(0);
  useEffect(() => subscribeLabels(() => setV((v) => v + 1)), []);
}

function AddrLabel({ address }) {
  useLabelsVersion();
  const name = nameFor(address);
  if (name) {
    return (
      <span title={address}>
        {name} <span className="text-ink-faint">({shortAddr(address)})</span>
      </span>
    );
  }
  return <span>{shortAddr(address)}</span>;
}

function AddressBook() {
  useLabelsVersion();
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const entries = allLabels();

  const save = () => {
    if (!ethers.isAddress(addr.trim())) { pushToast("err", "Invalid address"); return; }
    if (!name.trim()) { pushToast("err", "Enter a name"); return; }
    setLabel(addr.trim(), name.trim());
    pushToast("ok", `Saved ${name.trim()}`);
    setAddr(""); setName("");
  };

  return (
    <div className="paper p-6 rise" style={{ animationDelay: "0.16s" }}>
      <h2 className="display text-xl font-semibold text-ink mb-1">Address Book</h2>
      <p className="text-sm text-ink-soft mb-4">Local labels for wallet addresses — stored in this browser only, never on-chain.</p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… address" className="field flex-1" aria-label="Address to label" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" className="field flex-1" aria-label="Name for address" />
        <button onClick={save} className="btn btn-primary px-5 whitespace-nowrap">Save</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">No labels yet.</p>
      ) : (
        <table className="ledger">
          <thead>
            <tr><th>Name</th><th>Address</th><th></th></tr>
          </thead>
          <tbody>
            {entries.map(([a, n]) => (
              <tr key={a}>
                <td className="text-ink font-medium">{n}</td>
                <td className="font-mono text-ink-soft">{shortAddr(a)}</td>
                <td className="text-right"><button onClick={() => setLabel(a, "")} className="btn btn-ghost px-2 py-1 text-xs">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function friendlyError(err) {
  const raw = (err?.reason || err?.shortMessage || err?.message || "").toLowerCase();
  if (err?.code === "ACTION_REJECTED" || raw.includes("user rejected") || raw.includes("user denied"))
    return "Transaction cancelled in MetaMask.";
  if (raw.includes("accesscontrol") || raw.includes("missing role") || raw.includes("is missing role"))
    return "This account isn't authorized as an instructor. Switch to an account with INSTRUCTOR_ROLE.";
  if (raw.includes("insufficient funds"))
    return "Not enough funds to cover gas. Top up this wallet and try again.";
  if (raw.includes("network") || raw.includes("could not detect") || raw.includes("failed to fetch"))
    return "Network error reaching the chain. Check your connection and try again.";
  return err?.reason || err?.shortMessage || err?.message || "Transaction failed.";
}

function RefCell({ value }) {
  if (looksLikeCid(value)) {
    const clean = value.replace(/^ipfs:\/\//, "");
    return (
      <a href={ipfsUrl(value)} target="_blank" rel="noreferrer" className="text-brass underline decoration-dotted underline-offset-2 hover:text-ink">
        {clean.slice(0, 8)}…{clean.slice(-4)}
      </a>
    );
  }
  return <span className="text-ink font-medium">{value}</span>;
}

async function queryLogsChunked(contract, filter, provider, fromBlock) {
  const latest = await provider.getBlockNumber();
  const start = Math.max(fromBlock ?? 0, 0);
  const ranges = [];
  for (let from = start; from <= latest; from += LOG_CHUNK) {
    ranges.push([from, Math.min(from + LOG_CHUNK - 1, latest)]);
  }
  const all = [];
  const failed = [];
  const run = async (list, onFail) => {
    for (let i = 0; i < list.length; i += LOG_CONCURRENCY) {
      const batch = list.slice(i, i + LOG_CONCURRENCY);
      const results = await Promise.all(
        batch.map(([from, to]) =>
          contract.queryFilter(filter, from, to).catch(() => {
            onFail([from, to]);
            return null;
          })
        )
      );
      for (const ev of results) if (ev && ev.length) all.push(...ev);
    }
  };
  await run(ranges, (r) => failed.push(r));
  if (failed.length) await run(failed.splice(0), () => {});
  all.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  return all;
}

async function badgeOwners(badge) {
  const minted = Number(await badge.totalMinted());
  if (!minted) return [];
  const ids = Array.from({ length: minted }, (_, i) => i + 1);
  const owners = await Promise.all(ids.map((id) => badge.ownerOf(id).catch(() => null)));
  return ids.map((id, i) => ({ id, owner: owners[i] })).filter((r) => r.owner);
}

async function loadBadgesOf(badge, account) {
  const mine = (await badgeOwners(badge)).filter(
    (r) => r.owner.toLowerCase() === account.toLowerCase()
  );
  return Promise.all(
    mine.map(async ({ id }) => {
      const [level, name] = await Promise.all([
        badge.levelOf(id).catch(() => 0n),
        badge.nameOf(id).catch(() => ""),
      ]);
      let svg = null;
      try {
        svg = JSON.parse(atob((await badge.tokenURI(id)).split(",")[1])).image;
      } catch (_) {}
      return { tokenId: String(id), level: level.toString(), name, svg };
    })
  );
}

const Icon = {
  cap: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 8.5 12 4l10 4.5-10 4.5L2 8.5Z" /><path d="M6 10.5v4.2c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8v-4.2" /><path d="M22 8.5v5" />
    </svg>
  ),
  quill: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 4C12 5 7.5 9.5 5 17l2 2c7.5-2.5 12-7 13-15Z" /><path d="M5 19c2-3 5-5 9-6" /><path d="M3 21l2-2" />
    </svg>
  ),
  gear: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="3.2" /><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  ),
  coin: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.3v9.4M9.5 9.6c0-1.1 1.1-1.7 2.5-1.7s2.5.6 2.5 1.7-1.1 1.6-2.5 1.7-2.5.6-2.5 1.7 1.1 1.7 2.5 1.7 2.5-.6 2.5-1.7" />
    </svg>
  ),
  arrow: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12h15" /><path d="M13 6l6 6-6 6" />
    </svg>
  ),
  copy: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="9" width="11" height="11" rx="0" /><path d="M5 15V5a1 1 0 0 1 1-1h9" />
    </svg>
  ),
  check: (p) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12.5l5 5L20 6" />
    </svg>
  ),
};

function CopyBtn({ value }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="shrink-0 text-ink-soft hover:text-stamp transition-colors"
      aria-label={`Copy ${value}`}
      title="Copy full address"
    >
      {done ? <Icon.check className="w-4 h-4 text-forest" /> : <Icon.copy className="w-4 h-4" />}
    </button>
  );
}

function LaurelMark({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 41C15 37 11 28 14 16" />
      <path d="M24 41C33 37 37 28 34 16" />
      <path d="M14 19c-3-1-5 0-6 3 3 1 5 0 6-3" />
      <path d="M14.5 25c-3-1-5 0-6 3 3 1 5 0 6-3" />
      <path d="M16 31c-3-1-5 0-6 3 3 1 5 0 6-3" />
      <path d="M34 19c3-1 5 0 6 3-3 1-5 0-6-3" />
      <path d="M33.5 25c3-1 5 0 6 3-3 1-5 0-6-3" />
      <path d="M32 31c3-1 5 0 6 3-3 1-5 0-6-3" />
      <path d="M24 7.5l1.4 3 3.3.3-2.5 2.1.8 3.2L24 17.4l-3 1.7.8-3.2-2.5-2.1 3.3-.3z" />
    </svg>
  );
}

const STEPS = [
  { icon: Icon.quill, title: "Approve", sub: "Instructor seals" },
  { icon: Icon.coin, title: "Mint", sub: "Auto on-chain" },
  { icon: Icon.cap, title: "Own", sub: "In your wallet" },
];

function StatsStrip() {
  const [stats, setStats] = useState({ sct: 0, badges: 0, activities: 0 });

  useEffect(() => {
    (async () => {
      try {
        const token = new ethers.Contract(addresses.successToken, successTokenAbi, readProvider);
        const badge = new ethers.Contract(addresses.achievementBadge, achievementBadgeAbi, readProvider);
        const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);

        const [supply, minted] = await Promise.all([
          token.totalSupply().catch(() => 0n),
          badge.totalMinted().catch(() => 0n),
        ]);
        setStats((s) => ({
          ...s,
          sct: Math.round(Number(ethers.formatEther(supply))),
          badges: Number(minted),
        }));

        queryLogsChunked(manager, manager.filters.ActivityApproved(), readProvider, addresses.deployBlock)
          .then((events) => setStats((s) => ({ ...s, activities: events.length })))
          .catch(() => {});
      } catch (_) {}
    })();
  }, []);

  const sctDisplay = useCountUp(stats.sct);
  const badgeDisplay = useCountUp(stats.badges);
  const activityDisplay = useCountUp(stats.activities);

  if (stats.sct === 0 && stats.badges === 0) return null;

  return (
    <div className="max-w-2xl mx-auto pb-16 rise" style={{ animationDelay: "0.35s" }}>
      <p className="eyebrow text-center mb-4">Protocol ledger · all students</p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: sctDisplay, label: "Total SCT Minted", suffix: "" },
          { value: badgeDisplay, label: "Total Badges Awarded", suffix: "" },
          { value: activityDisplay, label: "Total Activities", suffix: "" },
        ].map((s) => (
          <div key={s.label} className="paper p-5 text-center">
            <p className="display text-3xl sm:text-4xl font-semibold text-brass tabular-nums balance-reveal">
              {s.value}{s.suffix}
            </p>
            <p className="eyebrow mt-2">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function downloadUri(uri, filename) {
  const a = document.createElement("a");
  a.href = uri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function svgUriToPngUri(svgUri, size = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      c.getContext("2d").drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgUri;
  });
}

function verifyLink(addr) {
  return `${window.location.origin}${window.location.pathname}?verify=${addr}`;
}

function BadgeCard({ b }) {
  const [busy, setBusy] = useState(false);
  const dlPng = async () => {
    if (!b.svg) return;
    try {
      setBusy(true);
      downloadUri(await svgUriToPngUri(b.svg), `laurel-badge-${b.tokenId}.png`);
    } catch (_) {
      pushToast("err", "Couldn't render PNG");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="trophy flex flex-col items-center gap-2">
      {b.svg
        ? <img src={b.svg} alt={b.name} className="w-full rounded-md" />
        : <div className="w-full aspect-square grid place-items-center text-4xl bg-paper-3 rounded-md text-brass">★</div>}
      <p className="display text-sm font-semibold text-ink text-center leading-tight">{b.name}</p>
      <p className="font-mono text-[0.65rem] text-ink-soft">L{b.level} · #{b.tokenId}</p>
      <span className="stamp text-[0.6rem]" title="Non-transferable (ERC-5192)">🔒 Soulbound</span>
      {b.svg && (
        <div className="flex gap-1.5">
          <button onClick={() => downloadUri(b.svg, `laurel-badge-${b.tokenId}.svg`)} className="btn btn-ghost px-2.5 py-1 text-[0.65rem]">SVG</button>
          <button onClick={dlPng} disabled={busy} className="btn btn-ghost px-2.5 py-1 text-[0.65rem]">{busy ? "…" : "PNG"}</button>
        </div>
      )}
    </div>
  );
}

function MilestoneProgress({ balance }) {
  const bal = Number(balance) || 0;
  const next = MILESTONES.find((m) => m.threshold > bal);
  const floor = MILESTONES.filter((m) => m.threshold <= bal).map((m) => m.threshold).pop() || 0;
  const ceil = next ? next.threshold : floor;
  const pct = next ? Math.min(100, Math.max(2, Math.round(((bal - floor) / (ceil - floor)) * 100))) : 100;
  const remaining = next ? next.threshold - bal : 0;

  return (
    <div className="paper p-6 rise" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="eyebrow">{next ? "Progress to next honor" : "Highest honor reached"}</p>
        <span className="stamp stamp--ok">{next ? next.name : "Campus Legend"}</span>
      </div>
      <div className="h-3 rounded-full bg-paper-3 border border-line overflow-hidden">
        <div className="h-full bg-brass transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-ink-soft mt-3">
        {next ? (
          <>
            <span className="font-mono text-ink">{niceNum(bal)}</span> / {next.threshold} SCT ·{" "}
            <strong className="text-forest">{niceNum(remaining)} SCT</strong> to <strong className="text-ink">{next.name}</strong>
          </>
        ) : (
          <>All three honors earned — <span className="font-mono text-ink">{niceNum(bal)}</span> SCT total.</>
        )}
      </p>
    </div>
  );
}

function StudentPanel({ account, provider, refreshKey }) {
  const [balance, setBalance] = useState("0");
  const [history, setHistory] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const token = new ethers.Contract(addresses.successToken, successTokenAbi, readProvider);
      const bal = await token.balanceOf(account);
      setBalance(ethers.formatEther(bal));
      setLoading(false);

      if (addresses.achievementBadge) {
        const badge = new ethers.Contract(addresses.achievementBadge, achievementBadgeAbi, readProvider);
        loadBadgesOf(badge, account).then(setBadges).catch(() => {});
      }

      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
      const filter = manager.filters.ActivityApproved(null, account);
      const events = await queryLogsChunked(manager, filter, readProvider, addresses.deployBlock);
      const parsed = events.map((e) => ({
        instructor: e.args.instructor,
        amount: ethers.formatEther(e.args.amount),
        ref: e.args.activityRef,
        block: e.blockNumber,
      }));
      setHistory(parsed.reverse());
    } catch (e) {
      setError("Couldn't read the ledger. Check your network connection and try Refresh.");
    }
    setLoading(false);
  }, [account]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="space-y-6">
      {error && <div className="banner banner-err rise">{error}</div>}

      <div className="paper paper--ruled p-7 rise" style={{ animationDelay: "0.02s" }}>
        <p className="eyebrow mb-3">Token of Account · Balance</p>
        {loading ? (
          <div className="skeleton h-16 w-52 sm:h-[4.5rem]" />
        ) : (
          <div className="flex items-end gap-3 balance-reveal">
            <span className="display text-6xl sm:text-7xl font-semibold leading-none text-ink tabular-nums">{balance}</span>
            <span className="display text-2xl text-brass mb-1">SCT</span>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <p className="font-mono text-xs text-ink-soft break-all">{account}</p>
          {!loading && (
            <button
              onClick={() => { navigator.clipboard?.writeText(verifyLink(account)); pushToast("ok", "Share link copied"); }}
              className="btn btn-ghost px-3 py-1 text-xs whitespace-nowrap"
            >
              Share my honors
            </button>
          )}
        </div>
      </div>

      {!loading && <MilestoneProgress balance={balance} />}

      <div className="paper p-6 rise" style={{ animationDelay: "0.08s" }}>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="display text-xl font-semibold text-ink">Hall of Honors</h2>
          <span className="eyebrow">ERC-721</span>
        </div>
        <p className="text-sm text-ink-soft mb-5">Sealed at the 50 · 100 · 200 SCT milestones.</p>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton rounded-lg" style={{ aspectRatio: "3 / 4" }} />)}
          </div>
        ) : badges.length === 0 ? (
          <p className="text-sm text-ink-soft">No honors yet — earn 50 SCT to claim your first seal.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {badges.map((b) => <BadgeCard key={b.tokenId} b={b} />)}
          </div>
        )}
      </div>

      <div className="paper p-6 rise" style={{ animationDelay: "0.14s" }}>
        <h2 className="display text-xl font-semibold text-ink mb-4">Register of Activities</h2>
        {loading ? (
          <div className="space-y-3 pt-1">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-6 w-full" />)}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-soft">No entries yet — complete a campus activity to earn tokens.</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr><th>Activity</th><th>Amount</th><th>Instructor</th><th>Block</th></tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td><RefCell value={h.ref} /></td>
                  <td className="text-forest font-mono font-semibold">+{h.amount}</td>
                  <td className="text-ink-soft font-mono"><AddrLabel address={h.instructor} /></td>
                  <td className="text-ink-soft font-mono">#{h.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InstructorPanel({ signer, provider, refreshKey, onMinted }) {
  const [student, setStudent] = useState("");
  const [amount, setAmount] = useState("10");
  const [activityRef, setActivityRef] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_MB = 10;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
    if (file.size > MAX_MB * 1024 * 1024) {
      setStatus({ type: "err", msg: `File too large — max ${MAX_MB} MB` });
      e.target.value = "";
      return;
    }
    if (file.type && !allowed.includes(file.type)) {
      setStatus({ type: "err", msg: "Unsupported type — attach an image or PDF" });
      e.target.value = "";
      return;
    }
    try {
      setUploading(true);
      setStatus({ type: "pending", msg: `Pinning ${file.name} to IPFS…` });
      const cid = await uploadToIPFS(file);
      setActivityRef(cid);
      setStatus({ type: "ok", msg: `Pinned to IPFS · CID ${cid.slice(0, 10)}…` });
    } catch (err) {
      setStatus({ type: "err", msg: err?.message || "IPFS upload failed" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const loadRecent = useCallback(async () => {
    if (!provider) return;
    try {
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
      const events = await queryLogsChunked(manager, manager.filters.ActivityApproved(), readProvider, addresses.deployBlock);
      setRecent(events.slice(-5).reverse().map((e) => ({
        student: e.args.student,
        amount: ethers.formatEther(e.args.amount),
        ref: e.args.activityRef,
        block: e.blockNumber,
      })));
    } catch (_) {}
  }, [provider]);

  useEffect(() => { loadRecent(); }, [loadRecent, refreshKey]);

  const approve = async (e) => {
    e.preventDefault();
    if (!ethers.isAddress(student)) { setStatus({ type: "err", msg: "Enter a valid student wallet address (0x…)" }); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setStatus({ type: "err", msg: "Amount must be a number greater than 0" }); return; }
    if (!activityRef.trim()) { setStatus({ type: "err", msg: "Activity reference or CID is required" }); return; }
    let pid;
    try {
      setBusy(true);
      setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      pid = pushToast("pending", "Confirm in MetaMask…", 0);
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.approveActivity(student, ethers.parseEther(amount), activityRef.trim());
      dismissToast(pid);
      pid = pushToast("pending", "Mining… " + tx.hash.slice(0, 10) + "…", 0);
      setStatus({ type: "pending", msg: "Mining… " + tx.hash.slice(0, 12) + "…" });
      await tx.wait();
      dismissToast(pid); pid = null;
      setStatus({ type: "ok", msg: `Minted ${amount} SCT to ${shortAddr(student)}` });
      pushToast("ok", `Minted ${amount} SCT to ${shortAddr(student)}`);
      setStudent(""); setActivityRef("");
      loadRecent();
      onMinted?.();
    } catch (err) {
      if (pid) dismissToast(pid);
      const msg = friendlyError(err);
      setStatus({ type: "err", msg });
      pushToast("err", msg);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="paper paper--ruled p-7 rise" style={{ animationDelay: "0.02s" }}>
        <p className="eyebrow mb-1">Instructor Endorsement</p>
        <h2 className="display text-2xl font-semibold text-ink mb-5">Approve &amp; Mint Award</h2>
        <form onSubmit={approve} className="space-y-4">
          <div>
            <label htmlFor="inst-student" className="label">Student wallet address</label>
            <input id="inst-student" value={student} onChange={(e) => setStudent(e.target.value)} placeholder="0x…" className="field" />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="sm:w-36">
              <label htmlFor="inst-amount" className="label">Amount · SCT</label>
              <input id="inst-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
            </div>
            <div className="flex-1">
              <label htmlFor="inst-ref" className="label">Activity reference</label>
              <div className="flex gap-2">
                <input id="inst-ref" value={activityRef} onChange={(e) => setActivityRef(e.target.value)} placeholder="event-001 or IPFS CID" className="field flex-1" />
                {ipfsConfigured() && (
                  <label className={`btn btn-ghost px-3 flex items-center cursor-pointer whitespace-nowrap ${uploading ? "opacity-60" : ""}`}>
                    {uploading ? "Pinning…" : "Attach"}
                    <input type="file" accept="image/*,application/pdf" aria-label="Upload evidence file to IPFS" className="hidden" onChange={handleFile} disabled={uploading} />
                  </label>
                )}
              </div>
              <p className="text-[0.7rem] text-ink-soft mt-1.5">
                {ipfsConfigured()
                  ? "Attach a proof file — it pins to IPFS and fills the CID."
                  : "IPFS off — set VITE_PINATA_JWT to enable file attach."}
              </p>
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
            {busy ? "Processing…" : "Seal Approval & Mint"}
          </button>
        </form>
        {status && (
          <div className={`mt-4 banner ${status.type === "ok" ? "banner-ok" : status.type === "err" ? "banner-err" : "banner-wait"}`}>
            {status.msg}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="paper p-6 rise" style={{ animationDelay: "0.1s" }}>
          <h2 className="display text-xl font-semibold text-ink mb-4">Recent Endorsements</h2>
          <table className="ledger">
            <thead>
              <tr><th>Activity</th><th>Student</th><th>Amount</th><th>Block</th></tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td><RefCell value={r.ref} /></td>
                  <td className="font-mono text-ink-soft"><AddrLabel address={r.student} /></td>
                  <td className="text-forest font-mono font-semibold">{r.amount}</td>
                  <td className="text-ink-soft font-mono">#{r.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ signer, provider, account }) {
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isInstructor, setIsInstructor] = useState(null);

  const checkRole = async () => {
    if (!ethers.isAddress(target)) return;
    try {
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
      const has = await manager.hasRole(INSTRUCTOR_ROLE, target);
      setIsInstructor(has);
    } catch (_) { setIsInstructor(null); }
  };

  const grantRole = async () => {
    if (!ethers.isAddress(target)) { setStatus({ type: "err", msg: "Invalid address" }); return; }
    let pid;
    try {
      setBusy(true); setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      pid = pushToast("pending", "Confirm in MetaMask…", 0);
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.grantRole(INSTRUCTOR_ROLE, target);
      dismissToast(pid); pid = pushToast("pending", "Mining… " + tx.hash.slice(0, 10) + "…", 0);
      await tx.wait();
      dismissToast(pid); pid = null;
      setStatus({ type: "ok", msg: `INSTRUCTOR_ROLE granted to ${shortAddr(target)}` });
      pushToast("ok", `Role granted to ${shortAddr(target)}`);
      setIsInstructor(true);
    } catch (err) {
      if (pid) dismissToast(pid);
      const msg = friendlyError(err);
      setStatus({ type: "err", msg });
      pushToast("err", msg);
    } finally { setBusy(false); }
  };

  const revokeRole = async () => {
    if (!ethers.isAddress(target)) { setStatus({ type: "err", msg: "Invalid address" }); return; }
    let pid;
    try {
      setBusy(true); setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      pid = pushToast("pending", "Confirm in MetaMask…", 0);
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.revokeRole(INSTRUCTOR_ROLE, target);
      dismissToast(pid); pid = pushToast("pending", "Mining… " + tx.hash.slice(0, 10) + "…", 0);
      await tx.wait();
      dismissToast(pid); pid = null;
      setStatus({ type: "ok", msg: `INSTRUCTOR_ROLE revoked from ${shortAddr(target)}` });
      pushToast("ok", `Role revoked from ${shortAddr(target)}`);
      setIsInstructor(false);
    } catch (err) {
      if (pid) dismissToast(pid);
      const msg = friendlyError(err);
      setStatus({ type: "err", msg });
      pushToast("err", msg);
    } finally { setBusy(false); }
  };

  const rows = [
    { label: "SuccessToken (SCT)", addr: addresses.successToken },
    { label: "RewardManager", addr: addresses.rewardManager },
    addresses.achievementBadge ? { label: "AchievementBadge", addr: addresses.achievementBadge } : null,
    { label: "Your account (Admin)", addr: account },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="paper paper--ruled p-7 rise" style={{ animationDelay: "0.02s" }}>
        <p className="eyebrow mb-1">Charter · On-Chain Registry</p>
        <h2 className="display text-2xl font-semibold text-ink mb-1">System Information</h2>
        <p className="text-sm text-ink-soft mb-5">Deployed on {NETWORK_NAME} · chainId {addresses.chainId}</p>
        <div>
          {rows.map(({ label, addr }) => (
            <div key={label} className="flex justify-between items-center gap-4 py-2.5 border-b border-line last:border-0">
              <span className="text-xs uppercase tracking-wider text-ink-soft shrink-0">{label}</span>
              <span className="flex items-center gap-2.5">
                <code className="font-mono text-xs text-ink">{shortAddr(addr)}</code>
                <CopyBtn value={addr} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="paper p-6 rise" style={{ animationDelay: "0.1s" }}>
        <h2 className="display text-xl font-semibold text-ink mb-5">Instructor Role Management</h2>
        <div className="flex gap-3 mb-4">
          <input aria-label="Wallet address to grant or revoke instructor role" value={target} onChange={(e) => { setTarget(e.target.value); setIsInstructor(null); }} placeholder="0x… wallet address" className="field flex-1" />
          <button onClick={checkRole} className="btn btn-ghost px-5">Check</button>
        </div>
        {isInstructor !== null && (
          <p className="mb-4">
            <span className={`stamp ${isInstructor ? "stamp--ok" : ""}`}>
              {isInstructor ? "Holds INSTRUCTOR_ROLE" : "No INSTRUCTOR_ROLE"}
            </span>
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={grantRole} disabled={busy} className="btn btn-primary flex-1 py-3 text-sm">Grant Role</button>
          <button onClick={revokeRole} disabled={busy} className="btn btn-danger flex-1 py-3 text-sm">Revoke Role</button>
        </div>
        {status && (
          <div className={`mt-4 banner ${status.type === "ok" ? "banner-ok" : status.type === "err" ? "banner-err" : "banner-wait"}`}>
            {status.msg}
          </div>
        )}
      </div>

      <AddressBook />
    </div>
  );
}

function LeaderboardPanel({ account, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
        const badge = new ethers.Contract(addresses.achievementBadge, achievementBadgeAbi, readProvider);
        const [acts, owners] = await Promise.all([
          queryLogsChunked(manager, manager.filters.ActivityApproved(), readProvider, addresses.deployBlock),
          badgeOwners(badge),
        ]);
        const map = new Map();
        const get = (s) => map.get(s) || { student: s, sct: 0n, badges: 0 };
        for (const e of acts) {
          const c = get(e.args.student);
          c.sct += e.args.amount;
          map.set(e.args.student, c);
        }
        for (const { owner } of owners) {
          const c = get(owner);
          c.badges += 1;
          map.set(owner, c);
        }
        const list = [...map.values()]
          .map((r) => ({ ...r, sctNum: Number(ethers.formatEther(r.sct)) }))
          .sort((a, b) => b.sctNum - a.sctNum);
        if (!cancelled) setRows(list);
      } catch (_) {
        if (!cancelled) setRows([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  return (
    <div className="paper p-6 rise">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="display text-xl font-semibold text-ink">Leaderboard</h2>
        <span className="eyebrow">by SCT earned</span>
      </div>
      <p className="text-sm text-ink-soft mb-5">Ranked from on-chain approval records.</p>
      {loading ? (
        <div className="space-y-3 pt-1">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-6 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No approvals recorded yet.</p>
      ) : (
        <table className="ledger">
          <thead>
            <tr><th>Rank</th><th>Student</th><th>SCT</th><th>Honors</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const mine = account && r.student.toLowerCase() === account.toLowerCase();
              return (
                <tr key={r.student} style={mine ? { background: "color-mix(in srgb, var(--color-brass) 13%, transparent)" } : undefined}>
                  <td className="font-mono">{medal(i)}</td>
                  <td className="font-mono text-ink-soft">
                    <AddrLabel address={r.student} />
                    {mine && <span className="stamp stamp--ok ml-2">you</span>}
                  </td>
                  <td className="text-forest font-mono font-semibold">{niceNum(r.sctNum)}</td>
                  <td className="font-mono text-ink-soft">{r.badges}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VerifyPanel() {
  const [input, setInput] = useState("");
  const [addr, setAddr] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useLabelsVersion();

  const verify = async (e, override) => {
    e?.preventDefault();
    const a = (override ?? input).trim();
    if (override) setInput(override);
    if (!ethers.isAddress(a)) { setError("Enter a valid wallet address (0x…)"); setData(null); return; }
    setError(null); setLoading(true); setAddr(a); setData(null);
    try {
      const token = new ethers.Contract(addresses.successToken, successTokenAbi, readProvider);
      const badge = new ethers.Contract(addresses.achievementBadge, achievementBadgeAbi, readProvider);
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
      const bal = await token.balanceOf(a);
      const [badges, acts] = await Promise.all([
        loadBadgesOf(badge, a),
        queryLogsChunked(manager, manager.filters.ActivityApproved(null, a), readProvider, addresses.deployBlock),
      ]);
      setData({ balance: ethers.formatEther(bal), badges, activities: acts.length });
    } catch (_) {
      setError("Couldn't read the ledger. Check your connection and try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("verify");
    if (q && ethers.isAddress(q)) verify(null, q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="paper p-6 rise">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="display text-xl font-semibold text-ink">Verify a Student</h2>
        <span className="eyebrow">public · read-only</span>
      </div>
      <p className="text-sm text-ink-soft mb-4">Anyone can confirm on-chain honors — no wallet needed.</p>
      <form onSubmit={verify} className="flex gap-2 mb-4">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x… wallet address" className="field flex-1" aria-label="Wallet address to verify" />
        <button type="submit" disabled={loading} className="btn btn-primary px-5 whitespace-nowrap">{loading ? "Reading…" : "Verify"}</button>
      </form>
      {error && <div className="banner banner-err">{error}</div>}
      {addr && !loading && data && (
        <div className="space-y-5">
          {nameFor(addr) && <p className="display text-lg font-semibold text-ink">{nameFor(addr)}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <span className="display text-4xl font-semibold text-ink tabular-nums balance-reveal">{niceNum(data.balance)}</span>
            <span className="display text-lg text-brass mb-1">SCT</span>
            <span className="ml-auto text-sm text-ink-soft">{data.activities} activities · {data.badges.length} honors</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-mono text-xs text-ink-soft break-all">{addr}</p>
            <button
              onClick={() => { navigator.clipboard?.writeText(verifyLink(addr)); pushToast("ok", "Verify link copied"); }}
              className="btn btn-ghost px-3 py-1 text-xs whitespace-nowrap"
            >
              Copy verify link
            </button>
          </div>
          <MilestoneProgress balance={data.balance} />
          {data.badges.length === 0 ? (
            <p className="text-sm text-ink-soft">No honors yet for this address.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.badges.map((b) => <BadgeCard key={b.tokenId} b={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "Student", icon: Icon.cap },
  { id: "Honors", icon: Icon.coin },
  { id: "Verify", icon: Icon.check },
  { id: "Instructor", icon: Icon.quill },
  { id: "Admin", icon: Icon.gear },
];

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainOk, setChainOk] = useState(true);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [tab, setTab] = useState("Student");
  const [role, setRole] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const ROLE_TABS = { admin: ["Student", "Honors", "Verify", "Instructor", "Admin"], instructor: ["Student", "Honors", "Verify", "Instructor"], student: ["Student", "Honors", "Verify"] };
  const allowedTabs = ROLE_TABS[role] || ["Student"];
  const visibleTabs = TABS.filter((t) => allowedTabs.includes(t.id));

  const connect = useCallback(async () => {
    if (!window.ethereum) { alert("MetaMask not found."); return; }
    const p = new ethers.BrowserProvider(window.ethereum);
    const accounts = await p.send("eth_requestAccounts", []);
    const net = await p.getNetwork();
    const s = await p.getSigner();
    setAccount(accounts[0]);
    setProvider(p);
    setSigner(s);
    setChainOk(net.chainId === EXPECTED_CHAIN_ID);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }, []);

  useEffect(() => {
    if (!account || !provider || !chainOk) { setRole(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, readProvider);
        const [isAdmin, isInstructor] = await Promise.all([
          manager.hasRole(ethers.ZeroHash, account),
          manager.hasRole(INSTRUCTOR_ROLE, account),
        ]);
        if (!cancelled) setRole(isAdmin ? "admin" : isInstructor ? "instructor" : "student");
      } catch (_) {
        if (!cancelled) setRole("student");
      }
    })();
    return () => { cancelled = true; };
  }, [account, provider, chainOk]);

  useEffect(() => {
    if (role && !allowedTabs.includes(tab)) setTab("Student");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen" style={{ zIndex: 1 }}>
      <header className="sticky top-0 z-10 border-b border-rule-strong" style={{ background: "color-mix(in srgb, var(--color-parchment) 88%, transparent)", backdropFilter: "blur(8px)" }}>
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span className="seal"><LaurelMark className="w-6 h-6" /></span>
            <p className="display text-xl font-semibold text-ink leading-tight">Laurel</p>
          </div>
          {account ? (
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span
                className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono border ${
                  chainOk ? "border-rule-strong text-ink-soft" : "border-oxblood text-oxblood"
                }`}
                title={`chainId ${addresses.chainId}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chainOk ? "bg-forest" : "bg-oxblood"}`} />
                {NETWORK_NAME}
              </span>
              {chainOk && (
                <button onClick={refresh} className="btn btn-ghost px-3 py-2 text-xs" title="Reload on-chain data">
                  Refresh
                </button>
              )}
              <div className="flex items-center gap-2.5 paper px-3 sm:px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-forest" />
                <span className="font-mono text-xs text-ink-soft">{shortAddr(account)}</span>
                {chainOk && role && (
                  <span className={`stamp ${role === "student" ? "" : "stamp--ok"}`}>{role}</span>
                )}
              </div>
            </div>
          ) : (
            <button onClick={connect} className="btn btn-primary px-5 py-2.5 text-sm">Connect MetaMask</button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {!account ? (
          <div>
            <div className="text-center pt-20 pb-14 rise">
              <div className="seal mx-auto mb-7" style={{ width: "5rem", height: "5rem" }}><LaurelMark className="w-10 h-10" /></div>
              <p className="eyebrow mb-4">Chartered on {NETWORK_NAME}</p>
              <h1 className="display text-5xl font-semibold text-ink mb-4 leading-tight max-w-xl mx-auto">
                Earn your honors,<br />minted on-chain.
              </h1>
              <p className="text-ink-soft mb-9 max-w-md mx-auto leading-relaxed">
                A blockchain reward ledger for campus engagement. Connect your wallet to claim Success Tokens and sealed achievement honors.
              </p>
              <button onClick={connect} className="btn btn-primary px-8 py-3.5">Connect MetaMask</button>
            </div>

            <StatsStrip />

            <div className="max-w-2xl mx-auto pb-16">
              <VerifyPanel />
            </div>

            <div className="pb-16">
              <p className="eyebrow text-center mb-8">How the ledger works</p>
              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3 max-w-3xl mx-auto">
                {STEPS.map((s, i) => (
                  <Fragment key={s.title}>
                    <div className="paper flex-1 p-6 text-center rise flex flex-col items-center" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                      <span className="stamp mb-5">No.{i + 1}</span>
                      <s.icon className="w-14 h-14 text-ink mb-3" strokeWidth={2} />
                      <h3 className="display text-xl text-ink">{s.title}</h3>
                      <p className="text-[0.7rem] tracking-[0.16em] uppercase text-ink-soft mt-1.5">{s.sub}</p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex items-center justify-center text-ink py-1 sm:py-0" aria-hidden="true">
                        <Icon.arrow className="w-7 h-7 rotate-90 sm:rotate-0" strokeWidth={2.4} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        ) : (
          !chainOk ? (
            <div className="paper paper--ruled p-8 sm:p-10 text-center rise max-w-lg mx-auto mt-10">
              <p className="eyebrow mb-3">Network mismatch</p>
              <h2 className="display text-2xl font-semibold text-ink mb-3">Switch to {NETWORK_NAME}</h2>
              <p className="text-ink-soft text-sm mb-4 leading-relaxed">
                Your wallet is on a different network. This ledger is deployed on <strong>{NETWORK_NAME}</strong> (chainId {addresses.chainId}).
                Open MetaMask and switch networks to continue.
              </p>
              <div className="banner banner-warn inline-block">chainId must be {addresses.chainId}</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-5 sm:gap-7 mb-8 border-b border-rule-strong rise">
                {visibleTabs.map(({ id, icon: TabIcon }) => (
                  <button key={id} className="tab flex items-center gap-2" data-active={tab === id} onClick={() => setTab(id)}>
                    <TabIcon className="w-4 h-4" />{id}
                  </button>
                ))}
              </div>

              <div key={tab} className="panel-enter">
                {tab === "Student" && <StudentPanel account={account} provider={provider} refreshKey={refreshKey} />}
                {tab === "Honors" && <LeaderboardPanel account={account} refreshKey={refreshKey} />}
                {tab === "Verify" && <VerifyPanel />}
                {tab === "Instructor" && <InstructorPanel signer={signer} provider={provider} refreshKey={refreshKey} onMinted={refresh} />}
                {tab === "Admin" && <AdminPanel signer={signer} provider={provider} account={account} />}
              </div>
            </>
          )
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-6 pb-10 pt-4">
        <p className="eyebrow text-center opacity-70">Sealed on-chain · Polygon · {NETWORK_NAME}</p>
      </footer>

      <Toaster />
    </div>
  );
}
