

# Fix: Header Must Not Move When Keyboard Opens

## Problem
When the mobile keyboard opens, the entire page scrolls — header shifts up, layout jumps. This happens because:
- The outer container uses `position: relative` instead of `position: fixed`
- `html` and `body` are not locked from scrolling (`overflow: hidden` is missing)
- The browser treats the whole document as scrollable, so opening the keyboard pushes everything up

## Changes

### 1. Lock Body Scroll in Global CSS (`src/index.css`)

Add `overflow: hidden` and `height: 100%` to `html, body` so the document itself can never scroll:

```css
html, body {
  height: 100%;
  overflow: hidden;
  position: fixed;
  width: 100%;
}
```

This is the single most important fix — it prevents the browser from scrolling the document when the keyboard opens.

### 2. Fix App Container in ChatRoom (`src/pages/ChatRoom.tsx`)

Change the outer wrapper from:
```
<div className="relative" style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
```
To:
```
<div className="fixed inset-0">
```

Using `position: fixed; inset: 0` makes the container completely independent of viewport resizing. The `--vh` variable is no longer needed for this container.

### 3. Add `-webkit-overflow-scrolling: touch` to Chat Body

The scrollable message area already uses `position: fixed` — just ensure it has smooth touch scrolling and `overscroll-behavior: contain` to prevent scroll chaining to the body.

### Summary of Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Add `html, body { height: 100%; overflow: hidden; position: fixed; width: 100%; }` |
| `src/pages/ChatRoom.tsx` | Change outer container from `relative` with `--vh` height to `fixed inset-0` |

### What Is NOT Changed
- Encryption, room logic, message lifecycle, realtime logic — untouched
- Header, input bar, and chat body already use `position: fixed` — no changes needed there
- The `--vh` viewport listener remains for any other components that may use it

