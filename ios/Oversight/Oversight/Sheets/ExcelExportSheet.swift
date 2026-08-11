//
//  ExcelExportSheet.swift
//  Oversight
//
//  Converts a project to an XLSX workbook and presents the system share
//  sheet so the inspector can save to Files (iCloud Drive), AirDrop it
//  to another inspector, or send via email.
//
//  Sheet structure mirrors js/excel.js on the desktop app so files can
//  be opened in Excel or re-imported on another iOS device.
//

import SwiftUI
import SwiftData

struct ExcelExportSheet: View {
    let project: Project

    @Environment(\.dismiss) private var dismiss
    @Query private var inspectors: [Inspector]

    @State private var isBuilding = true
    @State private var xlsxData: Data?
    @State private var errorMessage: String?
    @State private var showShare = false
    @State private var tempURL: URL?

    var body: some View {
        NavigationStack {
            Group {
                if isBuilding {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("Building spreadsheet…")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    ContentUnavailableView("Export Failed", systemImage: "exclamationmark.triangle",
                                          description: Text(error))
                } else {
                    VStack(spacing: 20) {
                        Image(systemName: "doc.badge.checkmark")
                            .font(.system(size: 56))
                            .foregroundStyle(.green)
                        Text("Spreadsheet ready")
                            .font(.title3.weight(.semibold))
                        Text("\(project.projectNumber) · \(project.siteName)")
                            .foregroundStyle(.secondary)
                        Button {
                            showShare = true
                        } label: {
                            Label("Share / Save to Files", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.horizontal, 32)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Export to Excel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { cleanupAndDismiss() }
                }
            }
        }
        .task { await buildXLSX() }
        .sheet(isPresented: $showShare, onDismiss: cleanupAndDismiss) {
            if let url = tempURL {
                ShareSheetView(url: url)
                    .ignoresSafeArea()
            }
        }
    }

    private func buildXLSX() async {
        let inspector = inspectors.first   // capture on main thread before detaching
        await Task.detached(priority: .userInitiated) {
            let data = ProjectXLSXConverter.export(project, inspector: inspector)
            let fileName = "\(project.projectNumber)_\(project.siteName)"
                .components(separatedBy: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_")).inverted)
                .joined(separator: "_") + ".xlsx"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            do {
                try data.write(to: url)
                await MainActor.run {
                    self.xlsxData = data
                    self.tempURL = url
                    self.isBuilding = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isBuilding = false
                }
            }
        }.value
    }

    private func cleanupAndDismiss() {
        if let url = tempURL { try? FileManager.default.removeItem(at: url) }
        dismiss()
    }
}

// MARK: - ShareSheet wrapper

struct ShareSheetView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Project → XLSX converter

enum ProjectXLSXConverter {
    static func export(_ project: Project, inspector: Inspector? = nil) -> Data {
        var writer = XLSXWriter()

        // Overview
        writer.addSheet(name: "Overview", rows: overviewRows(project))

        // Materials
        let materialRows = materialsRows(project)
        if materialRows.count > 1 { writer.addSheet(name: "Materials", rows: materialRows) }

        // Air Samples
        let sampleRows = airSamplesRows(project)
        if sampleRows.count > 1 { writer.addSheet(name: "Air Samples", rows: sampleRows) }

        // Containments
        let containmentRows = containmentsRows(project)
        if containmentRows.count > 1 { writer.addSheet(name: "Containments", rows: containmentRows) }

        // Visual Inspections
        let viRows = visualInspectionsRows(project)
        if viRows.count > 1 { writer.addSheet(name: "Visual Inspections", rows: viRows) }

        // Worker Roster
        let workerRows = workersRows(project)
        if workerRows.count > 1 { writer.addSheet(name: "Worker Roster", rows: workerRows) }

        // Bulk Samples
        let bulkRows = bulkSamplesRows(project)
        if bulkRows.count > 1 { writer.addSheet(name: "Bulk Samples", rows: bulkRows) }

        // Wipe Samples
        let wipeRows = wipeSamplesRows(project)
        if wipeRows.count > 1 { writer.addSheet(name: "Wipe Samples", rows: wipeRows) }

        // Daily Logs
        let logRows = dailyLogsRows(project)
        if logRows.count > 1 { writer.addSheet(name: "Daily Logs", rows: logRows) }

        // _DailyLogPhotos — base64 photo backup (matches Windows _DailyLogPhotos sheet)
        let photoRows = dailyLogPhotosRows(project)
        if photoRows.count > 1 { writer.addSheet(name: "_DailyLogPhotos", rows: photoRows) }

        // _InspectorSignatures — inspector signature for cross-device transfer
        if let sigRows = inspectorSignaturesRows(project: project, inspector: inspector) {
            writer.addSheet(name: "_InspectorSignatures", rows: sigRows)
        }

        // _FullData — full project JSON (includes embedded photos + signature for iOS round-trip)
        writer.addSheet(name: "_FullData", rows: fullDataRows(project, inspector: inspector))

        return writer.build()
    }

    private static let CHUNK = 32000

    private static func overviewRows(_ p: Project) -> [[XLSXValue]] {
        func row(_ k: String, _ v: String) -> [XLSXValue] { [.str(k), .str(v)] }
        return [
            row("Project Number", p.projectNumber),
            row("Site Name", p.siteName),
            row("Site Address", p.siteAddress),
            row("Client Name", p.clientName),
            row("Client Phone", p.clientPhone),
            row("Client Contact Name", p.clientContactName),
            row("Client Contact Phone", p.clientContactPhone),
            row("Contractor", p.contractor),
            row("Contractor Phone", p.contractorPhone),
            row("Foreman Name", p.foremanName),
            row("Foreman Phone", p.foremanPhone),
            row("Status", p.status.rawValue),
            row("Created At", ISO8601DateFormatter().string(from: p.createdAt)),
        ]
    }

    private static func materialsRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Building"), .str("Space"), .str("Material Name"),
                                     .str("Quantity"), .str("Unit"), .str("Type"),
                                     .str("Friable"), .str("HMR#")]]
        for building in p.buildings {
            for space in building.spaces {
                for mat in space.materials {
                    rows.append([.str(building.name), .str(space.name), .str(mat.name),
                                  .num(mat.quantity), .str(mat.unit.rawValue),
                                  .str(mat.materialType.rawValue),
                                  .str(mat.isFriable ? "Yes" : "No"), .str(mat.hmrNumber)])
                }
            }
        }
        return rows
    }

    private static func airSamplesRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Sample ID"), .str("Type"), .str("Hazard"),
                                     .str("Date"), .str("Start Time"), .str("Stop Time"),
                                     .str("Start Flow Rate"), .str("Stop Flow Rate"),
                                     .str("Location"), .str("Containment"), .str("Set ID")]]
        let dateFmt = DateFormatter(); dateFmt.dateFormat = "yyyy-MM-dd"
        let timeFmt = DateFormatter(); timeFmt.dateFormat = "HHmm"
        for s in p.airSamples.sorted(by: { $0.date < $1.date }) {
            rows.append([.str(s.sampleId), .str(s.sampleType.rawValue), .str(s.hazardType.rawValue),
                          .str(dateFmt.string(from: s.date)),
                          s.startTime.map { .str(timeFmt.string(from: $0)) } ?? .empty,
                          s.stopTime.map { .str(timeFmt.string(from: $0)) } ?? .empty,
                          s.startFlowRate.map { .num($0) } ?? .empty,
                          s.stopFlowRate.map { .num($0) } ?? .empty,
                          .str(s.location), .str(s.containmentName),
                          s.sampleSetId.map { .str($0) } ?? .empty])
        }
        return rows
    }

    private static func containmentsRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Name"), .str("Building"), .str("Stage"), .str("Spaces")]]
        for c in p.containments {
            rows.append([.str(c.name), .str(c.buildingName), .str(c.stage.rawValue),
                          .str(c.spaceNames.joined(separator: "; "))])
        }
        return rows
    }

    private static func visualInspectionsRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Containment"), .str("Type"), .str("Date"),
                                     .str("Passed"), .str("Inspector"), .str("Notes")]]
        let fmt = ISO8601DateFormatter()
        for c in p.containments {
            for vi in c.visualInspections.sorted(by: { $0.date < $1.date }) {
                rows.append([.str(c.name), .str(vi.inspectionType.rawValue),
                              .str(fmt.string(from: vi.date)),
                              .str(vi.passed ? "Yes" : "No"),
                              .str(vi.inspectorName), .str(vi.notes)])
            }
        }
        return rows
    }

    private static func workersRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Name"), .str("Role"), .str("Respirator Types"),
                                     .str("AHERA Exp."), .str("Medical Exp."),
                                     .str("Resp. Fit Exp."), .str("Lead Exp."),
                                     .str("Lead Med. Exp.")]]
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        for w in p.workerRoster {
            rows.append([.str(w.name), .str(w.role.rawValue),
                          .str(w.respiratorTypes.map(\.rawValue).joined(separator: "; ")),
                          w.aheraExpiration.map { .str(fmt.string(from: $0)) } ?? .empty,
                          w.medicalExpiration.map { .str(fmt.string(from: $0)) } ?? .empty,
                          w.respiratorFitExpiration.map { .str(fmt.string(from: $0)) } ?? .empty,
                          w.leadExpiration.map { .str(fmt.string(from: $0)) } ?? .empty,
                          w.leadMedExpiration.map { .str(fmt.string(from: $0)) } ?? .empty])
        }
        return rows
    }

    private static func dailyLogsRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Date"), .str("Inspector"), .str("Workers Total"),
                                     .str("Worker Names"), .str("Entry Time"),
                                     .str("Description"), .str("Negative Pressure"), .str("Photos")]]
        let dateFmt = DateFormatter(); dateFmt.dateFormat = "yyyy-MM-dd"
        let timeFmt = DateFormatter(); timeFmt.dateFormat = "HHmm"
        for log in p.dailyLogs.sorted(by: { $0.date < $1.date }) {
            let names = log.workerNames.joined(separator: "; ")
            for entry in log.entries.sorted(by: { $0.time < $1.time }) {
                rows.append([.str(dateFmt.string(from: log.date)),
                              .str(log.inspectorName), .num(Double(log.workersOnSite)),
                              .str(names), .str(timeFmt.string(from: entry.time)),
                              .str(entry.note), .str(entry.negativePressureNotes),
                              .num(Double(entry.photos.count))])
            }
        }
        return rows
    }

    private static func bulkSamplesRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Sample ID"), .str("Material Name"), .str("HMR#"),
                                     .str("Location"), .str("Containment"), .str("Hazard"),
                                     .str("Analysis Type"), .str("Date"),
                                     .str("Inspector"), .str("Notes")]]
        let dateFmt = DateFormatter(); dateFmt.dateFormat = "yyyy-MM-dd"
        for s in p.bulkSamples.sorted(by: { $0.date < $1.date }) {
            rows.append([.str(s.sampleId), .str(s.materialName), .str(s.hmrNumber),
                          .str(s.location), .str(s.containmentName), .str(s.hazardType.rawValue),
                          .str(s.analysisType.rawValue), .str(dateFmt.string(from: s.date)),
                          .str(s.inspectorName), .str(s.notes)])
        }
        return rows
    }

    private static func wipeSamplesRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Sample ID"), .str("Type"), .str("Containment"),
                                     .str("Building"), .str("Space"), .str("Substrate"),
                                     .str("Component"), .str("ft²"), .str("Date"),
                                     .str("Inspector"), .str("Location/Comments"), .str("Auto-Created")]]
        let dateFmt = DateFormatter(); dateFmt.dateFormat = "yyyy-MM-dd"
        for s in p.wipeSamples.sorted(by: { $0.date < $1.date }) {
            rows.append([.str(s.sampleId), .str(s.wipeSampleType.rawValue),
                          .str(s.containmentName), .str(s.buildingName), .str(s.spaceName),
                          .str(s.substrate), .str(s.component),
                          s.squareFeet > 0 ? .num(s.squareFeet) : .empty,
                          .str(dateFmt.string(from: s.date)),
                          .str(s.inspectorName), .str(s.locationComment),
                          .str(s.autoCreated ? "Yes" : "No")])
        }
        return rows
    }

    private static func fullDataRows(_ p: Project, inspector: Inspector?) -> [[XLSXValue]] {
        let json = ProjectJSONEncoder.encode(p, inspector: inspector)
        var rows: [[XLSXValue]] = [[.str("chunkIndex"), .str("data")]]
        var idx = 0; var start = json.startIndex
        while start < json.endIndex {
            let end = json.index(start, offsetBy: min(CHUNK, json.distance(from: start, to: json.endIndex)))
            rows.append([.num(Double(idx)), .str(String(json[start..<end]))])
            start = end; idx += 1
        }
        return rows
    }

    /// Writes photos as base64 chunks — mirrors Windows `_DailyLogPhotos` sheet format.
    /// Columns: Log ID, Entry Hour, Photo Index, Chunk Index, Base64
    private static func dailyLogPhotosRows(_ p: Project) -> [[XLSXValue]] {
        var rows: [[XLSXValue]] = [[.str("Log ID"), .str("Entry Hour"),
                                    .str("Photo Index"), .str("Chunk Index"), .str("Base64")]]
        let isoFmt = ISO8601DateFormatter()
        let timeFmt = DateFormatter(); timeFmt.dateFormat = "HH:mm"

        for log in p.dailyLogs {
            let logId = isoFmt.string(from: log.date)
            for entry in log.entries.sorted(by: { $0.time < $1.time }) {
                let hour = timeFmt.string(from: entry.time)
                let sorted = entry.photos.sorted { $0.takenAt < $1.takenAt }
                for (photoIdx, photo) in sorted.enumerated() {
                    let b64 = photo.imageData.base64EncodedString()
                    if b64.count <= CHUNK {
                        rows.append([.str(logId), .str(hour), .num(Double(photoIdx)), .num(0), .str(b64)])
                    } else {
                        var chunkIdx = 0; var start = b64.startIndex
                        while start < b64.endIndex {
                            let end = b64.index(start, offsetBy: min(CHUNK, b64.distance(from: start, to: b64.endIndex)))
                            rows.append([.str(logId), .str(hour), .num(Double(photoIdx)),
                                         .num(Double(chunkIdx)), .str(String(b64[start..<end]))])
                            start = end; chunkIdx += 1
                        }
                    }
                }
            }
        }
        return rows
    }

    /// Writes the current inspector's signature as base64 chunks — mirrors Windows `_InspectorSignatures`.
    /// Columns: Inspector Name, Chunk Index, Signature Base64
    private static func inspectorSignaturesRows(project: Project, inspector: Inspector?) -> [[XLSXValue]]? {
        guard let inspector = inspector,
              let sigData = inspector.signatureData,
              !inspector.name.isEmpty else { return nil }

        let b64 = sigData.base64EncodedString()
        var rows: [[XLSXValue]] = [[.str("Inspector Name"), .str("Chunk Index"), .str("Signature Base64")]]

        if b64.count <= CHUNK {
            rows.append([.str(inspector.name), .num(0), .str(b64)])
        } else {
            var chunkIdx = 0; var start = b64.startIndex
            while start < b64.endIndex {
                let end = b64.index(start, offsetBy: min(CHUNK, b64.distance(from: start, to: b64.endIndex)))
                rows.append([.str(inspector.name), .num(Double(chunkIdx)), .str(String(b64[start..<end]))])
                start = end; chunkIdx += 1
            }
        }
        return rows
    }
}
