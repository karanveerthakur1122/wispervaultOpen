/** Per-room notification & sound preferences with DND schedule support. */

export type SoundMode = "volume" | "vibrate" | "mute";

export interface RoomPrefs {
  notifications: boolean;
  soundMode: SoundMode;
  dndEnabled: boolean;
  dndStart: string; // "HH:MM" 24h
  dndEnd: string;   // "HH:MM" 24h
}

const DEFAULTS: RoomPrefs = {
  notifications: true,
  soundMode: "volume",
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "07:00",
};

function storageKey(roomId: string) {
  return `room_prefs_${roomId}`;
}

export function getRoomPrefs(roomId: string): RoomPrefs {
  try {
    const raw = localStorage.getItem(storageKey(roomId));
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setRoomPref<K extends keyof RoomPrefs>(roomId: string, key: K, value: RoomPrefs[K]) {
  const prefs = getRoomPrefs(roomId);
  prefs[key] = value;
  localStorage.setItem(storageKey(roomId), JSON.stringify(prefs));
}

/** Returns true if the current time falls within the DND window. */
function isInDndWindow(start: string, end: string): boolean {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  // Overnight range (e.g. 22:00 → 07:00)
  if (startMins > endMins) {
    return mins >= startMins || mins < endMins;
  }
  // Same-day range (e.g. 13:00 → 15:00)
  return mins >= startMins && mins < endMins;
}

export interface AlertDecision {
  showNotification: boolean;
  playSound: boolean;
  vibrate: boolean;
}

/** Decide what alerts to fire based on the room's saved preferences. */
export function getAlertDecision(roomId: string): AlertDecision {
  const prefs = getRoomPrefs(roomId);

  // DND overrides everything
  if (prefs.dndEnabled && isInDndWindow(prefs.dndStart, prefs.dndEnd)) {
    return { showNotification: false, playSound: false, vibrate: false };
  }

  return {
    showNotification: prefs.notifications,
    playSound: prefs.soundMode === "volume",
    vibrate: prefs.soundMode === "vibrate",
  };
}
