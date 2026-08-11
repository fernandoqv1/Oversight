//
//  AirSampleFormSheet.swift
//  Oversight
//
//  Add/edit air sample — ported from SampleSheet in oversight-sheets.jsx.
//  Hazard type (Asbestos/Lead) matches the hazard dropdown in the desktop
//  app; lead samples get "Pb-" inserted into the ID prefix, e.g.
//  OVS-2041-Pb-PS01 vs OVS-2041-PS01 for asbestos personal.
//

import SwiftUI
import SwiftData

struct AirSampleFormSheet: View {
    let project: Project
    let sample: AirSample?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var type: SampleType = .area
    @State private var hazardType: HazardType = .asbestos
    @State private var suffix = "01"
    @State private var date = Date.now
    @State private var location = ""
    @State private var containmentName = ""
    @State private var hasStart = false
    @State private var startTime = Date.now
    @State private var hasStop = false
    @State private var stopTime = Date.now
    @State private var startFlowRate = "2.0"
    @State private var stopFlowRate = ""
    @State private var sampleSetId: String? = nil
    @State private var applyToSet = false

    private var isEdit: Bool { sample != nil }

    /// Full ID prefix: "{projectNumber}-{Pb-?}{typePrefix}"
    private var prefix: String {
        "\(project.projectNumber)-\(hazardType.idSegment)\(type.idPrefix)"
    }

    private var elapsedMinutes: Int? {
        guard hasStart, hasStop else { return nil }
        return max(0, Int(stopTime.timeIntervalSince(startTime) / 60))
    }
    private var computedVolume: Int? {
        guard let minutes = elapsedMinutes else { return nil }
        let flows = [Double(startFlowRate), Double(stopFlowRate)].compactMap { $0 }
        guard !flows.isEmpty else { return nil }
        let avg = flows.reduce(0, +) / Double(flows.count)
        return Int((avg * Double(minutes)).rounded())
    }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Air Sample" : "Add Air Sample",
            saveLabel: isEdit ? "Save" : "Add",
            onSave: save
        ) {
            Section {
                Picker("Type", selection: $type) {
                    ForEach(SampleType.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                Picker("Hazard", selection: $hazardType) {
                    ForEach(HazardType.allCases) { Text($0.rawValue).tag($0) }
                }
            }

            Section("Identity") {
                LabeledContent("Sample ID") {
                    HStack(spacing: 2) {
                        Text(prefix)
                            .foregroundStyle(.secondary)
                            .font(.subheadline.monospaced())
                        TextField("01", text: $suffix)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 50)
                    }
                }
                DatePicker("Date", selection: $date, displayedComponents: .date)
                Picker("Containment", selection: $containmentName) {
                    Text("— None —").tag("")
                    ForEach(project.containments) { c in Text(c.name).tag(c.name) }
                }
            }

            Section {
                TextField("e.g. Outside containment, N wall", text: $location)
            } header: { Text("Location") }

            Section {
                Toggle("Sample started", isOn: $hasStart)
                if hasStart {
                    DatePicker("Start time", selection: $startTime, displayedComponents: .hourAndMinute)
                    LabeledContent("Start flow (L/min)") {
                        TextField("2.0", text: $startFlowRate)
                            .decimalKeyboard()
                            .multilineTextAlignment(.trailing)
                    }
                }
                Toggle("Sample stopped", isOn: $hasStop)
                if hasStop {
                    DatePicker("Stop time", selection: $stopTime, displayedComponents: .hourAndMinute)
                    LabeledContent("Stop flow (L/min)") {
                        TextField("2.0", text: $stopFlowRate)
                            .decimalKeyboard()
                            .multilineTextAlignment(.trailing)
                    }
                }
            } header: {
                Text("Times & flow rates")
            } footer: {
                Text("Leave Stop off to mark the sample as running.")
            }

            if type == .clearance {
                Section {
                    if let setId = sampleSetId {
                        let setCount = project.airSamples.filter { $0.sampleSetId == setId && $0.sampleType == .clearance }.count
                        LabeledContent("Sample Set") {
                            Text(String(setId.prefix(12)) + "…")
                                .foregroundStyle(.secondary)
                                .font(.caption.monospaced())
                        }
                        if setCount > 1 {
                            Toggle("Apply times & flow to all \(setCount) in set", isOn: $applyToSet)
                        }
                    } else {
                        Button("Create New Sample Set") {
                            sampleSetId = "set_\(UUID().uuidString.prefix(12).lowercased())"
                        }
                    }
                } header: {
                    Text("Sample Set")
                } footer: {
                    if applyToSet {
                        Text("Start/stop times and flow rates will be copied to all samples in this set.")
                    }
                }
            }

            Section("Calculated") {
                LabeledContent("Elapsed", value: Fmt.minutes(elapsedMinutes))
                LabeledContent("Volume", value: computedVolume.map { "\($0) L" } ?? "—")
            }
        }
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        guard let sample else {
            suffix = String(format: "%02d", nextSequence())
            return
        }
        type = sample.sampleType
        hazardType = sample.hazardType
        date = sample.date
        location = sample.location
        containmentName = sample.containmentName
        if let start = sample.startTime { hasStart = true; startTime = start }
        if let stop = sample.stopTime { hasStop = true; stopTime = stop }
        startFlowRate = sample.startFlowRate.map { String($0) } ?? ""
        stopFlowRate = sample.stopFlowRate.map { String($0) } ?? ""
        sampleSetId = sample.sampleSetId
        // Suffix is everything after the full prefix
        let fullPrefix = "\(project.projectNumber)-\(sample.hazardType.idSegment)\(sample.sampleType.idPrefix)"
        suffix = String(sample.sampleId.dropFirst(fullPrefix.count))
    }

    private func nextSequence() -> Int {
        let p = "\(project.projectNumber)-\(hazardType.idSegment)\(type.idPrefix)"
        var maxN = 0
        for s in project.airSamples where s.sampleId.hasPrefix(p) {
            if let n = Int(s.sampleId.dropFirst(p.count)) { maxN = max(maxN, n) }
        }
        return maxN + 1
    }

    private func save() {
        let sampleId = "\(prefix)\(suffix.isEmpty ? "01" : suffix)"
        let start = hasStart ? startTime : nil
        let stop = hasStop ? stopTime : nil
        let startRate = Double(startFlowRate)
        let stopRate = Double(stopFlowRate)

        if let sample {
            sample.sampleId = sampleId
            sample.sampleType = type
            sample.hazardType = hazardType
            sample.date = date
            sample.location = location
            sample.containmentName = containmentName
            sample.startTime = start
            sample.stopTime = stop
            sample.startFlowRate = startRate
            sample.stopFlowRate = stopRate
            sample.sampleSetId = sampleSetId

            // Apply to set if requested
            if applyToSet, let setId = sampleSetId {
                for peer in project.airSamples where peer.sampleSetId == setId && peer.persistentModelID != sample.persistentModelID {
                    peer.startTime = start
                    peer.stopTime = stop
                    peer.startFlowRate = startRate
                    peer.stopFlowRate = stopRate
                }
            }
            try? modelContext.save()
            appState.showToast(applyToSet ? "Sample + set updated" : "Sample updated")
        } else {
            let newSample = AirSample(
                sampleId: sampleId, sampleType: type, hazardType: hazardType,
                location: location, containmentName: containmentName,
                date: date, startTime: start, stopTime: stop,
                startFlowRate: startRate, stopFlowRate: stopRate,
                sampleSetId: sampleSetId,
                project: project
            )
            modelContext.insert(newSample)
            try? modelContext.save()
            appState.showToast("Sample added")
        }
    }
}
