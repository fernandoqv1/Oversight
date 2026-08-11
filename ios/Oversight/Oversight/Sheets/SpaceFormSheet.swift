//
//  SpaceFormSheet.swift
//  Oversight
//

import SwiftUI
import SwiftData

struct SpaceFormSheet: View {
    let project: Project
    let space: Space

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var spaceName = ""

    var body: some View {
        SheetScaffold(
            title: "Edit Space",
            saveLabel: "Save",
            saveDisabled: spaceName.trimmingCharacters(in: .whitespaces).isEmpty,
            onSave: save
        ) {
            Section("Space") {
                LabeledContent("Name") {
                    TextField("Space name", text: $spaceName)
                        .multilineTextAlignment(.trailing)
                }
            }

            if !space.materials.isEmpty {
                Section("Materials in this space") {
                    ForEach(space.materials) { material in
                        Button {
                            appState.present(.editMaterial(project, material))
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(material.name).font(.subheadline).foregroundStyle(.primary)
                                    Text(material.materialType.rawValue).font(.caption2).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(material.quantity.formatted()) \(material.unit.rawValue)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }

            Section {
                Button {
                    appState.present(.newMaterial(project))
                } label: {
                    Label("Add Material to Space", systemImage: "plus.circle")
                }
            }
        }
        .onAppear {
            spaceName = space.name
        }
    }

    private func save() {
        let trimmed = spaceName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        space.name = trimmed
        try? modelContext.save()
        appState.showToast("Space updated")
    }
}
