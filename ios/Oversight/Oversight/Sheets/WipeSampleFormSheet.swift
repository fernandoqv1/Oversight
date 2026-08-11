//
//  WipeSampleFormSheet.swift
//  Oversight
//
//  Add/edit a lead wipe sample. sampleId format: {ProjectNumber}-W{Seq},
//  e.g. "PJ001-W01". Mirrors wipe sample fields in the Windows desktop app.
//

import SwiftUI
import SwiftData

struct WipeSampleFormSheet: View {
    let project: Project
    let sample: WipeSample?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var wipeSampleType: WipeSampleType = .clearance
    @State private var containmentName = ""
    @State private var buildingName = ""
    @State private var spaceName = ""
    @State private var substrate = ""
    @State private var component = ""
    @State private var squareFeet = ""
    @State private var locationComment = ""
    @State private var date = Date.now
    @State private var inspectorName = ""
    @State private var notes = ""

    private var isEdit: Bool { sample != nil }
    private var nextSampleId: String {
        let seq = project.wipeSamples.count + 1
        return "\(project.projectNumber)-W\(String(format: "%02d", seq))"
    }
    private var sortedContainments: [String] { project.containments.map(\.name).sorted() }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Wipe Sample" : "New Wipe Sample",
            saveLabel: isEdit ? "Save" : "Add",
            onSave: save
        ) {
            Section("Sample") {
                Picker("Type", selection: $wipeSampleType) {
                    ForEach(WipeSampleType.allCases) { Text($0.rawValue).tag($0) }
                }
                if let s = sample {
                    LabeledContent("Sample ID", value: s.sampleId)
                        .foregroundStyle(.secondary)
                } else {
                    LabeledContent("Sample ID (auto)", value: nextSampleId)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Location") {
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
                LabeledContent("Building") {
                    TextField("Building name", text: $buildingName)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Space / Room") {
                    TextField("Room or area", text: $spaceName)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Substrate") {
                    TextField("e.g. Painted drywall", text: $substrate)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Component") {
                    TextField("e.g. Window sill", text: $component)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Area (ft²)") {
                    TextField("e.g. 100", text: $squareFeet)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.decimalPad)
                }
                LabeledContent("Comment") {
                    TextField("Location notes", text: $locationComment)
                        .multilineTextAlignment(.trailing)
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
            wipeSampleType = s.wipeSampleType
            containmentName = s.containmentName
            buildingName = s.buildingName
            spaceName = s.spaceName
            substrate = s.substrate
            component = s.component
            squareFeet = s.squareFeet > 0 ? String(s.squareFeet) : ""
            locationComment = s.locationComment
            date = s.date
            inspectorName = s.inspectorName
            notes = s.notes
        } else {
            inspectorName = inspectors.first?.name ?? ""
        }
    }

    private func save() {
        let sqft = Double(squareFeet) ?? 0
        if let s = sample {
            s.wipeSampleType = wipeSampleType
            s.containmentName = containmentName
            s.buildingName = buildingName
            s.spaceName = spaceName
            s.substrate = substrate
            s.component = component
            s.squareFeet = sqft
            s.locationComment = locationComment
            s.date = date
            s.inspectorName = inspectorName
            s.notes = notes
            try? modelContext.save()
            appState.showToast("Wipe sample updated")
        } else {
            let seq = project.wipeSamples.count + 1
            let sampleId = "\(project.projectNumber)-W\(String(format: "%02d", seq))"
            let ns = WipeSample(
                sampleId: sampleId,
                wipeSampleType: wipeSampleType,
                containmentName: containmentName,
                buildingName: buildingName,
                spaceName: spaceName,
                substrate: substrate,
                component: component,
                squareFeet: sqft,
                locationComment: locationComment,
                date: date,
                inspectorName: inspectorName,
                notes: notes,
                project: project
            )
            modelContext.insert(ns)
            try? modelContext.save()
            appState.showToast("Wipe sample added")
        }
    }
}
