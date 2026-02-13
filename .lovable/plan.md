

# Fix and Stability Update Plan

## Overview
This plan addresses random message disappearance, implements proper message/room lifecycle rules, fixes z-index issues with context menus, and stabilizes realtime subscriptions.

## Changes

### 1. Database Schema Updates

**`rooms` table** -- Add `last_message_at` column:
- `last_message_at TIMESTAMPTZ DEFAULT now()` -- tracks when the last message was sent
- Updated whenever a message is sent or edited

**`messages` table** -- Add `expires_at` column:
- `expires_at TIMESTAMPTZ` -- computed as `created_at + 2 hours`
- Default value: `now() + interval '2 hours'`
- Used by the cron cleanup to delete expired messages individually

### 2. New Edge Function: `cleanup-expired-messages`

Runs every 1 minute (via pg_cron). Handles two jobs:
- **Expired messages**: Deletes individual messages where `expires_at < now()`. Also deletes associated reactions, read_receipts, and storage media for those messages.
- **Inactive rooms**: Deletes rooms where `last_message_at < now() - interval '2 hours'` AND no active presence exists. Deletes all related data (messages, reactions, read_receipts, media_views, presence, storage files).

### 3. Update `cleanup-empty-rooms` Edge Function

Replace current "empty for 10 minutes" logic with the new "no message activity for 2 hours" logic. The function will:
- Check `last_message_at` instead of `empty_since`
- Only delete rooms where `now() - last_message_at > 2 hours`
- Double-check active presence before deletion (never delete while users are chatting)

### 4. Update `use-room.ts` -- Message State Stability

**Fix random disappearance bugs:**
- In the initial message fetch, never overwrite state if the fetch returns empty AND messages already exist locally (guard against race conditions)
- In realtime INSERT handler, use a merge strategy: `setMessages(prev => prev.some(m => m.id === newId) ? prev : [...prev, newMsg])`  (already done, but verify)
- In realtime UPDATE handler for `is_deleted`, only remove from state -- never replace the entire array
- In realtime DELETE handler, filter by ID only -- never reset state

**Update `sendMessage`** to also update `rooms.last_message_at`:
- After inserting a message, update the room's `last_message_at` to `now()`

**Fix `deleteMessage`** to verify ownership:
- Before deleting, check that the message's `sender_name === config.username`
- Only delete if ownership is confirmed

**Fix `editMessage`:**
- Already checks `msg.isOwn` -- no change needed
- After editing, also update `rooms.last_message_at`

### 5. Update `end-chat` Edge Function

No major changes needed -- already correctly deletes everything immediately. Will add broadcast cleanup confirmation.

### 6. Fix Z-Index Issues in ChatRoom.tsx

**Context menu** (currently `z-10`): Change to `z-50` to ensure it renders above message bubbles.

**Reaction picker** (currently `z-20`): Change to `z-50`.

**Message container**: Ensure no parent has `overflow: hidden` that clips the popups. The scroll container already uses `overflow-y-auto` which is fine for vertical scroll but can clip horizontal popups -- add `overflow-x: visible` where needed, or use a portal approach for menus.

### 7. Set Up pg_cron Schedule

Run SQL (via insert tool, not migration) to schedule the cleanup function every minute:
```text
cron.schedule('cleanup-expired-messages', '* * * * *', ...)
```

And schedule room cleanup every 5 minutes:
```text
cron.schedule('cleanup-inactive-rooms', '*/5 * * * *', ...)
```

---

## Technical Details

### File Changes Summary

| File | Action |
|------|--------|
| Migration SQL | Add `last_message_at` to rooms, `expires_at` to messages |
| `supabase/functions/cleanup-expired-messages/index.ts` | New -- deletes expired messages every minute |
| `supabase/functions/cleanup-empty-rooms/index.ts` | Update -- use `last_message_at` logic instead of `empty_since` |
| `supabase/config.toml` | Add `cleanup-expired-messages` function config |
| `src/hooks/use-room.ts` | Fix state management, add ownership checks, update `last_message_at` on send/edit |
| `src/pages/ChatRoom.tsx` | Fix z-index on context menu and reaction picker |
| pg_cron SQL (insert tool) | Schedule both cleanup functions |

### Edge Cases Handled

- **User refresh mid-delete**: Messages are deleted server-side; client reloads from DB
- **Two users delete same message**: Idempotent DELETE operations; realtime broadcasts removal to all
- **Message expires while viewing**: Realtime DELETE event removes it from UI gracefully
- **Room deletion during typing**: `chat:end` broadcast forces redirect
- **Slow network reconnection**: Merge strategy prevents empty fetch from wiping state
- **Multiple rapid edits**: Each edit re-encrypts and updates; last write wins with version increment

