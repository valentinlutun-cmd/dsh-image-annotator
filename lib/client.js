/**
 * dsh-imglight — client half.
 *
 * A Cursor-style clone of the chat image preview, grafted onto the product's
 * own ImageLightbox (the body-portal `[role=dialog]` with a direct `img`
 * child that opens when any chat/composer image is clicked):
 *
 *   - the product lightbox already brings: the image, the X close control
 *     (top-right), backdrop/Escape close and focus restore.
 *
 *   this plugin adds, on top of that exact dialog:
 *
 *   1. a control pill (bottom center): zoom out, zoom in, copy, download.
 *      Wheel over the image zooms; when zoomed in, drag pans.
 *   2. drawing: clicking the image enters draw mode and a row of
 *      Undo / Cancel / Save appears (top-right, like Cursor). A red pen
 *      draws on the image.
 *        - Undo   drops the last stroke
 *        - Cancel exits draw mode, keeps the original image
 *        - Save   composites the annotated PNG:
 *            * if the image is a live composer draft (matched by its
 *              object-URL preview) the draft attachment is swapped in
 *              place, so it ships annotated with the message;
 *            * otherwise every on-page copy of that image (message
 *              thumbnail + preview) is pointed at the annotated bytes.
 *          Then the preview closes.
 *
 * Pure DOM (no JSX, no React needed): one MutationObserver on document.body
 * finds the product lightbox, augments it, and tears everything down again
 * when the dialog closes.
 */
window.__ModuleLoader__.load({
	id: "dsh-imglight",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ---------------------------------------------------------------- CSS
		const CSS_TAG = "@deepseek-ai/dsh-imglight/client.css";
		const CSS = `
.igl-toolbar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:1002;display:flex;align-items:center;gap:4px;padding:6px 8px;border-radius:12px;background:var(--dsw-specific-input-major,#1c1c1f);border:.5px solid var(--dsw-alias-border-l2-darkmode-thin,#333);box-shadow:var(--dsw-shadow-lv3,0 8px 24px #0008);font-family:var(--dsh-font-sans,-apple-system,Segoe UI,Roboto,sans-serif)}
.igl-btn{display:grid;place-items:center;width:34px;height:34px;border:none;border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary,#ddd);cursor:pointer;padding:0}
.igl-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.igl-btn:disabled{opacity:.35;cursor:default}
.igl-btn svg{width:18px;height:18px;display:block}
.igl-sep{width:1px;height:20px;background:var(--dsw-alias-border-l2-darkmode-thin,#3a3a40);margin:0 3px}
.igl-zoom{min-width:44px;font-size:12px;color:var(--dsw-alias-label-secondary,#999);text-align:center}
.igl-drawrow{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:1002;display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:12px;background:var(--dsw-specific-input-major,#1c1c1f);border:.5px solid var(--dsw-alias-border-l2-darkmode-thin,#333);box-shadow:var(--dsw-shadow-lv3,0 8px 24px #0008);font-family:var(--dsh-font-sans,-apple-system,Segoe UI,Roboto,sans-serif);font-size:13px}
.igl-drawrow button{border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#ddd);font-size:13px;padding:5px 12px;cursor:pointer}
.igl-drawrow button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.igl-drawrow button.igl-save{background:#3d6df6;color:#fff;font-weight:600}
.igl-drawrow button.igl-save:hover{background:#4d7dff}
.igl-canvas{position:fixed;inset:0;z-index:1001;touch-action:none;pointer-events:none}
.igl-canvas.igl-live{pointer-events:none}
`;
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-imglight";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// --------------------------------------------------------------- icons
		const icon = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
		const ICONS = {
			zoomIn: icon(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/><path d="M8 11h6"/><path d="M11 8v6"/>`),
			zoomOut: icon(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/><path d="M8 11h6"/>`),
			copy: icon(`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>`),
			download: icon(`<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>`)
		};

		// ------------------------------------------------------------ helpers
		/** Filename for download/copy: the lightbox alt is the product's file name. */
		function baseNameOf(img) {
			const alt = (img.getAttribute("alt") || "").trim();
			const clean = alt.replace(/[\\/:*?"<>|]+/g, "_").replace(/\.\w+$/, "");
			return clean.length > 0 ? clean : "image";
		}
		/** The PNG bytes of one (already annotated or original) image, cross-origin safe for blob:/data:. */
		async function pngOf(img, draw) {
			try {
				const res = await fetch(img.currentSrc || img.src);
				const blob = await res.blob();
				if (blob.type === "image/png" && !draw) return blob;
			} catch { /* fall through to canvas */ }
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext("2d");
			ctx.drawImage(img, 0, 0);
			if (draw) draw(ctx);
			return new Promise((resolve, reject) => {
				canvas.toBlob((b) => (b === null ? reject(new Error("png export failed")) : resolve(b)), "image/png");
			});
		}
		function tempDownloadUrl(src, name) {
			if (/^(blob:|data:)/.test(src)) {
				const a = document.createElement("a");
				a.href = src;
				a.download = name;
				document.body.appendChild(a);
				a.click();
				a.remove();
				return;
			}
			fetch(src).then((r) => r.blob()).then((blob) => {
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = name;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 10_000);
			}).catch(() => {
				window.open(src, "_blank", "noopener");
			});
		}

		// -------------------------------------------------------- session scan
		/**
		 * Find the live composer draft whose preview URL is this lightbox image.
		 * Tries the current session first, then any other listed session.
		 * @returns {null | {sessionId: string, conversation: object, shell: object, draft: object}}
		 */
		function findDraftFor(ctx, src) {
			try {
				const snap = ctx.sessions.list.getSnapshot();
				const ids = [];
				if (snap && typeof snap.current === "string") ids.push(snap.current);
				const list = snap && (Array.isArray(snap.sessions) ? snap.sessions : Array.isArray(snap.items) ? snap.items : null);
				if (list) for (const item of list) {
					const id = typeof item === "string" ? item : item && typeof item.sessionId === "string" ? item.sessionId : null;
					if (id !== null && !ids.includes(id)) ids.push(id);
				}
				for (const id of ids) {
					const actx = ctx.sessions.scope(id);
					if (actx === void 0) continue;
					const conversation = actx.get("conversation");
					if (conversation === void 0) continue;
					const shell = conversation.input.for(actx);
					if (shell === void 0) continue;
					const snapshot = typeof shell.state === "object" && shell.state !== null && typeof shell.state.getSnapshot === "function" ? shell.state.getSnapshot() : shell.snapshot;
					const attachmentIds = (snapshot && Array.isArray(snapshot.attachmentIds)) ? snapshot.attachmentIds : [];
					if (attachmentIds.length === 0) continue;
					const drafts = conversation.resolveDraftAttachments(attachmentIds);
					const draft = drafts.find((d) => d.kind === "image" && d.previewUrl === src);
					if (draft !== void 0) return { sessionId: id, conversation, shell, draft };
				}
			} catch { /* no draft — history image */ }
			return null;
		}

		// ------------------------------------------------------ per-dialog ctrl
		/**
		 * Augment one product lightbox.
		 * @param {object} ctx - plugin client context (sessions injected).
		 * @param {HTMLElement} dialog - the product lightbox dialog element.
		 * @param {HTMLImageElement} img - its image element.
		 * @returns {() => void} disposer
		 */
		function attachLightbox(ctx, dialog, img) {
			dialog.__igl = true;
			let disposed = false;
			let zoom = 1;
			let panX = 0;
			let panY = 0;
			let drawing = false;
			let strokes = []; // {pts: [{x,y}...], w} — image natural pixels
			let live = null; // in-flight stroke
			let panning = null;

			// ------------------------------------------------------ built DOM
			const toolbar = document.createElement("div");
			toolbar.className = "igl-toolbar";
			const mkBtn = (key, label, fn) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = "igl-btn";
				b.title = label;
				b.setAttribute("aria-label", label);
				b.innerHTML = ICONS[key];
				b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
				toolbar.appendChild(b);
				return b;
			};
			const btnOut = mkBtn("zoomOut", "Zoom out", () => setZoom(zoom / 1.25));
			const btnIn = mkBtn("zoomIn", "Zoom in", () => setZoom(zoom * 1.25));
			const zoomLabel = document.createElement("span");
			zoomLabel.className = "igl-zoom";
			toolbar.appendChild(zoomLabel);
			const sep = document.createElement("span");
			sep.className = "igl-sep";
			toolbar.appendChild(sep);
			const btnCopy = mkBtn("copy", "Copy image", copyImage);
			const btnDownload = mkBtn("download", "Download image", () => tempDownloadUrl(img.currentSrc || img.src, baseNameOf(img) + ".png"));

			const drawRow = document.createElement("div");
			drawRow.className = "igl-drawrow";
			drawRow.style.display = "none";
			const mkRowBtn = (label, cls) => {
				const b = document.createElement("button");
				b.type = "button";
				if (cls) b.className = cls;
				b.textContent = label;
				drawRow.appendChild(b);
				return b;
			};
			const rowUndo = mkRowBtn("Undo");
			const rowCancel = mkRowBtn("Cancel");
			const rowSave = mkRowBtn("Save", "igl-save");

			const canvas = document.createElement("canvas");
			canvas.className = "igl-canvas";
			canvas.style.display = "none";
			const cctx = canvas.getContext("2d");

			dialog.appendChild(toolbar);
			dialog.appendChild(drawRow);
			dialog.appendChild(canvas);

			// ---------------------------------------------------------- zoom
			function applyTransform() {
				img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
				btnIn.disabled = zoom >= 8;
				btnOut.disabled = zoom <= 0.5;
				zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
				redraw();
			}
			function setZoom(next) {
				zoom = Math.min(8, Math.max(0.5, next));
				applyTransform();
			}

			// -------------------------------------------------------- drawing
			function sizeCanvas() {
				const dpr = window.devicePixelRatio || 1;
				canvas.width = Math.round(window.innerWidth * dpr);
				canvas.height = Math.round(window.innerHeight * dpr);
				canvas.style.width = window.innerWidth + "px";
				canvas.style.height = window.innerHeight + "px";
			}
			function toNatural(clientX, clientY) {
				const rect = img.getBoundingClientRect();
				return {
					x: (clientX - rect.left) * (img.naturalWidth / rect.width),
					y: (clientY - rect.top) * (img.naturalHeight / rect.height)
				};
			}
			function redraw() {
				if (canvas.style.display === "none") return;
				const dpr = window.devicePixelRatio || 1;
				const rect = img.getBoundingClientRect();
				const scale = rect.width / img.naturalWidth; // display px per natural px
				cctx.setTransform(1, 0, 0, 1, 0, 0);
				cctx.clearRect(0, 0, canvas.width, canvas.height);
				if (scale === 0) return;
				cctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * rect.left, dpr * rect.top);
				cctx.strokeStyle = "#ff0000";
				cctx.lineCap = "round";
				cctx.lineJoin = "round";
				for (const s of strokes) paintStroke(s);
				if (live !== null) paintStroke(live);
			}
			function paintStroke(s) {
				if (s.pts.length === 0) return;
				cctx.lineWidth = s.w;
				cctx.beginPath();
				cctx.moveTo(s.pts[0].x, s.pts[0].y);
				for (let i = 1; i < s.pts.length; i++) cctx.lineTo(s.pts[i].x, s.pts[i].y);
				cctx.stroke();
			}
			function enterDraw() {
				drawing = true;
				sizeCanvas();
				canvas.style.display = "block";
				canvas.classList.add("igl-live");
				drawRow.style.display = "flex";
				img.style.cursor = "crosshair";
				redraw();
			}
			function exitDraw() {
				drawing = false;
				strokes = [];
				live = null;
				canvas.style.display = "none";
				canvas.classList.remove("igl-live");
				drawRow.style.display = "none";
				img.style.cursor = "zoom-in";
			}
			function undo() {
				strokes.pop();
				redraw();
			}
			function composite(draw) {
				const out = document.createElement("canvas");
				out.width = img.naturalWidth;
				out.height = img.naturalHeight;
				const octx = out.getContext("2d");
				octx.drawImage(img, 0, 0);
				octx.strokeStyle = "#ff0000";
				octx.lineCap = "round";
				octx.lineJoin = "round";
				for (const s of strokes) {
					octx.lineWidth = s.w;
					octx.beginPath();
					octx.moveTo(s.pts[0].x, s.pts[0].y);
					for (let i = 1; i < s.pts.length; i++) octx.lineTo(s.pts[i].x, s.pts[i].y);
					octx.stroke();
				}
				return new Promise((resolve, reject) => {
					out.toBlob((b) => (b === null ? reject(new Error("composite failed")) : resolve(b)), "image/png");
				});
			}
			function save() {
				const withStrokes = strokes.length > 0;
				const finish = (blob) => {
					const name = baseNameOf(img) + (withStrokes ? "-annotated" : "") + ".png";
					const file = new File([blob], name, { type: "image/png" });
					const url = URL.createObjectURL(blob);
					const hit = findDraftFor(ctx, img.currentSrc || img.src);
					if (hit !== null) {
						try {
							// Product rail semantics: remove the old draft, register the annotated one in its place.
							if (hit.shell.actions.removeAttachment(hit.draft.id)) hit.conversation.releaseDraftAttachment(hit.draft.id);
							const drafts = hit.conversation.createDrafts(hit.sessionId, [file]);
							if (!hit.shell.actions.addAttachments(drafts.map((d) => d.id))) hit.conversation.releaseDraftAttachments(drafts);
						} catch { /* keep the on-page swap below */ }
					} else {
						// History image: point every on-page copy at the annotated bytes (this session's view).
						const src = img.currentSrc || img.src;
						for (const el of document.querySelectorAll("img")) {
							if ((el.currentSrc || el.src) === src) el.src = url;
						}
					}
					closePreview();
				};
				if (!withStrokes) {
					pngOf(img, null).then(finish).catch(() => closePreview());
				} else {
					composite().then(finish).catch(() => closePreview());
				}
			}
			function copyImage() {
				pngOf(img, live !== null || strokes.length > 0 ? (c) => {
					c.strokeStyle = "#ff0000";
					c.lineCap = "round";
					c.lineJoin = "round";
					for (const s of [...strokes, ...(live !== null ? [live] : [])]) {
						c.lineWidth = s.w;
						c.beginPath();
						c.moveTo(s.pts[0].x, s.pts[0].y);
						for (let i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i].x, s.pts[i].y);
						c.stroke();
					}
				} : null).then((blob) => navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])).catch((err) => console.warn("dsh-imglight: copy failed", err));
			}

			function closePreview() {
				// The product's lightbox closes on a window keydown Escape.
				window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			}

			rowUndo.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); undo(); });
			rowCancel.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); exitDraw(); });
			rowSave.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); save(); });

			// ---------------------------------------------------- pointer flow
			function onPointerDown(e) {
				if (e.button !== 0) return;
				if (drawing) {
					const p = toNatural(e.clientX, e.clientY);
					const rect = img.getBoundingClientRect();
					live = { pts: [p], w: 4 * (img.naturalWidth / rect.width) };
					img.setPointerCapture(e.pointerId);
					e.preventDefault();
					return;
				}
				if (zoom > 1) {
					panning = { x0: e.clientX, y0: e.clientY, px: panX, py: panY };
					img.setPointerCapture(e.pointerId);
					return;
				}
				// Plain click on the image at zoom 1: enter draw mode and start the first stroke.
				enterDraw();
				const p = toNatural(e.clientX, e.clientY);
				const rect = img.getBoundingClientRect();
				live = { pts: [p], w: 4 * (img.naturalWidth / rect.width) };
				img.setPointerCapture(e.pointerId);
				e.preventDefault();
			}
			function onPointerMove(e) {
				if (live !== null) {
					live.pts.push(toNatural(e.clientX, e.clientY));
					redraw();
					return;
				}
				if (panning !== null) {
					panX = panning.px + (e.clientX - panning.x0);
					panY = panning.py + (e.clientY - panning.y0);
					applyTransform();
				}
			}
			function onPointerUp() {
				if (live !== null) {
					if (live.pts.length > 1) strokes.push(live);
					live = null;
					redraw();
				}
				panning = null;
			}
			function onWheel(e) {
				e.preventDefault();
				setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
			}
			function onKeyDown(e) {
				if (e.key === "Escape" && drawing) {
					e.stopPropagation();
					exitDraw();
				}
			}
			function onResize() {
				sizeCanvas();
				redraw();
			}

			img.style.cursor = "zoom-in";
			img.style.touchAction = "none";
			img.addEventListener("pointerdown", onPointerDown);
			img.addEventListener("pointermove", onPointerMove);
			img.addEventListener("pointerup", onPointerUp);
			img.addEventListener("pointercancel", onPointerUp);
			img.addEventListener("wheel", onWheel, { passive: false });
			window.addEventListener("keydown", onKeyDown, true);
			window.addEventListener("resize", onResize);
			applyTransform();

			return () => {
				if (disposed) return;
				disposed = true;
				img.style.transform = "";
				img.style.cursor = "";
				img.style.touchAction = "";
				img.removeEventListener("pointerdown", onPointerDown);
				img.removeEventListener("pointermove", onPointerMove);
				img.removeEventListener("pointerup", onPointerUp);
				img.removeEventListener("pointercancel", onPointerUp);
				img.removeEventListener("wheel", onWheel);
				window.removeEventListener("keydown", onKeyDown, true);
				window.removeEventListener("resize", onResize);
				toolbar.remove();
				drawRow.remove();
				canvas.remove();
				delete dialog.__igl;
			};
		}

		// ------------------------------------------------------------ detector
		/**
		 * @param {object} ctx - plugin client context.
		 * @returns {() => void} disposer
		 */
		function installDetector(ctx) {
			const attached = new Map(); // dialog -> dispose
			let disposed = false;

			function scan() {
				if (disposed) return;
				for (const [dialog, dispose] of [...attached]) {
					if (!dialog.isConnected) {
						dispose();
						attached.delete(dialog);
					}
				}
				for (const dialog of document.querySelectorAll('[role="dialog"]')) {
					if (dialog.__igl || attached.has(dialog)) continue;
					const cs = getComputedStyle(dialog);
					if (cs.position !== "fixed") continue;
					const img = [...dialog.children].find((c) => c instanceof HTMLImageElement);
					if (img === void 0) continue;
					if (getComputedStyle(img).objectFit !== "contain") continue;
					let dispose;
					try {
						dispose = attachLightbox(ctx, dialog, img);
					} catch (err) {
						delete dialog.__igl;
						console.warn("dsh-imglight: attach failed", err);
						continue;
					}
					attached.set(dialog, dispose);
				}
			}
			const observer = new MutationObserver(scan);
			observer.observe(document.body, { childList: true, subtree: true });
			scan();
			return () => {
				disposed = true;
				observer.disconnect();
				for (const dispose of [...attached.values()]) dispose();
				attached.clear();
			};
		}

		// --------------------------------------------------------------- apply
		function apply(ctx) {
			ctx.effect(() => installDetector(ctx), "dsh-imglight: lightbox augmentor");
		}
		exports.apply = apply;
		exports.inject = ["sessions"];
		return module.exports;
	}
});
