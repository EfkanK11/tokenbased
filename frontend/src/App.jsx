import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import addresses from "./contracts/addresses.json";
import successTokenAbi from "./contracts/SuccessToken.abi.json";
import rewardManagerAbi from "./contracts/RewardManager.abi.json";

const EXPECTED_CHAIN_ID = BigInt(addresses.chainId);
const NETWORK_NAME =
  addresses.chainId === 80002
    ? "Polygon Amoy Testnet"
    : addresses.chainId === 31337
    ? "Hardhat Local"
    : `chainId ${addresses.chainId}`;
const INSTRUCTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INSTRUCTOR_ROLE"));

// Public testnet RPCs cap eth_getLogs block range (Amoy ≈ 100 blocks).
// queryFilter over a wide range fails, so we walk it in chunks.
const LOG_CHUNK = 100;

// ─── helpers ────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}

// Query a contract event over [fromBlock, latest] in RPC-safe chunks.
async function queryLogsChunked(contract, filter, provider, fromBlock) {
  const latest = await provider.getBlockNumber();
  const start = fromBlock ?? 0;
  const all = [];
  for (let from = start; from <= latest; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, latest);
    try {
      const ev = await contract.queryFilter(filter, from, to);
      if (ev.length) all.push(...ev);
    } catch (_) {
      // skip a window the RPC rejects; keep scanning the rest
    }
  }
  return all;
}

// ─── Sub-panels ─────────────────────────────────────────────────────────────

function StudentPanel({ account, provider }) {
  const [balance, setBalance] = useState("0");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!provider || !account) return;
    setLoading(true);
    try {
      const token = new ethers.Contract(addresses.successToken, successTokenAbi, provider);
      const bal = await token.balanceOf(account);
      setBalance(ethers.formatEther(bal));

      // Fetch ActivityApproved events for this student
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, provider);
      const filter = manager.filters.ActivityApproved(null, account);
      const events = await queryLogsChunked(manager, filter, provider, addresses.deployBlock);
      const parsed = events.map((e) => ({
        instructor: shortAddr(e.args.instructor),
        amount: ethers.formatEther(e.args.amount),
        ref: e.args.activityRef,
        block: e.blockNumber,
      }));
      setHistory(parsed.reverse());
    } catch (_) {}
    setLoading(false);
  }, [provider, account]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
        <p className="text-sm text-[#9ca3af] mb-1">Your SCT Balance</p>
        <p className="text-5xl font-bold text-[#4ade80]">{balance} <span className="text-2xl text-[#9ca3af]">SCT</span></p>
        <p className="text-xs text-[#6b7280] mt-2 font-mono">{account}</p>
      </div>

      {/* Activity history */}
      <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
        <h2 className="text-base font-semibold text-white mb-4">Activity History</h2>
        {loading ? (
          <p className="text-[#9ca3af] text-sm">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-[#9ca3af] text-sm">No activities yet. Complete a campus activity to earn tokens.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#6b7280] border-b border-[#374151]">
                <th className="pb-2">Activity</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Instructor</th>
                <th className="pb-2">Block</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b border-[#1f2937]">
                  <td className="py-2 text-white">{h.ref}</td>
                  <td className="py-2 text-[#4ade80] font-semibold">+{h.amount} SCT</td>
                  <td className="py-2 text-[#9ca3af] font-mono">{h.instructor}</td>
                  <td className="py-2 text-[#6b7280]">#{h.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InstructorPanel({ signer, provider }) {
  const [student, setStudent] = useState("");
  const [amount, setAmount] = useState("10");
  const [activityRef, setActivityRef] = useState("");
  const [status, setStatus] = useState(null); // {type: 'ok'|'err'|'pending', msg}
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);

  const loadRecent = useCallback(async () => {
    if (!provider) return;
    try {
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, provider);
      const events = await queryLogsChunked(manager, manager.filters.ActivityApproved(), provider, addresses.deployBlock);
      setRecent(events.slice(-5).reverse().map((e) => ({
        student: shortAddr(e.args.student),
        amount: ethers.formatEther(e.args.amount),
        ref: e.args.activityRef,
        block: e.blockNumber,
      })));
    } catch (_) {}
  }, [provider]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const approve = async (e) => {
    e.preventDefault();
    if (!ethers.isAddress(student)) { setStatus({ type: "err", msg: "Invalid student address" }); return; }
    if (!activityRef.trim()) { setStatus({ type: "err", msg: "Activity reference required" }); return; }
    try {
      setBusy(true);
      setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.approveActivity(student, ethers.parseEther(amount), activityRef.trim());
      setStatus({ type: "pending", msg: "Mining… " + tx.hash.slice(0, 12) + "…" });
      await tx.wait();
      setStatus({ type: "ok", msg: `✅ Minted ${amount} SCT to ${shortAddr(student)}` });
      setStudent(""); setActivityRef("");
      loadRecent();
    } catch (err) {
      const msg = err?.reason || err?.shortMessage || err?.message || "Transaction failed";
      setStatus({ type: "err", msg: "❌ " + msg });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
        <h2 className="text-base font-semibold text-white mb-5">Approve Student Activity</h2>
        <form onSubmit={approve} className="space-y-4">
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1">Student wallet address</label>
            <input
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              placeholder="0x…"
              className="w-full bg-[#0f1117] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:border-[#6366f1]"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-[#9ca3af] mb-1">Amount (SCT)</label>
              <input
                type="number" min="1" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#6366f1]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#9ca3af] mb-1">Activity reference / CID</label>
              <input
                value={activityRef}
                onChange={(e) => setActivityRef(e.target.value)}
                placeholder="event-001"
                className="w-full bg-[#0f1117] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:border-[#6366f1]"
              />
            </div>
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {busy ? "Processing…" : "Approve & Mint"}
          </button>
        </form>
        {status && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "ok" ? "bg-green-900/30 text-[#4ade80]" :
            status.type === "err" ? "bg-red-900/30 text-[#f87171]" :
            "bg-[#1f2937] text-[#9ca3af]"
          }`}>{status.msg}</div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
          <h2 className="text-base font-semibold text-white mb-4">Recent Approvals</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#6b7280] border-b border-[#374151]">
                <th className="pb-2">Activity</th><th className="pb-2">Student</th>
                <th className="pb-2">Amount</th><th className="pb-2">Block</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i} className="border-b border-[#1f2937]">
                  <td className="py-2 text-white">{r.ref}</td>
                  <td className="py-2 font-mono text-[#9ca3af]">{r.student}</td>
                  <td className="py-2 text-[#4ade80] font-semibold">{r.amount} SCT</td>
                  <td className="py-2 text-[#6b7280]">#{r.block}</td>
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
    if (!ethers.isAddress(target) || !provider) return;
    try {
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, provider);
      const has = await manager.hasRole(INSTRUCTOR_ROLE, target);
      setIsInstructor(has);
    } catch (_) { setIsInstructor(null); }
  };

  const grantRole = async () => {
    if (!ethers.isAddress(target)) { setStatus({ type: "err", msg: "Invalid address" }); return; }
    try {
      setBusy(true); setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.grantRole(INSTRUCTOR_ROLE, target);
      await tx.wait();
      setStatus({ type: "ok", msg: `✅ INSTRUCTOR_ROLE granted to ${shortAddr(target)}` });
      setIsInstructor(true);
    } catch (err) {
      setStatus({ type: "err", msg: "❌ " + (err?.reason || err?.shortMessage || err?.message) });
    } finally { setBusy(false); }
  };

  const revokeRole = async () => {
    if (!ethers.isAddress(target)) { setStatus({ type: "err", msg: "Invalid address" }); return; }
    try {
      setBusy(true); setStatus({ type: "pending", msg: "Confirm in MetaMask…" });
      const manager = new ethers.Contract(addresses.rewardManager, rewardManagerAbi, signer);
      const tx = await manager.revokeRole(INSTRUCTOR_ROLE, target);
      await tx.wait();
      setStatus({ type: "ok", msg: `✅ INSTRUCTOR_ROLE revoked from ${shortAddr(target)}` });
      setIsInstructor(false);
    } catch (err) {
      setStatus({ type: "err", msg: "❌ " + (err?.reason || err?.shortMessage || err?.message) });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
        <h2 className="text-base font-semibold text-white mb-1">System Information</h2>
        <p className="text-xs text-[#6b7280] mb-5">Contract addresses on {NETWORK_NAME} (chainId {addresses.chainId})</p>
        <div className="space-y-3">
          {[
            { label: "SuccessToken (SCT)", addr: addresses.successToken },
            { label: "RewardManager", addr: addresses.rewardManager },
            { label: "Your account (Admin)", addr: account },
          ].map(({ label, addr }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-[#1f2937]">
              <span className="text-xs text-[#9ca3af]">{label}</span>
              <span className="text-xs font-mono text-white">{addr}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-[#374151] p-6">
        <h2 className="text-base font-semibold text-white mb-5">Instructor Role Management</h2>
        <div className="flex gap-3 mb-4">
          <input
            value={target}
            onChange={(e) => { setTarget(e.target.value); setIsInstructor(null); }}
            placeholder="0x… wallet address"
            className="flex-1 bg-[#0f1117] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:border-[#6366f1]"
          />
          <button onClick={checkRole} className="px-4 py-3 rounded-xl border border-[#374151] text-sm text-[#9ca3af] hover:text-white hover:border-[#6366f1] transition-colors">
            Check
          </button>
        </div>
        {isInstructor !== null && (
          <p className={`text-sm mb-4 ${isInstructor ? "text-[#4ade80]" : "text-[#f87171]"}`}>
            {isInstructor ? "✅ Has INSTRUCTOR_ROLE" : "❌ Does NOT have INSTRUCTOR_ROLE"}
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={grantRole} disabled={busy}
            className="flex-1 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
            Grant Role
          </button>
          <button onClick={revokeRole} disabled={busy}
            className="flex-1 bg-transparent border border-[#f87171] hover:bg-red-900/20 disabled:opacity-50 text-[#f87171] font-semibold py-3 rounded-xl transition-colors text-sm">
            Revoke Role
          </button>
        </div>
        {status && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "ok" ? "bg-green-900/30 text-[#4ade80]" :
            status.type === "err" ? "bg-red-900/30 text-[#f87171]" :
            "bg-[#1f2937] text-[#9ca3af]"
          }`}>{status.msg}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
const TABS = ["Student", "Instructor", "Admin"];

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainOk, setChainOk] = useState(true);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [tab, setTab] = useState("Student");

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

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      {/* Header */}
      <header className="border-b border-[#374151] bg-[#0f1117]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="font-bold text-white leading-none">Success Token</p>
              <p className="text-xs text-[#6b7280]">Token-Based Success Award System</p>
            </div>
          </div>
          {account ? (
            <div className="flex items-center gap-2 bg-[#1f2937] rounded-xl px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
              <span className="text-xs font-mono text-[#9ca3af]">{shortAddr(account)}</span>
            </div>
          ) : (
            <button onClick={connect}
              className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {!account ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-6">🏛️</p>
            <h1 className="text-2xl font-bold text-white mb-3">Campus Blockchain Rewards</h1>
            <p className="text-[#9ca3af] mb-8 max-w-md mx-auto">Connect your MetaMask wallet to earn and manage Success Tokens for campus activities.</p>
            <button onClick={connect}
              className="bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold px-8 py-3 rounded-xl transition-colors">
              Connect MetaMask
            </button>
          </div>
        ) : (
          <>
            {!chainOk && (
              <div className="mb-6 rounded-xl bg-yellow-900/30 border border-yellow-700/50 px-4 py-3 text-sm text-[#fbbf24]">
                ⚠️ Wrong network — switch MetaMask to <strong>{NETWORK_NAME}</strong> (chainId {addresses.chainId})
              </div>
            )}
            {/* Tab bar */}
            <div className="flex bg-[#111827] rounded-xl p-1 mb-6 border border-[#374151]">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    tab === t ? "bg-[#6366f1] text-white" : "text-[#9ca3af] hover:text-white"
                  }`}>
                  {t === "Student" ? "🎓 " : t === "Instructor" ? "✏️ " : "⚙️ "}{t}
                </button>
              ))}
            </div>

            {tab === "Student" && <StudentPanel account={account} provider={provider} />}
            {tab === "Instructor" && <InstructorPanel signer={signer} provider={provider} />}
            {tab === "Admin" && <AdminPanel signer={signer} provider={provider} account={account} />}
          </>
        )}
      </main>
    </div>
  );
}
