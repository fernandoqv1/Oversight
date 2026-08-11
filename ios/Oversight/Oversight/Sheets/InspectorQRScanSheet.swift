//
//  InspectorQRScanSheet.swift
//  Oversight
//
//  Scans the rolling QR codes produced by the Windows Oversight desktop app's
//  "Share Inspector Profile" button.
//
//  Supports two wire formats (ios/INSPECTOR_PROFILE_TRANSFER.md):
//
//  v2 — multipart (current): the profile JSON is split across N auto-cycling
//       QR frames.  Each frame carries type "oversight.inspectorProfilePart"
//       with an id, index i, total n, and chunk c.  iOS collects all chunks
//       for a given id, assembles them, then parses the profile JSON.
//
//  v1 — legacy single-frame: a single QR whose payload IS the profile JSON
//       with type "oversight.inspectorProfile".  Still accepted for back-compat.
//

import SwiftUI

#if os(iOS)
import VisionKit
#endif

// MARK: - Decoded profile

struct ImportedInspectorProfile {
    var name: String
    var company: String
    var phone: String
    var email: String
    var certificationNumber: String
    var license: String
    var signatureData: Data?
}

// MARK: - Sheet

struct InspectorQRScanSheet: View {
    let onImport: (ImportedInspectorProfile) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var statusMessage = "Point camera at the QR codes shown on your Windows desktop."
    @State private var scanEnabled = true
    @State private var importSucceeded = false

    // Multipart v2 state
    @State private var parts: [String: [Int: String]] = [:]   // transferId → partIndex → chunk
    @State private var partCounts: [String: Int] = [:]         // transferId → expected total n
    @State private var activeTransferId: String? = nil

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                scannerContent
                statusOverlay
            }
            .navigationTitle("Import Inspector Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    // MARK: Platform branches

    @ViewBuilder
    private var scannerContent: some View {
        #if os(iOS)
        if DataScannerViewController.isAvailable {
            QRScannerRepresentable(scanEnabled: $scanEnabled, onDecode: handlePayload)
                .ignoresSafeArea()
        } else {
            scannerUnavailableView
        }
        #else
        macOSFallbackView
        #endif
    }

    private var statusOverlay: some View {
        VStack(spacing: 0) {
            if importSucceeded {
                Label("Profile imported", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.green)
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .padding()
            } else {
                Text(statusMessage)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .padding()
            }
        }
        .padding(.bottom, 32)
    }

    private var scannerUnavailableView: some View {
        ContentUnavailableView(
            "Scanner Not Available",
            systemImage: "qrcode.viewfinder",
            description: Text("QR scanning requires a device with Neural Engine support and camera access.")
        )
    }

    // MARK: macOS fallback — paste QR payloads one at a time

    #if !os(iOS)
    @State private var pastedPayload = ""

    private var macOSFallbackView: some View {
        Form {
            Section {
                Text("Paste each QR frame's JSON payload here and tap Add Part. Once all parts are received the profile will import automatically.")
                    .foregroundStyle(.secondary)
            }
            Section("QR Payload") {
                TextEditor(text: $pastedPayload)
                    .font(.system(.caption, design: .monospaced))
                    .frame(minHeight: 160)
            }
            Section {
                Button("Add Part / Import") {
                    handlePayload(pastedPayload)
                    pastedPayload = ""
                }
                .disabled(pastedPayload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
    #endif

    // MARK: - Top-level payload router

    private func handlePayload(_ raw: String) {
        guard scanEnabled else { return }

        guard let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // Not JSON — camera may have picked up a non-Oversight QR; ignore silently
            return
        }

        let type = json["type"] as? String ?? ""

        switch type {
        case "oversight.inspectorProfilePart":
            handlePart(json)
        case "oversight.inspectorProfile":
            // v1 or v2 single-frame legacy — import directly
            handleDirectProfile(json)
        default:
            // Unrelated QR code in the environment — ignore, keep scanning
            break
        }
    }

    // MARK: - v2 Multipart handler

    private func handlePart(_ json: [String: Any]) {
        guard let v = json["v"] as? Int, v == 2,
              let id = json["id"] as? String, !id.isEmpty,
              let i = json["i"] as? Int, i >= 0,
              let n = json["n"] as? Int, n >= 1,
              let c = json["c"] as? String else {
            // Malformed part — show brief warning but keep scanning
            showTransientMessage("Invalid QR part — keep camera on the cycling code.")
            return
        }

        // If a new transfer session starts (desktop user clicked Share again), reset state
        if let active = activeTransferId, active != id {
            parts = [:]
            partCounts = [:]
            activeTransferId = nil
        }

        activeTransferId = id

        // Reject conflicting n for the same id (shouldn't happen in practice)
        if let existing = partCounts[id], existing != n {
            showTransientMessage("Mismatched QR parts. Please restart Share on the desktop.")
            return
        }
        partCounts[id] = n

        // Store chunk — ignore duplicate indexes
        if parts[id] == nil { parts[id] = [:] }
        if parts[id]?[i] == nil {
            parts[id]?[i] = c
        }

        let collected = parts[id]?.count ?? 0

        guard collected >= n else {
            // Not done yet — update progress and keep scanning
            statusMessage = "Scanning… \(collected) of \(n) parts received. Keep camera on the cycling QR code."
            return
        }

        // All n parts collected — assemble in index order
        guard let chunks = parts[id] else { return }
        let assembled = (0..<n).compactMap { chunks[$0] }.joined()

        guard let profileData = assembled.data(using: .utf8),
              let profileJSON = try? JSONSerialization.jsonObject(with: profileData) as? [String: Any] else {
            showError("Could not read assembled profile. Please try scanning again.")
            return
        }

        handleDirectProfile(profileJSON)
    }

    // MARK: - Profile extractor (shared by v1 legacy and v2 assembled)

    private func handleDirectProfile(_ json: [String: Any]) {
        guard let type = json["type"] as? String, type == "oversight.inspectorProfile" else {
            showError("Not an Oversight inspector profile. Please try again.")
            return
        }

        guard let v = json["v"] as? Int, v == 1 || v == 2 else {
            showError("Unsupported profile version. Please update the iOS app.")
            return
        }

        let rawName = (json["name"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        guard !rawName.isEmpty else {
            showError("Profile is missing a name — please check the desktop app.")
            return
        }

        // Stop scanning — we have a complete profile
        scanEnabled = false

        var profile = ImportedInspectorProfile(
            name: rawName,
            company: (json["company"] as? String ?? "").trimmingCharacters(in: .whitespaces),
            phone: (json["phone"] as? String ?? "").trimmingCharacters(in: .whitespaces),
            email: (json["email"] as? String ?? "").trimmingCharacters(in: .whitespaces),
            certificationNumber: (json["certificationNumber"] as? String ?? "").trimmingCharacters(in: .whitespaces),
            license: (json["license"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        )

        if let sigB64 = json["signatureBase64"] as? String, !sigB64.isEmpty {
            var raw = sigB64.components(separatedBy: .whitespacesAndNewlines).joined()
            // Strip "data:...;base64," prefix (some builds include full data URL)
            if let range = raw.range(of: "base64,") {
                raw = String(raw[range.upperBound...])
            }
            let padded = paddedBase64(raw)
            if let sigData = Data(base64Encoded: padded, options: .ignoreUnknownCharacters),
               isValidImageData(sigData) {
                profile.signatureData = sigData
            }
        }

        importSucceeded = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            onImport(profile)
            dismiss()
        }
    }

    // MARK: - Helpers

    /// Shows an error, disables scanning for 2.5 s, then re-enables.
    private func showError(_ message: String) {
        scanEnabled = false
        statusMessage = message
        // Reset multipart state on hard errors so the user can try a fresh scan
        parts = [:]
        partCounts = [:]
        activeTransferId = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            statusMessage = "Point camera at the QR codes shown on your Windows desktop."
            scanEnabled = true
        }
    }

    /// Updates the status label without interrupting scanning (used during multipart progress).
    private func showTransientMessage(_ message: String) {
        statusMessage = message
    }

    private func paddedBase64(_ s: String) -> String {
        let r = s.count % 4
        return r == 0 ? s : s + String(repeating: "=", count: 4 - r)
    }

    private func isValidImageData(_ data: Data) -> Bool {
        guard data.count > 4 else { return false }
        let bytes = [UInt8](data.prefix(4))
        let isPNG = bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
        let isJPEG = bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
        return isPNG || isJPEG
    }
}

// MARK: - DataScannerViewController wrapper (iOS only)

#if os(iOS)
private struct QRScannerRepresentable: UIViewControllerRepresentable {
    @Binding var scanEnabled: Bool
    let onDecode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .accurate,        // higher quality needed for dense multipart QRs
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        if scanEnabled && !vc.isScanning { try? vc.startScanning() }
        if !scanEnabled && vc.isScanning { vc.stopScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onDecode: onDecode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onDecode: (String) -> Void
        init(onDecode: @escaping (String) -> Void) { self.onDecode = onDecode }

        func dataScanner(_ dataScanner: DataScannerViewController,
                         didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let code) = item, let payload = code.payloadStringValue {
                    DispatchQueue.main.async { self.onDecode(payload) }
                    return
                }
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController,
                         didUpdate updatedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            // Also handle updates — when the QR code content changes while the item
            // is still tracked (e.g. auto-cycling frames), didUpdate fires instead of didAdd.
            for item in updatedItems {
                if case .barcode(let code) = item, let payload = code.payloadStringValue {
                    DispatchQueue.main.async { self.onDecode(payload) }
                    return
                }
            }
        }
    }
}
#endif
