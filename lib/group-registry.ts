const STORAGE_KEY = 'encopa-known-groups-v1';
const GROUP_ID = /^[a-f0-9-]{36}$/;

export type KnownGroup = { id: string; lastOpenedAt: number };

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

export function knownGroups(): KnownGroup[] {
  const target = storage();
  if (!target) return [];
  try {
    const value: unknown = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is KnownGroup => !!item && typeof item === 'object' && GROUP_ID.test(String((item as KnownGroup).id)) && Number.isFinite(Number((item as KnownGroup).lastOpenedAt)))
      .map(item => ({ id: item.id, lastOpenedAt: Number(item.lastOpenedAt) }))
      .sort((a,b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0,20);
  } catch { return []; }
}

export function rememberGroup(id: string) {
  if (!GROUP_ID.test(id)) return;
  const target = storage();
  if (!target) return;
  const next = [{id,lastOpenedAt:Date.now()},...knownGroups().filter(item=>item.id!==id)].slice(0,20);
  try {
    target.setItem(STORAGE_KEY,JSON.stringify(next));
    window.dispatchEvent(new Event('encopa-groups-changed'));
  } catch {}
}

export function forgetGroup(id: string, notify = true) {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY,JSON.stringify(knownGroups().filter(item=>item.id!==id)));
    if (notify) window.dispatchEvent(new Event('encopa-groups-changed'));
  } catch {}
}
