

# Encrypted Ephemeral Realtime Messaging PWA — MVP Plan

## Overview
A mobile-only PWA for anonymous, end-to-end encrypted ephemeral messaging. Messages are encrypted client-side using AES-256-GCM, and the server only ever sees encrypted blobs. When a chat ends, everything is permanently deleted.

Built with React + Vite + Tailwind + Framer Motion on Lovable Cloud (Supabase).

---

## Phase 1: Foundation & UI Shell

### Mobile-Only Enforcement
- Full-screen block page for screens wider than 768px or desktop user agents
- No override possible

### Dark Liquid Glass UI
- Dark-only theme with frosted glass panels, backdrop blur, soft glow accents
- iOS-inspired rounded components and spring animations via Framer Motion
- Pages: Home/Join, Create Room, Chat Room

### PWA Setup
- Service worker, manifest, installable prompt
- Disable text selection, context menu, drag, long press via CSS/JS

---

## Phase 2: Encryption Engine (Client-Side Only)

### Crypto Module
- AES-256-GCM encryption/decryption using Web Crypto API
- PBKDF2 key derivation (100k iterations, SHA-256) from room password + roomID salt
- Random 96-bit IV per message
- Room key stored only in localStorage, never sent to server

### Room Key Sharing
- Manual password entry on join
- URL fragment method (`/room/roomId#key=ROOM_KEY`) — fragment never hits the server

---

## Phase 3: Database & Room Management

### Supabase Tables
- **rooms**: id, room_id, created_at, active, user_count
- **messages**: id, room_id, encrypted_blob, iv, created_at, is_deleted, version, is_pinned
- **presence**: id, room_id, username, avatar_color, is_active, last_seen

### Room Creation & Joining
- Create room → generate room ID, derive key from password
- Join room → enter room ID + password (or use link with fragment key)
- Max 10 users enforced server-side
- Duplicate username blocked via presence check

---

## Phase 4: Realtime Messaging

### Supabase Realtime Channels
- Channel per room (`room:ROOM_ID`)
- Events: message:new, message:edit, message:delete, presence:join/leave/typing, chat:end

### Message Flow
- Compose → encrypt client-side → store encrypted blob in Supabase → broadcast via realtime
- Receive → get encrypted blob → decrypt client-side → render
- Edit within 5 minutes: re-encrypt, increment version
- Delete for everyone: remove blob from DB, broadcast delete
- Delete for me: hide locally only

### Presence & Typing
- Track active users with Supabase Realtime presence
- Typing indicator broadcast (stops when input cleared)
- Visibility API: mark inactive when app hidden, restore when visible

---

## Phase 5: Chat End & Permanent Deletion

### End Chat Flow
- Any user can press "End Chat"
- Broadcasts `chat:end` to all participants
- Edge function deletes all messages, presence records, and the room entry
- All clients clear localStorage keys and redirect to home
- Completely unrecoverable

---

## Phase 6 (Post-MVP): Advanced Features

These will be added after the core is working:

- **Encrypted media**: Client-side encryption of images/files, upload to private Supabase storage bucket, 2-hour auto-delete after first view via edge function
- **Read receipts**: Intersection Observer for viewport detection, grey/blue double ticks
- **Reactions**: Encrypted emoji reactions with realtime sync
- **Pin messages**: One pinned message at a time, scroll-to-original on tap
- **PWA security hardening**: Blur on app switch, devtools detection, suspicious resize notification
- **Haptic feedback** on send (where supported)
- **Virtualized message list** for performance
- **Pull-to-refresh** gesture

