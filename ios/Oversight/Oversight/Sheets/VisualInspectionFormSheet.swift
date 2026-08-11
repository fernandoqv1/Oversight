//
//  VisualInspectionFormSheet.swift
//  Oversight
//
//  Add/edit a visual inspection on a containment. Mirrors the Pre-Start and
//  Final visual inspection modals in js/project.js (openEditVisualInspectionModal).
//  Pre-Start is required before transitioning to Active Abatement;
//  Final before transitioning to Containment Clearance.
//

import SwiftUI
import SwiftData

struct VisualInspectionFormSheet: View {
    let containment: Containment
    let inspection: VisualInspection?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var inspectionType: VisualInspectionType = .preStart
    @State private var date = Date.now
    @State private var inspectorName = ""
    @State private var passed = true
    @State private var notes = ""

    private var isEdit: Bool { inspection != nil }
    private var isValid: Bool { !inspectorName.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Visual Inspection" : "Visual Inspection",
            saveLabel: isEdit ? "Save" : "Add",
            saveDisabled: !isValid,
            onSave: save
        ) {
            Section {
                Picker("Type", selection: $inspectionType) {
                    ForEach(VisualInspectionType.allCases) { t in Text(t.rawValue).tag(t) }
                }
                DatePicker("Date", selection: $date, displayedComponents: .date)
                LabeledContent("Inspector") {
                    TextField("Inspector name", text: $inspectorName)
                        .multilineTextAlignment(.trailing)
                }
            }

            Section {
                Picker("Result", selection: $passed) {
                    Text("Pass").tag(true)
                    Text("Fail").tag(false)
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Result")
            }

            Section("Notes") {
                TextEditor(text: $notes)
                    .frame(minHeight: max(80, CGFloat(notes.components(separatedBy: "\n").count) * 22 + 16))
                    .overlay(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("Observations, deficiencies noted…")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8).padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
            }
        }
        .onAppear {
            if let i = inspection {
                inspectionType = i.inspectionType
                date = i.date
                inspectorName = i.inspectorName
                passed = i.passed
                notes = i.notes
            } else {
                inspectorName = inspectors.first?.name ?? ""
            }
        }
    }

    private func save() {
        if let i = inspection {
            i.inspectionType = inspectionType
            i.date = date
            i.inspectorName = inspectorName
            i.passed = passed
            i.notes = notes
            try? modelContext.save()
            appState.showToast("Inspection updated")
        } else {
            let vi = VisualInspection(
                inspectionType: inspectionType,
                date: date,
                inspectorName: inspectorName.trimmingCharacters(in: .whitespaces),
                passed: passed,
                notes: notes,
                containment: containment
            )
            modelContext.insert(vi)
            try? modelContext.save()
            appState.showToast("Inspection added")
        }
    }
}
