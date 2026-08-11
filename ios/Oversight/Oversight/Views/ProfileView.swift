//
//  ProfileView.swift
//  Oversight
//
//  Profile tab — inspector identity, signature, certification number, default
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
    @State private var confirmErase = false

    var body: some View {
        let inspector = inspectors.first

        List {
            Section {
                HStack(spacing: 12) {
                    Text(inspector?.initials ?? "?")
                        .font(.title3.weight(.bold))
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(Color.accentColor.opacity(0.15)))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(inspector?.name.isEmpty ?? true ? "Add your name" : inspector!.name)
                            .font(.headline)
                        Text(inspector?.company.isEmpty ?? true ? "No company on file" : inspector!.company)
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Account") {
                row("Inspector Profile") { appState.present(.inspectorDetails) }
                row("Certification #") {
                    appState.present(.info(
                        title: "Certification #",
                        body: inspector?.certificationNumber.isEmpty ?? true
                            ? "No certification number on file. Add it from Inspector Profile."
                            : inspector!.certificationNumber
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
                Button("Erase all data", role: .destructive) { confirmErase = true }
            }
        }
        .groupedListStyle()
        .navigationTitle("Profile")
        .confirmationDialog("Reset all demo data to the seeded sample projects?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset Demo Data", role: .destructive) {
                SeedData.resetDemoData(modelContext)
                appState.showToast("Demo data reset")
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("This will permanently delete all projects, your inspector profile, signature, and certifications. The app will return to a blank first-launch state.", isPresented: $confirmErase, titleVisibility: .visible) {
            Button("Erase Everything", role: .destructive) {
                eraseAllData()
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func eraseAllData() {
        for project in (try? modelContext.fetch(FetchDescriptor<Project>())) ?? [] {
            modelContext.delete(project)
        }
        for inspector in (try? modelContext.fetch(FetchDescriptor<Inspector>())) ?? [] {
            modelContext.delete(inspector)
        }
        try? modelContext.save()
        appState.showToast("All data erased")
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
