# Inspector Profile Transfer (Desktop → iOS)

This document is the contract for packing an inspector profile on the Oversight
**desktop** app into a single QR code, and unpacking it on first launch of the
Oversight **iOS** app.

Desktop implements the encoder today (`Share` on the Inspector Profile modal).
iOS should implement the decoder against this file — do not invent a parallel
format.

---

## User flow

1. On Windows, the inspector opens **Inspector Profile**, fills in their
   details (and optional signature), then clicks **Share**.
2. Desktop builds one QR code whose payload contains every profile field plus
   the signature as base64.
3. On first open of the iOS app (no inspector profile saved yet), iOS prompts
   the inspector to **scan the inspector profile QR**.
4. After a successful scan, iOS writes the fields into the local `Inspector`
   SwiftData record (and signature image data) and continues into the normal
   app shell.

The same QR may also be re-scanned later from Profile if iOS adds a
“Replace profile from desktop” action; first-launch is the required path.

---

## Wire format

The QR payload is a **UTF-8 JSON object** (byte mode, error correction `L`).
There is no URL wrapper and no extra envelope — the scanned string *is* the
JSON.

### Top-level object

| Field | Type | Required | Notes |
|---|---|---|---|
| `v` | number | yes | Schema version. Current: `1`. Reject unknown major versions. |
| `type` | string | yes | Always `"oversight.inspectorProfile"`. Use this to reject unrelated QR codes. |
| `name` | string | yes | Full name. Must be non-empty after trim. |
| `initials` | string | no | Up to 4 characters. iOS may recompute from `name` if missing. |
| `company` | string | no | Employer / firm. |
| `phone` | string | no | Display-formatted or raw digits; store as received. |
| `email` | string | no | |
| `certificationNumber` | string | no | e.g. `AI-12345`. Map into iOS certifications / identity fields. |
| `license` | string | no | Free-text license / state / date line (desktop label: “License/State”). |
| `signatureBase64` | string | no | PNG (preferred) or JPEG image as a **raw** base64 string — **no** `data:` URL prefix. Empty / omitted means no signature. |
| `signatureMime` | string | no | `"image/png"` (default) or `"image/jpeg"`. Only meaningful when `signatureBase64` is present. |
| `exportedAt` | string | no | ISO-8601 timestamp from the desktop when the QR was generated. |

### Example (signature truncated)

```json
{
  "v": 1,
  "type": "oversight.inspectorProfile",
  "name": "Jordan Lee",
  "initials": "JL",
  "company": "Acme Environmental",
  "phone": "(555) 123-4567",
  "email": "jordan@acme.example",
  "certificationNumber": "AI-12345",
  "license": "NJ DEP Licensed",
  "signatureMime": "image/png",
  "signatureBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "exportedAt": "2026-08-09T00:00:00.000Z"
}
```

### Field mapping → iOS `Inspector` model

| QR field | iOS destination |
|---|---|
| `name` | `Inspector.name` |
| `initials` | Derived `Inspector.initials` (computed from name today; may store later) |
| `license` | `Inspector.license` |
| `certificationNumber` + optional free-text | Fold into `Inspector.certifications` (e.g. prefix `Cert #: AI-12345`) until the iOS model gains a dedicated cert-number field |
| `company`, `phone`, `email` | Not on `Inspector` yet — add additive SwiftData properties when implementing the scanner (do not drop them) |
| `signatureBase64` + `signatureMime` | Decode to `Data` → `Inspector.signatureData` |

Additive schema only: when iOS grows company/phone/email fields, keep reading
the same QR keys.

---

## Signature packaging rules (desktop encoder)

QR capacity is limited (~2,953 bytes at version 40, ECC `L`). A full-resolution
signature PNG often will not fit, so the desktop encoder **must**:

1. Rasterize the stored signature into a small canvas (max **240×80** CSS px).
2. Export as PNG (transparent background, dark ink).
3. Strip any `data:image/...;base64,` prefix — only the raw base64 goes in
   `signatureBase64`.
4. If `JSON.stringify(payload)` still exceeds the QR byte limit, progressively
   shrink the signature (and finally omit it) rather than failing silently.
   When the signature is omitted, still encode the text fields and leave
   `signatureBase64` empty.

iOS must tolerate a missing signature and let the inspector redraw one in the
Signature sheet.

---

## iOS decoder checklist

1. Read the scanned string; parse as JSON. On failure → show “Not an Oversight
   inspector profile.”
2. Require `type === "oversight.inspectorProfile"` and `v === 1` (or a version
   you explicitly support).
3. Require non-empty `name`.
4. Trim all string fields; treat missing keys as `""`.
5. If `signatureBase64` is non-empty:
   - Decode with `Data(base64Encoded:)`.
   - Validate it is an image (PNG/JPEG magic bytes). Reject malformed blobs
     without aborting the rest of the profile import.
   - Store on `Inspector.signatureData`.
6. Persist via SwiftData, mark onboarding complete, dismiss the scan prompt.
7. Never send the payload to a network — offline only, same as the rest of the app.

---

## Desktop entry points

| Piece | Location |
|---|---|
| Profile UI + Share button | `js/inspector-profile.js` → `openInspectorProfileModal` / `openInspectorProfileShareModal` |
| Payload builder | `buildInspectorProfileSharePayload()` in `js/inspector-profile.js` |
| QR PNG generation | IPC `generate-qr-data-url` in `main.js` (uses npm `qrcode`, ECC `L`) |
| Preload bridge | `window.electronAPI.generateQrDataUrl(text)` in `preload.js` |

---

## Versioning

- Bump `v` when a breaking key rename or semantic change is required.
- Additive optional fields do **not** require a version bump; iOS should ignore
  unknown keys.
- Keep this markdown updated in the same PR as any encoder or decoder change.
