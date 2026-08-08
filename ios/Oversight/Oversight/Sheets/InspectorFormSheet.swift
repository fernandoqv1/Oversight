//
//  InspectorFormSheet.swift
//  Oversight
//
//  Inspector details — ported from InspectorSheet in oversight-sheets.jsx.
//

import SwiftUI
import SwiftData

struct InspectorFormSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var name = ""
    @State private var license = ""
    @State private var certifications = ""

    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        SheetScaffold(title: "Inspector Details", saveDisabled: !isValid, onSave: save) {
            Section("Identity") {
                LabeledContent("Name") { TextField("Full name", text: $name) }
                LabeledContent("License") { TextField("e.g. CAC #00-0000", text: $license) }
            }
            Section {
                TextEditor(text: $certifications).frame(minHeight: 100)
            } header: {
                Text("Certifications")
            } footer: {
                Text("Free text — e.g. AHERA Building Inspector, Contractor/Supervisor, Project Designer.")
            }
        }
        .onAppear {
            if let existing = inspectors.first {
                name = existing.name
                license = existing.license
                certifications = existing.certifications
            }
        }
    }

    private func save() {
        let inspector = inspectors.first ?? {
            let created = Inspector()
            modelContext.insert(created)
            return created
        }()
        inspector.name = name.trimmingCharacters(in: .whitespaces)
        inspector.license = license
        inspector.certifications = certifications
        try? modelContext.save()
        appState.showToast("Profile updated")
    }
}
