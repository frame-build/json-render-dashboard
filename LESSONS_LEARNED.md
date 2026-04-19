# Lessons Learned

## 2026-04-15 — Autodesk Viewer click/selection mismatch after layout changes

### Symptom
- Clicking an element in Autodesk Viewer sometimes selected a different element in another area of the model.

### Root cause
- Viewer canvas bounds became stale after dynamic layout changes (streamed chat content, panel resizing, responsive grid shifts).
- Autodesk Viewer hit-testing depends on up-to-date canvas size; without `viewer.resize()`, pointer-to-model mapping can drift.

### Fix
- Call `viewer.resize()` after model load.
- Add a `ResizeObserver` on the viewer container to call `viewer.resize()` on container size changes.
- Also trigger `viewer.resize()` on window resize.

### Implementation note
- `components/autodesk-viewer.tsx` now keeps viewer sizing synchronized with container/layout updates.
- This preserves natural viewer navigation/selection while keeping selection sync to the wall details panel reliable.
