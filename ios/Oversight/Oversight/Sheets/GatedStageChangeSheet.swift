//
//  GatedStageChangeSheet.swift
//  Oversight
//
//  VI-gated stage transition sheet. Presented automatically when advancing
//  a containment to a stage that requires a visual inspection:
//    Prep → Active: requires a passing Pre-Start VI
//    Active → Clearance: requires a passing Final VI + auto-creates 5 clearance air samples
//  A failing VI is still recorded on the containment but the stage does not advance.
//

import SwiftUI
import SwiftData

struct PendingStageChange: Identifiable {
    let id = UUID()
    let containment: Containment
    let project: Project
    let targetStage: Stage
    let viType: VisualInspectionType
}

struct GatedStageChangeSheet: View {
    let pending: PendingStageChange

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var date = Date.now
    @State private var inspectorName = ""
    @State private var passed = true
    @State private var notes = ""

    private var isValid: Bool { !inspectorName.trimmingCharacters(in: .whitespaces).isEmpty }

    private var sheetTitle: String {
        switch pending.viType {
        case .preStart: return "Pre-Start Inspection"
        case .finalInspection: return "Final Inspection"
        }
    }

    private var stageAdvanceDescription: String {
        switch pending.targetStage {
        case .activeAbatement:
            return "A passing Pre-Start VI is required to advance to Active Abatement."
        case .containmentClearance:
            return "A passing Final VI is required to advance to Clearance. Passing will also auto-create 5 clearance air samples."
        default:
            return "A passing VI is required to advance the stage."
        }
    }

    var body: some View {
        SheetScaffold(
            title: sheetTitle,
            saveLabel: passed ? "Pass — Advance Stage" : "Record Fail",
            saveDisabled: !isValid,
            onSave: save
        ) {
            Section {
                Text(stageAdvanceDescription)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
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
                    .frame(minHeight: 80)
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
            inspectorName = inspectors.first?.name ?? ""
        }
    }

    private func save() {
        let vi = VisualInspection(
            inspectionType: pending.viType,
            date: date,
            inspectorName: inspectorName.trimmingCharacters(in: .whitespaces),
            passed: passed,
            notes: notes,
            containment: pending.containment
        )
        modelContext.insert(vi)

        if passed {
            pending.containment.stage = pending.targetStage
            if pending.targetStage == .containmentClearance {
                autoCreateClearanceSamples()
            }
            try? modelContext.save()
            appState.showToast("Stage advanced to \(pending.targetStage.shortLabel)")
        } else {
            try? modelContext.save()
            appState.showToast("Inspection recorded (failed) — stage unchanged")
        }

        dismiss()
    }

    private func autoCreateClearanceSamples() {
        let project = pending.project
        let containment = pending.containment
        let setId = UUID().uuidString
        let existingClearance = project.airSamples.filter { $0.sampleType == .clearance }.count

        for i in 0..<5 {
            let seq = existingClearance + i + 1
            let seqStr = String(format: "%02d", seq)
            let sampleId = "\(project.projectNumber)-CA\(seqStr)"
            let sample = AirSample(
                sampleId: sampleId,
                sampleType: .clearance,
                hazardType: .asbestos,
                containmentName: containment.name,
                date: Date.now,
                sampleSetId: setId,
                autoCreated: true,
                project: project
            )
            modelContext.insert(sample)
        }
    }
}
