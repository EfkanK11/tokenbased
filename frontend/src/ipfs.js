// ─── Pinata IPFS helper ───────────────────────────────────────────────────────
// Uploads student evidence files to IPFS via Pinata and returns the CID, which is
// then stored on-chain as the activity reference (only the CID lives on-chain;
// the file itself stays on IPFS — see PROJECT_MASTER_PLAN.md §5.6).
//
// Setup: put a Pinata JWT in frontend/.env as VITE_PINATA_JWT (see .env.example).
// SECURITY: a JWT embedded in the frontend bundle is visible to users — use a
// Pinata key scoped to pinFileToIPFS only. A production app would proxy uploads
// through a backend so the key never reaches the browser. Acceptable for this demo.

const JWT = import.meta.env.VITE_PINATA_JWT;
const GATEWAY = (import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/+$/, "");

/** True when a Pinata JWT is configured (upload UI is enabled). */
export const ipfsConfigured = () => Boolean(JWT);

/** Build a public gateway URL for a CID (accepts a raw CID or an ipfs:// URI). */
export function ipfsUrl(ref) {
  if (!ref) return null;
  return GATEWAY + "/" + ref.replace(/^ipfs:\/\//, "");
}

/** Heuristic: does this on-chain activityRef look like an IPFS CID (v0 or v1)? */
export function looksLikeCid(ref) {
  if (!ref) return false;
  const s = ref.replace(/^ipfs:\/\//, "");
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(s);
}

/**
 * Pin a file to IPFS through Pinata.
 * @param {File} file
 * @returns {Promise<string>} the resulting CID (IpfsHash)
 */
export async function uploadToIPFS(file) {
  if (!JWT) throw new Error("Pinata JWT not configured (set VITE_PINATA_JWT)");

  const form = new FormData();
  form.append("file", file);
  form.append("pinataMetadata", JSON.stringify({ name: file.name }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pinata upload failed (${res.status}) ${txt.slice(0, 140)}`);
  }
  const json = await res.json();
  return json.IpfsHash;
}
