//
//  AirSampleFormSheet.swift
//  Oversight
//
//  Add/edit air sample — ported from SampleSheet in oversight-sheets.jsx.
//  Sample ID prefix (AS/PS/CA) matches getAirSampleTypePrefix() in
//  js/project.js. Leaving Stop time blank marks the sample as running.
//

import SwiftUI
import SwiftData

struct AirSampleFormSheet: View {
    let project: Project
    let sample: AirSample?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var type: SampleType = .area
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

    private var isEdit: Bool { sample != nil }
    private var prefix: String { "\(project.projectNumber)-\(type.idPrefix)" }

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
        SheetScaffold(title: isEdit ? "Edit Air Sample" : "Add Air Sample", saveLabel: isEdit ? "Save" : "Add", onSave: save) {
            Section {
                Picker("Type", selection: $type) {
                    ForEach(SampleType.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Section("Identity") {
                LabeledContent("Sample ID") {
                    HStack(spacing: 2) {
                        Text("\(prefix)").foregroundStyle(.secondary).font(.subheadline.monospaced())
                        TextField("01", text: $suffix).multilineTextAlignment(.trailing).frame(width: 50)
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
                    LabeledContent("Start flow (L/min)") { TextField("2.0", text: $startFlowRate).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                }
                Toggle("Sample stopped", isOn: $hasStop)
                if hasStop {
                    DatePicker("Stop time", selection: $stopTime, displayedComponents: .hourAndMinute)
                    LabeledContent("Stop flow (L/min)") { TextField("2.0", text: $stopFlowRate).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                }
            } header: {
                Text("Times & flow rates")
            } footer: {
                Text("Leave Stop off to mark the sample as running.")
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
        date = sample.date
        location = sample.location
        containmentName = sample.containmentName
        if let start = sample.startTime { hasStart = true; startTime = start }
        if let stop = sample.stopTime { hasStop = true; stopTime = stop }
        startFlowRate = sample.startFlowRate.map { String($0) } ?? ""
        stopFlowRate = sample.stopFlowRate.map { String($0) } ?? ""
        let prefixLen = "\(project.projectNumber)-\(sample.sampleType.idPrefix)".count
        suffix = String(sample.sampleId.dropFirst(prefixLen))
    }

    private func nextSequence() -> Int {
        let p = "\(project.projectNumber)-\(type.idPrefix)"
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
        if let sample {
            sample.sampleId = sampleId
            sample.sampleType = type
            sample.date = date
            sample.location = location
            sample.containmentName = containmentName
            sample.startTime = start
            sample.stopTime = stop
            sample.startFlowRate = Double(startFlowRate)
            sample.stopFlowRate = Double(stopFlowRate)
            try? modelContext.save()
            appState.showToast("Sample updated")
        } else {
            let newSample = AirSample(
                sampleId: sampleId, sampleType: type, location: location, containmentName: containmentName,
                date: date, startTime: start, stopTime: stop,
                startFlowRate: Double(startFlowRate), stopFlowRate: Double(stopFlowRate), project: project
            )
            modelContext.insert(newSample)
            try? modelContext.save()
            appState.showToast("Sample added")
        }
    }
}
