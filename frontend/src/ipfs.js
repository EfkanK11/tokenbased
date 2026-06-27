const JWT = import.meta.env.VITE_PINATA_JWT;
const GATEWAY = (import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/+$/, "");

export const ipfsConfigured = () => Boolean(JWT);

export function ipfsUrl(ref) {
  if (!ref) return null;
  return GATEWAY + "/" + ref.replace(/^ipfs:\/\//, "");
}

export function looksLikeCid(ref) {
  if (!ref) return false;
  const s = ref.replace(/^ipfs:\/\//, "");
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(s);
}

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
