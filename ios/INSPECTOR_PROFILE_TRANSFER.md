# Inspector Profile Transfer (Desktop → iOS)

This document is the contract for packing an inspector profile on the Oversight
**desktop** app into QR code(s), and unpacking them on first launch of the
Oversight **iOS** app.

Desktop implements the encoder today (`Share` on the Inspector Profile modal).
iOS should implement the decoder against this file — do not invent a parallel
format.

---

## Why multipart?

A single QR code holds at most ~2,953 bytes (version 40, ECC `L`). A crisp
signature PNG is often larger than that. Shrinking the signature to fit one
code makes it pixelated.

**v2** keeps the signature at high quality and splits the full profile JSON
across **one or more large QR frames** that auto-cycle on the desktop. iOS
scans until every part for a transfer id is collected, then reassembles.

---

## User flow

1. On Windows, the inspector opens **Inspector Profile**, fills in their
   details (and optional signature), then clicks **Share**.
2. Desktop builds the full profile JSON (high-quality signature as base64) and
   shows a **large** QR. If more than one part is needed, the code
   auto-advances (Previous / Next also available).
3. On first open of the iOS app (no inspector profile saved yet), iOS prompts
   the inspector to **scan the inspector profile QR** and keep the camera on
   the code until all parts are received.
4. iOS writes the fields into the local `Inspector` SwiftData record (and
   signature image data) and continues into the normal app shell.

---

## Wire format

### A. Reassembled profile document

After all parts are concatenated (in index order), the result is a UTF-8 JSON
object:

| Field | Type | Required | Notes |
|---|---|---|---|
| `v` | number | yes | Schema version. Current: `2`. Also accept legacy `1`. |
| `type` | string | yes | Always `"oversight.inspectorProfile"`. |
| `name` | string | yes | Full name. Must be non-empty after trim. |
| `initials` | string | no | Up to 4 characters. |
| `company` | string | no | |
| `phone` | string | no | |
| `email` | string | no | |
| `certificationNumber` | string | no | |
| `license` | string | no | Free-text license / state / date. |
| `signatureBase64` | string | no | PNG (preferred) or JPEG as **raw** base64 — **no** `data:` prefix. |
| `signatureMime` | string | no | `"image/png"` (default) or `"image/jpeg"`. |
| `exportedAt` | string | no | ISO-8601 timestamp. |

### B. QR part envelope (what each scanned frame contains)

Each QR payload is UTF-8 JSON (byte mode, ECC `L`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `v` | number | yes | `2` |
| `type` | string | yes | `"oversight.inspectorProfilePart"` |
| `id` | string | yes | Transfer id shared by all parts of one Share session |
| `i` | number | yes | Zero-based part index |
| `n` | number | yes | Total part count (`n >= 1`) |
| `c` | string | yes | UTF-8 chunk of the reassembled profile JSON |

#### Example part

```json
{
  "v": 2,
  "type": "oversight.inspectorProfilePart",
  "id": "a1b2c3d4",
  "i": 0,
  "n": 3,
  "c": "{\"v\":2,\"type\":\"oversight.inspectorProfile\",\"name\":\"Jordan Lee\","
}
```

### Legacy v1 (optional)

Older desktop builds may emit a single QR whose payload *is* the profile
document with `v: 1` and `type: "oversight.inspectorProfile"` (often with a
heavily compressed signature). iOS should still accept that for compatibility.

---

## Field mapping → iOS `Inspector` model

| Profile field | iOS destination |
|---|---|
| `name` | `Inspector.name` |
| `initials` | Derived `Inspector.initials` (computed from name today) |
| `license` | `Inspector.license` |
| `certificationNumber` | Fold into `Inspector.certifications` until a dedicated field exists |
| `company`, `phone`, `email` | Add additive SwiftData properties when implementing the scanner |
| `signatureBase64` + `signatureMime` | Decode to `Data` → `Inspector.signatureData` |

---

## Signature packaging rules (desktop encoder)

1. Prefer the original drawn/uploaded signature PNG.
2. Only downscale if larger than **1000×320** (high-quality resample, stay PNG).
3. Strip any `data:image/...;base64,` prefix — raw base64 goes in
   `signatureBase64`.
4. Do **not** crush the signature to fit one QR. Split into multipart frames
   instead.
5. Render each QR large on screen (≈520–720 px) with margin ≥ 4 modules.

---

## iOS decoder checklist

1. Parse the scanned string as JSON.
2. If `type === "oversight.inspectorProfile"` (v1 or single-frame legacy):
   import that object directly (step 6).
3. If `type === "oversight.inspectorProfilePart"`:
   - Require `v === 2`, non-empty `id`, valid `i`/`n`, string `c`.
   - Store chunks in a map keyed by `id` → index → `c`.
   - Ignore duplicate indexes; reject conflicting `n` for the same `id`.
   - When all indexes `0..n-1` are present, concatenate `c` values in order.
   - Parse the concatenation as the profile document JSON.
4. Require profile `type === "oversight.inspectorProfile"` and `v` in `{1,2}`.
5. Require non-empty `name`. Trim strings; missing keys → `""`.
6. If `signatureBase64` is non-empty:
   - Decode with `Data(base64Encoded:)`.
   - Validate PNG/JPEG magic bytes; reject bad blobs without aborting the rest.
   - Store on `Inspector.signatureData`.
7. Persist via SwiftData, mark onboarding complete, dismiss the scan UI.
8. Show progress while multipart scanning (“3 of 5 parts…”).
9. Offline only — never upload the payload to a network.

---

## Desktop entry points

| Piece | Location |
|---|---|
| Profile UI + Share | `js/inspector-profile.js` → `openInspectorProfileModal` / `openInspectorProfileShareModal` |
| Payload + chunking | `buildInspectorProfileSharePayload()` in `js/inspector-profile.js` |
| QR PNG generation | IPC `generate-qr-data-url` in `main.js` |
| Preload bridge | `window.electronAPI.generateQrDataUrl(text)` in `preload.js` |

---

## Versioning

- `v: 2` introduces multipart envelopes (`oversight.inspectorProfilePart`).
- Additive optional fields on the profile document do not require a bump.
- Keep this markdown updated in the same PR as encoder/decoder changes.
