//
//  BulkSampleFormSheet.swift
//  Oversight
//
//  Add/edit a bulk material sample. sampleId format: {HMR#}{Letter},
//  e.g. "01A". Mirrors bulk sample fields in the Windows desktop app.
//

import SwiftUI
import SwiftData

struct BulkSampleFormSheet: View {
    let project: Project
    let sample: BulkSample?
    var prefilledMaterialName: String? = nil
    var prefilledHmrNumber: String? = nil

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var hmrNumber = ""
    @State private var sampleLetter = "A"
    @State private var materialName = ""
    @State private var location = ""
    @State private var containmentName = ""
    @State private var hazardType: HazardType = .asbestos
    @State private var analysisType: BulkAnalysisType = .plm
    @State private var date = Date.now
    @State private var inspectorName = ""
    @State private var notes = ""

    private var isEdit: Bool { sample != nil }
    private var sampleId: String { "\(hmrNumber)\(sampleLetter)" }
    private var isValid: Bool {
        !hmrNumber.trimmingCharacters(in: .whitespaces).isEmpty &&
        !sampleLetter.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private let letters = ["A","B","C","D","E","F","G","H","I","J"]
    private var sortedContainments: [String] {
        project.containments.map(\.name).sorted()
    }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Bulk Sample" : "New Bulk Sample",
            saveLabel: isEdit ? "Save" : "Add",
            saveDisabled: !isValid,
            onSave: save
        ) {
            Section("Sample ID") {
                LabeledContent("HMR Number") {
                    TextField("e.g. 01", text: $hmrNumber)
                        .multilineTextAlignment(.trailing)
                }
                Picker("Sample Letter", selection: $sampleLetter) {
                    ForEach(letters, id: \.self) { Text($0).tag($0) }
                }
                LabeledContent("Sample ID", value: sampleId)
                    .foregroundStyle(.secondary)
            }

            Section("Sample Details") {
                LabeledContent("Material") {
                    TextField("e.g. Floor tile mastic", text: $materialName)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Location") {
                    TextField("Room / area", text: $location)
                        .multilineTextAlignment(.trailing)
                }
                if sortedContainments.isEmpty {
                    LabeledContent("Containment") {
                        TextField("Containment name", text: $containmentName)
                            .multilineTextAlignment(.trailing)
                    }
                } else {
                    Picker("Containment", selection: $containmentName) {
                        Text("None").tag("")
                        ForEach(sortedContainments, id: \.self) { Text($0).tag($0) }
                    }
                }
            }

            Section("Analysis") {
                Picker("Hazard", selection: $hazardType) {
                    ForEach(HazardType.allCases) { Text($0.rawValue).tag($0) }
                }
                Picker("Method", selection: $analysisType) {
                    ForEach(BulkAnalysisType.allCases) { Text($0.rawValue).tag($0) }
                }
            }

            Section("Collection") {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                LabeledContent("Inspector") {
                    TextField("Inspector name", text: $inspectorName)
                        .multilineTextAlignment(.trailing)
                }
            }

            Section("Notes") {
                TextEditor(text: $notes)
                    .frame(minHeight: 80)
                    .overlay(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("Lab results, observations…")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8).padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
            }
        }
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        if let s = sample {
            hmrNumber = s.hmrNumber
            // Try to split ID into hmr + letter
            if !s.sampleId.isEmpty {
                let last = String(s.sampleId.suffix(1))
                if letters.contains(last) {
                    hmrNumber = String(s.sampleId.dropLast())
                    sampleLetter = last
                }
            }
            materialName = s.materialName
            location = s.location
            containmentName = s.containmentName
            hazardType = s.hazardType
            analysisType = s.analysisType
            date = s.date
            inspectorName = s.inspectorName
            notes = s.notes
        } else {
            inspectorName = inspectors.first?.name ?? ""
            // Auto-assign next HMR number
            let existing = project.bulkSamples.compactMap { Int($0.hmrNumber) }.max() ?? 0
            hmrNumber = String(format: "%02d", existing + 1)
            // Apply prefilled values if provided
            if let m = prefilledMaterialName { materialName = m }
            if let h = prefilledHmrNumber { hmrNumber = h }
        }
    }

    private func save() {
        if let s = sample {
            s.sampleId = sampleId
            s.hmrNumber = hmrNumber
            s.materialName = materialName
            s.location = location
            s.containmentName = containmentName
            s.hazardType = hazardType
            s.analysisType = analysisType
            s.date = date
            s.inspectorName = inspectorName
            s.notes = notes
            try? modelContext.save()
            appState.showToast("Bulk sample updated")
        } else {
            let ns = BulkSample(
                sampleId: sampleId,
                materialName: materialName,
                hmrNumber: hmrNumber,
                location: location,
                containmentName: containmentName,
                hazardType: hazardType,
                analysisType: analysisType,
                date: date,
                inspectorName: inspectorName,
                notes: notes,
                project: project
            )
            modelContext.insert(ns)
            try? modelContext.save()
            appState.showToast("Bulk sample added")
        }
    }
}
