const KEY = "laurel.labels";
const subs = new Set();
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch (_) {
    cache = {};
  }
  return cache;
}

function notify() {
  subs.forEach((fn) => fn());
}

export function nameFor(addr) {
  if (!addr) return "";
  return load()[addr.toLowerCase()] || "";
}

export function setLabel(addr, name) {
  const m = load();
  const k = addr.toLowerCase();
  if (name && name.trim()) m[k] = name.trim();
  else delete m[k];
  localStorage.setItem(KEY, JSON.stringify(m));
  cache = m;
  notify();
}

export function allLabels() {
  return Object.entries(load());
}

export function subscribeLabels(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
