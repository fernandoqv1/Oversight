//
//  WorkerFormSheet.swift
//  Oversight
//
//  Add/edit worker — ported from WorkerSheet in oversight-sheets.jsx.
//  Certification fields match desktop worker records: AHERA, Medical,
//  Respirator fit, Lead training, Lead medical.
//

import SwiftUI
import SwiftData

struct WorkerFormSheet: View {
    let project: Project
    let worker: Worker?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var name = ""
    @State private var role: WorkerRole = .worker
    @State private var hasAhera = false
    @State private var aheraExpiration = Date.now
    @State private var hasMedical = false
    @State private var medicalExpiration = Date.now
    @State private var hasRespFit = false
    @State private var respiratorFitExpiration = Date.now
    @State private var hasLead = false
    @State private var leadExpiration = Date.now
    @State private var hasLeadMed = false
    @State private var leadMedExpiration = Date.now
    @State private var respiratorTypes: Set<RespiratorType> = [.halfFace]

    private var isEdit: Bool { worker != nil }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !respiratorTypes.isEmpty }

    var body: some View {
        SheetScaffold(title: isEdit ? "Edit Worker" : "Add Worker", saveLabel: isEdit ? "Save" : "Add", saveDisabled: !isValid, onSave: save) {
            Section {
                LabeledContent("Name") { TextField("Worker name", text: $name) }
                Picker("Role", selection: $role) {
                    ForEach(WorkerRole.allCases) { r in Text("\(r.label) (\(r.rawValue))").tag(r) }
                }
            }
            Section("Certification expirations") {
                expirationRow("AHERA", has: $hasAhera, date: $aheraExpiration)
                expirationRow("Medical", has: $hasMedical, date: $medicalExpiration)
                expirationRow("Respirator fit", has: $hasRespFit, date: $respiratorFitExpiration)
                expirationRow("Lead training", has: $hasLead, date: $leadExpiration)
                expirationRow("Lead medical", has: $hasLeadMed, date: $leadMedExpiration)
            }
            Section("Respirator type") {
                ForEach(RespiratorType.allCases) { r in
                    Button {
                        if respiratorTypes.contains(r) { respiratorTypes.remove(r) } else { respiratorTypes.insert(r) }
                    } label: {
                        HStack {
                            Text(r.rawValue).foregroundStyle(.primary)
                            Spacer()
                            if respiratorTypes.contains(r) { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                        }
                    }
                }
            }
        }
        .onAppear(perform: loadExisting)
    }

    @ViewBuilder
    private func expirationRow(_ label: String, has: Binding<Bool>, date: Binding<Date>) -> some View {
        Toggle(label, isOn: has)
        if has.wrappedValue {
            DatePicker("\(label) date", selection: date, displayedComponents: .date)
                .labelsHidden()
        }
    }

    private func loadExisting() {
        guard let worker else { return }
        name = worker.name
        role = worker.role
        if let d = worker.aheraExpiration { hasAhera = true; aheraExpiration = d }
        if let d = worker.medicalExpiration { hasMedical = true; medicalExpiration = d }
        if let d = worker.respiratorFitExpiration { hasRespFit = true; respiratorFitExpiration = d }
        if let d = worker.leadExpiration { hasLead = true; leadExpiration = d }
        if let d = worker.leadMedExpiration { hasLeadMed = true; leadMedExpiration = d }
        respiratorTypes = Set(worker.respiratorTypes)
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        if let worker {
            worker.name = trimmedName
            worker.role = role
            worker.aheraExpiration = hasAhera ? aheraExpiration : nil
            worker.medicalExpiration = hasMedical ? medicalExpiration : nil
            worker.respiratorFitExpiration = hasRespFit ? respiratorFitExpiration : nil
            worker.leadExpiration = hasLead ? leadExpiration : nil
            worker.leadMedExpiration = hasLeadMed ? leadMedExpiration : nil
            worker.respiratorTypes = Array(respiratorTypes)
            try? modelContext.save()
            appState.showToast("Worker updated")
        } else {
            let newWorker = Worker(
                name: trimmedName, role: role,
                aheraExpiration: hasAhera ? aheraExpiration : nil,
                medicalExpiration: hasMedical ? medicalExpiration : nil,
                respiratorFitExpiration: hasRespFit ? respiratorFitExpiration : nil,
                leadExpiration: hasLead ? leadExpiration : nil,
                leadMedExpiration: hasLeadMed ? leadMedExpiration : nil,
                respiratorTypes: Array(respiratorTypes), project: project
            )
            modelContext.insert(newWorker)
            try? modelContext.save()
            appState.showToast("Worker added")
        }
    }
}
