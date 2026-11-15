# Changelog

## 0.1.3 (2026-11-15)

Compatibility release for **DSH Desktop 0.14.0** (Harness core **0.2.2-rc.1**,
Cordis Core 4.1.0 / Loader 1.1.0). Verified against the live 0.2.2-rc.1 profile:
`dsh-client-ui-primitives` `ImageLightbox` is still
`div.backdrop[role=dialog]` (fixed, z-index 1000) `> div.stage > [ div.mask, img.image
(object-fit: contain), button.close ]`, so the DOM detector is unchanged and still
matches.

- **The plugin silently unmounted: fixed.** Its own double-mount guard in
  `cordis.patch.yml` compared `entry.options.id !== 'dsh-image-annotator'`, but
  Cordis 4.1 namespaces entry ids (`include:dsh-image-annotator`), so the row
  matched **itself** and set `disabled: true` — Host state after the update was
  `enabled: false`, `fiberPhase: null` while the bundle itself stayed enabled.
  Result: no toolbar, no zoom, no drawing.
  - The guard now also ignores ids ending in `:dsh-image-annotator`, and mounts
    when `ctx.loader.entries()` is missing or shaped differently instead of
    treating an unknown loader face as "someone else owns it".
  - A genuine second owner (the plugin listed in the profile's own bundle set)
    still wins, so the duplicate-factory boot crash the guard exists for stays
    guarded.
- **Composer-draft lookup adapted.** The client `sessions` face no longer exposes
  the `sessions.list` snapshot store (`{ ids, byId, retainedBy.mainView }`), and
  `SessionRetainInfo.retainedBy` is keyed by reference source
  (`controllerOperation`, `gateway`) with no `mainView` signal, so the old
  "which session is in the main view" lookup could never resolve on 0.2.2.
  `findDraftFor()` now probes candidate ids from a `candidateSessionIds()` helper:
  the 0.1.x/0.2.1 snapshot path is kept, and on newer hosts ids come from the
  route plus any `[data-session-id]` element, each probed through
  `sessions.scope(id)`. Draft swapping itself is untouched —
  `conversation.input.for(actx)`, `actions.addAttachments/removeAttachment`,
  `createDrafts`, `resolveDraftAttachments` and `releaseDraftAttachment(s)` all
  still exist in 0.2.2-rc.1.
- When no session id can be discovered, **Save** falls back to the existing
  on-page behaviour (every `<img>` copy of that image is re-pointed at the
  annotated PNG); the draft rail keeps the original until it is re-added.
- Zoom, wheel zoom, pan, drag-to-draw, Undo / Cancel, copy and download are
  unchanged; the product lightbox still has no zoom or download of its own.

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
