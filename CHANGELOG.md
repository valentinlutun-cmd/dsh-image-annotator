# Changelog

## 0.1.2 (2026-10-23)

Compatibility release for **DSH Desktop ≥ 0.1.8** (verified on **0.12.1**).

- The product's `ImageLightbox` changed its markup: the preview `<img>` is no
  longer a **direct child** of the body-portal `[role=dialog]` (the
  `position:fixed`, z-index 1000 backdrop). It is now nested one level down in
  a `.stage` wrapper — `dialog > .stage > [ .mask, img.image, button.close ]`
  (`.image` still `object-fit:contain`, z-index 1000 backdrop unchanged).
  - The detector's "direct `img` child" check stopped matching, so the plugin
    silently attached to nothing: no toolbar, no zoom, **no drawing** — the
    exact symptom on 0.1.8+.
  - The detector now falls back to the first element child that contains an
    `<img>` (the stage wrapper) when there is no direct `img` child. The
    `position:fixed` + `object-fit:contain` guards are unchanged, so the
    product's other fixed dialogs (stats panels, context meter, popovers —
    which carry small/cover-fitted images) are still correctly ignored.
  - The direct-child path is kept, so the plugin still works on DSH ≤ 0.1.7.
- No other behavior changed; zoom/copy/download/draw/Save are untouched.
- Verified with a jsdom harness that boots the real `client.js` (stubbed
  `__ModuleLoader__`): the 0.12.1 stage-wrapped lightbox attaches (toolbar +
  canvas + draw row added), the 0.1.7 direct-child lightbox still attaches,
  three non-lightbox dialogs are correctly ignored, and a pointerdown/move/up
  stroke records without throwing.

## 0.1.1 (2026-09-26)

Compatibility release for **DSH Desktop 0.1.7** (dsh-market v1.66.1).

- `findDraftFor()` now reads the 0.1.7 `ctx.sessions.list` snapshot-store shape
  (`{ ids, byId, phase, projectionsBySession }`) instead of the removed
  `{ current, sessions }` shape. The current session is identified by
  `byId[id].retainedBy.mainView > 0` — the same signal the product's own
  workspace / open-in-app client code uses — and is tried first, with every
  known session id as fallback.
  - Before this fix the composer-draft lookup always returned `null` on
    0.1.7, so **Save** on a composer-draft image could not swap the draft
    attachment: the on-page `<img>` copies were re-pointed at the annotated
    bytes, but the draft that ships with the message stayed the original.
- Verified against DSH Desktop `0.1.7-rc.2`:
  - client bundle loads through the new `ClientModuleSystem`
    (`window.__ModuleLoader__.load`, `exports.apply` +
    `exports.inject: ["sessions"]`); the `sessions` service is provided
    client-side by `@deepseek-ai/dsh-api-session-controller`.
  - the product `ImageLightbox` (moved from `dsh-client-ui-conversation` to
    `@deepseek-ai/dsh-client-ui-primitives` in 0.1.7) still renders the
    markup the detector matches: body-portal `[role=dialog]`,
    `position:fixed` (z-index 1000), direct `img` child with
    `object-fit:contain`; the plugin toolbar (z-index 1002) and canvas
    (1001) stack above the product's mask.
  - Save flow end-to-end: `removeAttachment(old)` → `createDrafts(session,
    [annotatedFile])` → `addAttachments([newId])`.

No other behavior changed.

## 0.1.0 (2026-09)

Initial release — Cursor-style image lightbox for DSH chat:

- grafts onto the product's own `ImageLightbox` (structural detection, no
  DSH source touched)
- control pill: zoom in/out, wheel zoom, drag-pan when zoomed, copy to
  clipboard (PNG), download (PNG)
- drawing: red pen with Undo / Cancel / Save
- Save composites the annotated PNG: live composer drafts are swapped in
  place (ships annotated with the message); history images have every
  on-page copy pointed at the annotated bytes
