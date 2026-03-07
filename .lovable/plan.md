

## Plan: Chat UX Improvements & Bug Fixes

### Issues Identified

1. **Auto-logout bug**: When `useRoom` setup runs and finds no active room (`existingRoom` is null) for non-creators, it sets `chatEnded = true`, which triggers navigation to `/`. The `useEffect` at line 453 depends on `config?.password` — if the component re-renders and the setup effect re-fires (e.g., due to reconnection or visibility changes), it can re-run the room check and find no room (transient network issue or stale presence), causing an unwanted logout. Also, the cleanup at line 448-452 removes the channel, and re-mounting re-runs setup which may fail.

2. **No invite/copy button** in Room Info panel.

3. **No "new message" toast** when user is scrolled up and a new message arrives.

4. **Auto-scroll scrolls to top** on keyboard resize (line 737 unconditionally scrolls).

5. **No offline message queue** — messages fail silently when offline.

---

### Changes

#### 1. Add Invite Button to RoomInfoPanel (`src/components/RoomInfoPanel.tsx`)
- Add a new section below the header with an "Invite" button that copies the room join link (`{origin}/join/{roomId}`) to clipboard.
- Show a toast confirmation on copy.
- Use `Share` or `Copy` icon from lucide-react.

#### 2. Fix Auto-Logout (`src/hooks/use-room.ts`)
- In the `setup` function, when `existingRoom` is null for a **non-creator**, add a retry mechanism: wait 2 seconds and re-check before setting `chatEnded = true`.
- Guard against the setup effect re-firing unnecessarily by adding a `setupCompleteRef` that prevents re-running the room existence check after initial successful setup.
- In the `chatEnded` navigation effect (`src/pages/ChatRoom.tsx` line 746), only navigate if `chatEnded` is explicitly set by user action (end/leave/kick), not by transient room-check failures.

#### 3. New Message Toast When Scrolled Up (`src/pages/ChatRoom.tsx`)
- In the auto-scroll `useEffect` (line 719-726): when `timeline.length` increases and `isNearBottomRef.current` is `false`, show a floating "New message ↓" toast/button at the bottom instead of scrolling.
- Add state `newMsgCount` that increments when not near bottom and resets when user scrolls to bottom.
- The existing scroll-to-bottom FAB will show the count badge and clicking it scrolls down + resets count.

#### 4. Fix Auto-Scroll on Keyboard Resize (`src/pages/ChatRoom.tsx`)
- Line 737: Only scroll to bottom on visual viewport resize if `isNearBottomRef.current` is true, preventing unwanted jumps when reading old messages.

#### 5. Offline Message Queue (`src/hooks/use-room.ts`)
- In `sendMessage`: if the network is unavailable (navigator.onLine === false), store the message payload in a local queue array.
- Add an `online` event listener that flushes the queue when connectivity returns.
- The optimistic message stays in the UI with `pending: true` until the queue item is sent.

---

### File Changes Summary

| File | Changes |
|------|---------|
| `src/components/RoomInfoPanel.tsx` | Add invite/copy link button section |
| `src/hooks/use-room.ts` | Fix auto-logout with retry + guard; add offline queue |
| `src/pages/ChatRoom.tsx` | New message toast when scrolled up; fix keyboard scroll; pass connectivity status |

