//
//  ProfileView.swift
//  Oversight
//
//  Profile tab — inspector identity, signature, certifications, default
//  templates, appearance, about, reset demo data. Ported from
//  ProfileScreen in oversight-screens.jsx.
//

import SwiftUI
import SwiftData

struct ProfileView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var inspectors: [Inspector]
    @State private var confirmReset = false

    private var inspector: Inspector {
        if let existing = inspectors.first { return existing }
        let created = Inspector()
        modelContext.insert(created)
        return created
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Text(inspector.initials)
                        .font(.title3.weight(.bold))
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(Color.accentColor.opacity(0.15)))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(inspector.name.isEmpty ? "Add your name" : inspector.name).font(.headline)
                        Text(inspector.license.isEmpty ? "No license on file" : inspector.license)
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Account") {
                row("Inspector details") { appState.present(.inspectorDetails) }
                row("Signature") { appState.present(.signature) }
                row("Certifications") {
                    appState.present(.info(
                        title: "Certifications",
                        body: inspector.certifications.isEmpty ? "No certifications on file yet. Add them from Inspector details." : inspector.certifications
                    ))
                }
                row("Default templates") { appState.present(.defaultTemplates) }
            }

            Section("App") {
                row("Sync & offline") {
                    appState.present(.info(
                        title: "Sync & Offline",
                        body: "Oversight stores every project on this device only — there is no cloud sync. Data persists across app restarts and works fully offline, matching the desktop app."
                    ))
                }
                row("Appearance") { appState.present(.appearance) }
                row("About Oversight") {
                    appState.present(.info(
                        title: "About Oversight",
                        body: "Oversight — asbestos abatement project oversight for field inspectors. iOS companion to the Oversight desktop app."
                    ))
                }
            }

            Section {
                Button("Reset demo data", role: .destructive) { confirmReset = true }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Profile")
        .confirmationDialog("Reset all demo data to the seeded sample projects?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset Demo Data", role: .destructive) {
                SeedData.resetDemoData(modelContext)
                appState.showToast("Demo data reset")
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func row(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label).foregroundStyle(.primary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
        }
    }
}
