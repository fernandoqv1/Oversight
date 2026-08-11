//
//  ExcelImportSheet.swift
//  Oversight
//
//  Lets an inspector pick an XLSX file from Files / iCloud Drive, parses
//  the _FullData sheet, and creates a new project in the local store.
//
//  Supports files from both the Oversight iOS app (STORED ZIP) and the
//  Windows desktop app (SheetJS with shared strings, STORED or DEFLATE ZIP).
//

import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct ExcelImportSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var phase: Phase = .picking
    @State private var errorMessage: String?
    @State private var importedProject: String?

    enum Phase { case picking, importing, done, error }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .picking:
                    pickingView
                case .importing:
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("Importing project…").foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .done:
                    VStack(spacing: 20) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(.green)
                        Text("Project imported")
                            .font(.title3.weight(.semibold))
                        if let name = importedProject {
                            Text(name).foregroundStyle(.secondary)
                        }
                        Button("Done") {
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .error:
                    ContentUnavailableView {
                        Label("Import Failed", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage ?? "Unknown error.")
                    } actions: {
                        Button("Try Again") { phase = .picking }
                    }
                }
            }
            .navigationTitle("Import from Excel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var pickingView: some View {
        VStack(spacing: 24) {
            Image(systemName: "square.and.arrow.down")
                .font(.system(size: 56))
                .foregroundStyle(.blue)
            VStack(spacing: 8) {
                Text("Import Project")
                    .font(.title3.weight(.semibold))
                Text("Select an Oversight XLSX file exported from the iOS or Windows app.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                phase = .picking  // re-trigger the file importer below
            } label: {
                Label("Choose File", systemImage: "folder")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 32)
            .fileImporter(
                isPresented: .constant(true),
                allowedContentTypes: [UTType(filenameExtension: "xlsx") ?? .data],
                onCompletion: handleFile
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func handleFile(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e):
            errorMessage = e.localizedDescription
            phase = .error
        case .success(let url):
            phase = .importing
            Task {
                await importXLSX(from: url)
            }
        }
    }

    private func importXLSX(from url: URL) async {
        do {
            guard url.startAccessingSecurityScopedResource() else {
                throw ImportError.accessDenied
            }
            defer { url.stopAccessingSecurityScopedResource() }
            let data = try Data(contentsOf: url)
            let sheets = try XLSXReader.read(data)
            guard let fullDataSheet = sheets["_FullData"], !fullDataSheet.isEmpty else {
                throw ImportError.missingFullData
            }
            // _FullData comes in two formats depending on project size:
            //   Single-chunk (small projects): header=["data"], rows=[["<json>"]]
            //   Multi-chunk (large projects):  header=["chunkIndex","data"], rows=[["0","<chunk>"],…]
            let headerRow = fullDataSheet.first ?? []
            let dataRows = Array(fullDataSheet.dropFirst())
            let json: String
            if headerRow.count >= 2 {
                // Multi-chunk — sort by chunkIndex (col 0), concatenate data (col 1)
                let sorted = dataRows.sorted {
                    (Double($0.first ?? "") ?? 0) < (Double($1.first ?? "") ?? 0)
                }
                json = sorted.compactMap { $0.count > 1 ? $0[1] : nil }.joined()
            } else {
                // Single-chunk — the JSON is the only value in each data row (col 0)
                json = dataRows.compactMap { $0.first }.joined()
            }

            guard let jsonData = json.data(using: String.Encoding.utf8) else {
                throw ImportError.jsonParseError("Could not decode JSON text")
            }
            var projectData = try JSONDecoder().decode(ProjectJSON.self, from: jsonData)

            // Merge _DailyLogPhotos — Windows files store photos here; iOS files embed them
            // in photoBase64s inside the JSON. Merging is a no-op if entries already have photos.
            if let photoSheet = sheets["_DailyLogPhotos"], photoSheet.count > 1 {
                ExcelImportSheet.mergePhotoSheet(Array(photoSheet.dropFirst()), into: &projectData)
            }

            // Merge _InspectorSignatures — Windows files store signatures here; iOS embeds
            // them in inspectorSignatures in the JSON. Again a no-op if already present.
            if let sigSheet = sheets["_InspectorSignatures"], sigSheet.count > 1 {
                ExcelImportSheet.mergeSignatureSheet(Array(sigSheet.dropFirst()), into: &projectData)
            }

            await MainActor.run {
                do {
                    try ProjectJSONDecoder.insert(projectData, into: modelContext)
                    importedProject = "\(projectData.projectNumber ?? "") · \(projectData.siteName ?? "")"
                    appState.showToast("Project imported")
                    phase = .done
                } catch {
                    errorMessage = error.localizedDescription
                    phase = .error
                }
            }
        } catch let e as ImportError {
            await MainActor.run {
                errorMessage = e.message
                phase = .error
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                phase = .error
            }
        }
    }

    // MARK: - Sheet → JSON merging helpers

    /// Merges rows from `_DailyLogPhotos` into the `photoBase64s` of matching log entries.
    /// Handles both Windows (log ID = UUID) and iOS (log ID = ISO date string) formats.
    private static func mergePhotoSheet(_ rows: [[String]], into json: inout ProjectJSON) {
        struct PhotoKey: Hashable { let logId: String; let hour: String; let photoIdx: Int }
        var chunks: [PhotoKey: [Int: String]] = [:]

        for row in rows {
            guard row.count >= 5 else { continue }
            let key = PhotoKey(logId: row[0], hour: row[1], photoIdx: Int(row[2]) ?? 0)
            let chunkIdx = Int(row[3]) ?? 0
            let b64 = row[4]
            guard !b64.isEmpty else { continue }
            chunks[key, default: [:]][chunkIdx] = b64
        }
        guard !chunks.isEmpty, var logs = json.dailyLogs else { return }

        // Assemble full base64 for each photo from its chunks
        var assembled: [PhotoKey: String] = [:]
        for (key, chunkMap) in chunks {
            let full = chunkMap.sorted { $0.key < $1.key }.map { $0.value }.joined()
            if !full.isEmpty { assembled[key] = full }
        }
        guard !assembled.isEmpty else { return }

        for logIdx in logs.indices {
            guard var entries = logs[logIdx].entries else { continue }
            let logId = logs[logIdx].id ?? logs[logIdx].date ?? ""

            for entryIdx in entries.indices {
                let hour = entries[entryIdx].hour ?? ""
                let matching = assembled.filter { $0.key.logId == logId && $0.key.hour == hour }
                guard !matching.isEmpty else { continue }

                var photos = entries[entryIdx].photoBase64s ?? []
                var changed = false
                for (key, b64) in matching {
                    while photos.count <= key.photoIdx { photos.append("") }
                    if photos[key.photoIdx].isEmpty { photos[key.photoIdx] = b64; changed = true }
                }
                if changed { entries[entryIdx].photoBase64s = photos }
            }
            logs[logIdx].entries = entries
        }
        json.dailyLogs = logs
    }

    /// Merges rows from `_InspectorSignatures` into `inspectorSignatures` of the project JSON.
    private static func mergeSignatureSheet(_ rows: [[String]], into json: inout ProjectJSON) {
        var chunks: [String: [Int: String]] = [:]
        for row in rows {
            guard row.count >= 3, !row[0].isEmpty, !row[2].isEmpty else { continue }
            let chunkIdx = Int(row[1]) ?? 0
            chunks[row[0], default: [:]][chunkIdx] = row[2]
        }
        var sigs = json.inspectorSignatures ?? [:]
        for (name, chunkMap) in chunks {
            let full = chunkMap.sorted { $0.key < $1.key }.map { $0.value }.joined()
            if !full.isEmpty { sigs[name] = full }
        }
        if !sigs.isEmpty { json.inspectorSignatures = sigs }
    }
}

// MARK: - Import error

private enum ImportError: Error {
    case accessDenied, missingFullData, jsonParseError(String)
    var message: String {
        switch self {
        case .accessDenied: return "Could not access the selected file. Please try again."
        case .missingFullData: return "This file doesn't appear to be an Oversight export. Please select an XLSX file exported from the Oversight iOS or Windows app."
        case .jsonParseError(let s): return "Failed to read project data: \(s)"
        }
    }
}

// MARK: - JSON Codable structs (matches desktop app schema)

struct ProjectJSON: Codable {
    // All String fields are optional so a Windows null doesn't break JSONDecoder
    var projectNumber: String? = nil
    var siteName: String? = nil
    var siteAddress: String? = nil
    var clientName: String? = nil
    var clientPhone: String? = nil
    var clientContactName: String? = nil
    var clientContactPhone: String? = nil
    var contractor: String? = nil
    var contractorPhone: String? = nil
    var foremanName: String? = nil
    var foremanPhone: String? = nil
    var created: String? = nil
    var createdAt: String? = nil
    var buildings: [BuildingJSON]? = nil
    var containments: [ContainmentJSON]? = nil
    var airSamples: [AirSampleJSON]? = nil
    var bulkSamples: [BulkSampleJSON]? = nil
    var wipeSamples: [WipeSampleJSON]? = nil
    var workerRoster: [WorkerJSON]? = nil
    var dailyLogs: [DailyLogJSON]? = nil
    /// Inspector name → base64 PNG signature, embedded for cross-device transfer.
    var inspectorSignatures: [String: String]? = nil
}

struct BuildingJSON: Codable {
    var name: String? = nil
    var spaces: [SpaceJSON]? = nil
}

struct SpaceJSON: Codable {
    var name: String? = nil
    var materials: [MaterialJSON]? = nil
}

struct MaterialJSON: Codable {
    var name: String? = nil
    var quantity: Double? = nil
    var unit: String? = nil
    var materialType: String? = nil
    var isFriable: Bool? = nil
    var hmrNumber: String? = nil
    // Desktop compat fields
    var materialName: String? = nil
}

struct ContainmentJSON: Codable {
    var name: String? = nil
    var buildingName: String? = nil
    var stage: String? = nil
    var spaceNames: [String]? = nil
    var visualInspections: [VIJSON]? = nil
}

struct VIJSON: Codable {
    var type: String? = nil
    var date: String? = nil
    var passed: Bool? = nil
    var comments: String? = nil
    var notes: String? = nil
    var inspectorName: String? = nil
}

struct AirSampleJSON: Codable {
    var sampleId: String? = nil
    var id: String? = nil
    var type: String? = nil
    var hazardType: String? = nil
    var date: String? = nil
    var startTime: String? = nil
    var stopTime: String? = nil
    var startFlowRate: Double? = nil
    var stopFlowRate: Double? = nil
    var location: String? = nil
    var containmentName: String? = nil
    var sampleSetId: String? = nil

    init(sampleId: String? = nil, id: String? = nil, type: String? = nil,
         hazardType: String? = nil, date: String? = nil,
         startTime: String? = nil, stopTime: String? = nil,
         startFlowRate: Double? = nil, stopFlowRate: Double? = nil,
         location: String? = nil, containmentName: String? = nil,
         sampleSetId: String? = nil) {
        self.sampleId = sampleId; self.id = id; self.type = type
        self.hazardType = hazardType; self.date = date
        self.startTime = startTime; self.stopTime = stopTime
        self.startFlowRate = startFlowRate; self.stopFlowRate = stopFlowRate
        self.location = location; self.containmentName = containmentName
        self.sampleSetId = sampleSetId
    }

    private enum CodingKeys: String, CodingKey {
        case sampleId, id, type, hazardType, date, startTime, stopTime
        case startFlowRate, stopFlowRate, location, containmentName, sampleSetId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sampleId = try c.decodeIfPresent(String.self, forKey: .sampleId)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        hazardType = try c.decodeIfPresent(String.self, forKey: .hazardType)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        startTime = try c.decodeIfPresent(String.self, forKey: .startTime)
        stopTime = try c.decodeIfPresent(String.self, forKey: .stopTime)
        // Windows clearance samples export "" instead of null for unset flow rates
        startFlowRate = (try? c.decodeIfPresent(Double.self, forKey: .startFlowRate)) ?? nil
        stopFlowRate = (try? c.decodeIfPresent(Double.self, forKey: .stopFlowRate)) ?? nil
        location = try c.decodeIfPresent(String.self, forKey: .location)
        containmentName = try c.decodeIfPresent(String.self, forKey: .containmentName)
        sampleSetId = try c.decodeIfPresent(String.self, forKey: .sampleSetId)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(sampleId, forKey: .sampleId)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(hazardType, forKey: .hazardType)
        try c.encodeIfPresent(date, forKey: .date)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(stopTime, forKey: .stopTime)
        try c.encodeIfPresent(startFlowRate, forKey: .startFlowRate)
        try c.encodeIfPresent(stopFlowRate, forKey: .stopFlowRate)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(containmentName, forKey: .containmentName)
        try c.encodeIfPresent(sampleSetId, forKey: .sampleSetId)
    }
}

struct WorkerJSON: Codable {
    var name: String? = nil
    var role: String? = nil
    var certificationType: String? = nil
    var aheraExpiration: String? = nil
    var medicalExpiration: String? = nil
    var respiratorFitExpiration: String? = nil
    var leadExpiration: String? = nil
    var leadMedExpiration: String? = nil
    var respiratorTypes: [String]? = nil
}

struct DailyLogJSON: Codable {
    var id: String? = nil       // Windows UUID or iOS ISO-date; used to match _DailyLogPhotos rows
    var date: String? = nil
    var inspectorName: String? = nil
    var workersTotal: Int? = nil
    var workersOnSite: Int? = nil
    var workerNames: [String]? = nil
    var entries: [LogEntryJSON]? = nil
}

struct LogEntryJSON: Codable {
    var id: String? = nil
    var hour: String? = nil
    var description: String? = nil
    var notes: String? = nil
    var negativePressureNotes: String? = nil
    /// Base64-encoded photos embedded for iOS→iOS round-trip (one element per photo).
    var photoBase64s: [String]? = nil
    // Legacy fields — kept for backward compat reading old exports
    var stage: String? = nil
    var photoCount: Int? = nil
    var isFailedInspection: Bool? = nil
}

struct BulkSampleJSON: Codable {
    var sampleId: String? = nil
    var materialName: String? = nil
    var hmrNumber: String? = nil
    var location: String? = nil
    var containmentName: String? = nil
    var hazardType: String? = nil
    var analysisType: String? = nil
    var date: String? = nil
    var inspectorName: String? = nil
    var notes: String? = nil
    var autoCreated: Bool? = nil
}

struct WipeSampleJSON: Codable {
    var sampleId: String? = nil
    var type: String? = nil     // "Pre-Start" | "Clearance" | "Custom" — matches Windows key
    var containmentName: String? = nil
    var buildingName: String? = nil
    var spaceName: String? = nil
    var substrate: String? = nil
    var component: String? = nil
    var squareFeet: Double? = nil
    var locationComment: String? = nil
    var date: String? = nil
    var inspectorName: String? = nil
    var notes: String? = nil
    var autoCreated: Bool? = nil
}

// MARK: - JSON Encoder (Project → JSON string)

enum ProjectJSONEncoder {
    static func encode(_ project: Project, inspector: Inspector? = nil) -> String {
        // Build inspector signature map (name → base64)
        var sigs: [String: String] = [:]
        if let sig = inspector?.signatureData,
           let name = inspector?.name, !name.isEmpty {
            sigs[name] = sig.base64EncodedString()
        }

        let data = ProjectJSON(
            projectNumber: project.projectNumber,
            siteName: project.siteName,
            siteAddress: project.siteAddress,
            clientName: project.clientName,
            clientPhone: project.clientPhone,
            clientContactName: project.clientContactName,
            clientContactPhone: project.clientContactPhone,
            contractor: project.contractor,
            contractorPhone: project.contractorPhone,
            foremanName: project.foremanName,
            foremanPhone: project.foremanPhone,
            createdAt: ISO8601DateFormatter().string(from: project.createdAt),
            buildings: project.buildings.map { b in
                BuildingJSON(name: b.name, spaces: b.spaces.map { s in
                    SpaceJSON(name: s.name, materials: s.materials.map { m in
                        MaterialJSON(name: m.name, quantity: m.quantity,
                                     unit: m.unit.rawValue,
                                     materialType: m.materialType.rawValue,
                                     isFriable: m.isFriable,
                                     hmrNumber: m.hmrNumber)
                    })
                })
            },
            containments: project.containments.map { c in
                ContainmentJSON(name: c.name, buildingName: c.buildingName,
                                stage: c.stage.rawValue, spaceNames: c.spaceNames,
                                visualInspections: c.visualInspections.map { vi in
                    VIJSON(type: vi.inspectionType.rawValue,
                           date: ISO8601DateFormatter().string(from: vi.date),
                           passed: vi.passed, notes: vi.notes,
                           inspectorName: vi.inspectorName)
                })
            },
            airSamples: project.airSamples.map { s in
                AirSampleJSON(sampleId: s.sampleId, type: s.sampleType.rawValue,
                              hazardType: s.hazardType.rawValue,
                              date: ISO8601DateFormatter().string(from: s.date),
                              startTime: s.startTime.map { ISO8601DateFormatter().string(from: $0) },
                              stopTime: s.stopTime.map { ISO8601DateFormatter().string(from: $0) },
                              startFlowRate: s.startFlowRate, stopFlowRate: s.stopFlowRate,
                              location: s.location, containmentName: s.containmentName,
                              sampleSetId: s.sampleSetId)
            },
            bulkSamples: project.bulkSamples.map { s in
                BulkSampleJSON(sampleId: s.sampleId, materialName: s.materialName,
                               hmrNumber: s.hmrNumber, location: s.location,
                               containmentName: s.containmentName,
                               hazardType: s.hazardType.rawValue,
                               analysisType: s.analysisType.rawValue,
                               date: ISO8601DateFormatter().string(from: s.date),
                               inspectorName: s.inspectorName, notes: s.notes,
                               autoCreated: s.autoCreated)
            },
            wipeSamples: project.wipeSamples.map { s in
                WipeSampleJSON(sampleId: s.sampleId, type: s.wipeSampleType.rawValue,
                               containmentName: s.containmentName,
                               buildingName: s.buildingName, spaceName: s.spaceName,
                               substrate: s.substrate, component: s.component,
                               squareFeet: s.squareFeet > 0 ? s.squareFeet : nil,
                               locationComment: s.locationComment,
                               date: ISO8601DateFormatter().string(from: s.date),
                               inspectorName: s.inspectorName, notes: s.notes,
                               autoCreated: s.autoCreated)
            },
            workerRoster: project.workerRoster.map { w in
                WorkerJSON(name: w.name, role: w.role.rawValue,
                           aheraExpiration: w.aheraExpiration.map { ISO8601DateFormatter().string(from: $0) },
                           medicalExpiration: w.medicalExpiration.map { ISO8601DateFormatter().string(from: $0) },
                           respiratorFitExpiration: w.respiratorFitExpiration.map { ISO8601DateFormatter().string(from: $0) },
                           leadExpiration: w.leadExpiration.map { ISO8601DateFormatter().string(from: $0) },
                           leadMedExpiration: w.leadMedExpiration.map { ISO8601DateFormatter().string(from: $0) },
                           respiratorTypes: w.respiratorTypes.map(\.rawValue))
            },
            dailyLogs: project.dailyLogs.map { log in
                let timeFmt = DateFormatter(); timeFmt.dateFormat = "HH:mm"
                let isoFmt2 = ISO8601DateFormatter()
                let logId = isoFmt2.string(from: log.date)
                return DailyLogJSON(
                    id: logId,
                    date: logId,
                    inspectorName: log.inspectorName,
                    workersOnSite: log.workersOnSite,
                    workerNames: log.workerNames.isEmpty ? nil : log.workerNames,
                    entries: log.entries.sorted { $0.time < $1.time }.map { e in
                        let b64Photos: [String]? = e.photos.isEmpty ? nil :
                            e.photos.sorted { $0.takenAt < $1.takenAt }
                                .map { $0.imageData.base64EncodedString() }
                        return LogEntryJSON(
                            hour: timeFmt.string(from: e.time),
                            notes: e.note,
                            negativePressureNotes: e.negativePressureNotes.isEmpty ? nil : e.negativePressureNotes,
                            photoBase64s: b64Photos,
                            photoCount: e.photos.count
                        )
                    }
                )
            },
            inspectorSignatures: sigs.isEmpty ? nil : sigs
        )
        return (try? String(data: JSONEncoder().encode(data), encoding: .utf8)) ?? "{}"
    }
}

// MARK: - JSON Decoder (JSON → SwiftData models)

enum ProjectJSONDecoder {
    static func insert(_ data: ProjectJSON, into ctx: ModelContext) throws {
        let isoFmt = ISO8601DateFormatter()

        let project = Project(
            projectNumber: data.projectNumber ?? "",
            siteName: data.siteName ?? "",
            siteAddress: data.siteAddress ?? "",
            clientName: data.clientName ?? "",
            clientPhone: data.clientPhone ?? "",
            clientContactName: data.clientContactName ?? "",
            clientContactPhone: data.clientContactPhone ?? "",
            contractor: data.contractor ?? "",
            contractorPhone: data.contractorPhone ?? "",
            foremanName: data.foremanName ?? "",
            foremanPhone: data.foremanPhone ?? "",
            status: .active,
            createdAt: (data.createdAt ?? data.created).flatMap { isoFmt.date(from: $0) } ?? .now
        )
        ctx.insert(project)

        for bj in data.buildings ?? [] {
            let building = Building(name: bj.name ?? "", project: project)
            ctx.insert(building)
            for sj in bj.spaces ?? [] {
                let space = Space(name: sj.name ?? "", building: building)
                ctx.insert(space)
                for mj in sj.materials ?? [] {
                    let mat = Material(
                        name: mj.materialName ?? mj.name ?? "",
                        quantity: mj.quantity ?? 0,
                        unit: MaterialUnit(rawValue: mj.unit ?? "") ?? .squareFeet,
                        materialType: MaterialType(rawValue: mj.materialType ?? "") ?? .surfacing,
                        hmrNumber: mj.hmrNumber ?? "",
                        isFriable: mj.isFriable ?? false,
                        space: space
                    )
                    ctx.insert(mat)
                }
            }
        }

        for cj in data.containments ?? [] {
            let containment = Containment(name: cj.name ?? "", buildingName: cj.buildingName ?? "",
                                          stage: Stage(rawValue: cj.stage ?? "") ?? .containmentPreparation,
                                          spaceNames: cj.spaceNames ?? [],
                                          project: project)
            ctx.insert(containment)
            for vij in cj.visualInspections ?? [] {
                let vi = VisualInspection(
                    inspectionType: VisualInspectionType(rawValue: vij.type ?? "") ?? .preStart,
                    date: vij.date.flatMap { isoFmt.date(from: $0) } ?? .now,
                    inspectorName: vij.inspectorName ?? "",
                    passed: vij.passed ?? true,
                    notes: vij.notes ?? vij.comments ?? "",
                    containment: containment
                )
                ctx.insert(vi)
            }
        }

        for sj in data.airSamples ?? [] {
            let rawId = sj.sampleId ?? ""
            let sample = AirSample(
                sampleId: rawId.isEmpty ? (sj.id ?? "") : rawId,
                sampleType: SampleType(rawValue: sj.type ?? "") ?? .area,
                hazardType: HazardType(rawValue: sj.hazardType ?? "Asbestos") ?? .asbestos,
                location: sj.location ?? "",
                containmentName: sj.containmentName ?? "",
                date: sj.date.flatMap { isoFmt.date(from: $0) } ?? .now,
                startTime: sj.startTime.flatMap { isoFmt.date(from: $0) },
                stopTime: sj.stopTime.flatMap { isoFmt.date(from: $0) },
                startFlowRate: sj.startFlowRate,
                stopFlowRate: sj.stopFlowRate,
                sampleSetId: sj.sampleSetId,
                project: project
            )
            ctx.insert(sample)
        }

        for bj in data.bulkSamples ?? [] {
            let bulk = BulkSample(
                sampleId: bj.sampleId ?? "",
                materialName: bj.materialName ?? "",
                hmrNumber: bj.hmrNumber ?? "",
                location: bj.location ?? "",
                containmentName: bj.containmentName ?? "",
                hazardType: HazardType(rawValue: bj.hazardType ?? "Asbestos") ?? .asbestos,
                analysisType: BulkAnalysisType(rawValue: bj.analysisType ?? "PLM") ?? .plm,
                date: bj.date.flatMap { isoFmt.date(from: $0) } ?? .now,
                inspectorName: bj.inspectorName ?? "",
                notes: bj.notes ?? "",
                autoCreated: bj.autoCreated ?? false,
                project: project
            )
            ctx.insert(bulk)
        }

        for wj in data.wipeSamples ?? [] {
            let wipe = WipeSample(
                sampleId: wj.sampleId ?? "",
                wipeSampleType: WipeSampleType(rawValue: wj.type ?? "") ?? .clearance,
                containmentName: wj.containmentName ?? "",
                buildingName: wj.buildingName ?? "",
                spaceName: wj.spaceName ?? "",
                substrate: wj.substrate ?? "",
                component: wj.component ?? "",
                squareFeet: wj.squareFeet ?? 0,
                locationComment: wj.locationComment ?? "",
                date: wj.date.flatMap { isoFmt.date(from: $0) } ?? .now,
                inspectorName: wj.inspectorName ?? "",
                notes: wj.notes ?? "",
                autoCreated: wj.autoCreated ?? false,
                project: project
            )
            ctx.insert(wipe)
        }

        let dateFmt = DateFormatter(); dateFmt.dateFormat = "yyyy-MM-dd"
        // Windows exports expiration dates as "yyyy-MM-dd"; iOS exports as full ISO8601.
        // Try ISO8601 first, fall back to date-only format.
        let parseDate: (String?) -> Date? = { str in
            guard let str, !str.isEmpty else { return nil }
            return isoFmt.date(from: str) ?? dateFmt.date(from: str)
        }

        for wj in data.workerRoster ?? [] {
            let worker = Worker(
                name: wj.name ?? "",
                role: WorkerRole(rawValue: wj.role ?? wj.certificationType ?? "") ?? .worker,
                aheraExpiration: parseDate(wj.aheraExpiration),
                medicalExpiration: parseDate(wj.medicalExpiration),
                respiratorFitExpiration: parseDate(wj.respiratorFitExpiration),
                leadExpiration: parseDate(wj.leadExpiration),
                leadMedExpiration: parseDate(wj.leadMedExpiration),
                respiratorTypes: (wj.respiratorTypes ?? []).compactMap { RespiratorType(rawValue: $0) },
                project: project
            )
            ctx.insert(worker)
        }

        let hourFmt = DateFormatter(); hourFmt.dateFormat = "HH:mm"
        for lj in data.dailyLogs ?? [] {
            let logDateStr = lj.date ?? ""
            let logDate = isoFmt.date(from: logDateStr) ?? dateFmt.date(from: logDateStr) ?? .now
            let log = DailyLog(date: logDate, inspectorName: lj.inspectorName ?? "",
                               workersOnSite: lj.workersOnSite ?? lj.workersTotal ?? 0,
                               workerNames: lj.workerNames ?? [],
                               project: project)
            ctx.insert(log)
            for ej in lj.entries ?? [] {
                // Reconstruct full timestamp from log date + "HH:mm" hour field
                var entryTime = logDate
                if let hourStr = ej.hour, let timeOnly = hourFmt.date(from: hourStr) {
                    var dc = Calendar.current.dateComponents([.year, .month, .day], from: logDate)
                    let tc = Calendar.current.dateComponents([.hour, .minute], from: timeOnly)
                    dc.hour = tc.hour; dc.minute = tc.minute
                    entryTime = Calendar.current.date(from: dc) ?? logDate
                }
                let photoB64s = ej.photoBase64s ?? []
                let entry = LogEntry(
                    time: entryTime,
                    note: ej.notes ?? ej.description ?? "",
                    photoCount: photoB64s.isEmpty ? (ej.photoCount ?? 0) : photoB64s.count,
                    negativePressureNotes: ej.negativePressureNotes ?? "",
                    dailyLog: log
                )
                ctx.insert(entry)

                // Restore embedded photos
                for b64 in photoB64s {
                    guard !b64.isEmpty,
                          let imgData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
                          imgData.count > 0 else { continue }
                    let photo = LogEntryPhoto(imageData: imgData)
                    photo.logEntry = entry
                    ctx.insert(photo)
                }
            }
        }

        // Restore inspector signature if present and inspector doesn't already have one
        if let sigs = data.inspectorSignatures {
            let existingInspectors = (try? ctx.fetch(FetchDescriptor<Inspector>())) ?? []
            for inspector in existingInspectors {
                guard inspector.signatureData == nil,
                      let b64 = sigs[inspector.name],
                      !b64.isEmpty,
                      let sigData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
                      sigData.count > 0 else { continue }
                inspector.signatureData = sigData
            }
        }

        try ctx.save()
    }
}
