//
//  EditMaterialByNameSheet.swift
//  Oversight
//

import SwiftUI
import SwiftData

struct EditMaterialByNameSheet: View {
    let project: Project
    let originalName: String

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var newName = ""

    private var allInstances: [Material] {
        project.buildings
            .flatMap { $0.spaces }
            .flatMap { $0.materials }
            .filter { $0.name == originalName }
    }

    private var totalQuantity: Double {
        allInstances.reduce(0) { $0 + $1.quantity }
    }

    private var firstUnit: MaterialUnit {
        allInstances.first?.unit ?? .squareFeet
    }

    var body: some View {
        SheetScaffold(
            title: "Edit Material",
            saveLabel: "Rename",
            saveDisabled: newName.trimmingCharacters(in: .whitespaces).isEmpty || newName == originalName,
            onSave: renameAll
        ) {
            Section("Material Name") {
                LabeledContent("Name") {
                    TextField(originalName, text: $newName)
                        .multilineTextAlignment(.trailing)
                }
            }

            Section {
                LabeledContent("Total Quantity") {
                    Text("\(totalQuantity.formatted()) \(firstUnit.rawValue)")
                        .foregroundStyle(.secondary)
                }
            } footer: {
                Text("Renaming will update this material across all \(allInstances.count) space\(allInstances.count == 1 ? "" : "s").")
            }

            if !allInstances.isEmpty {
                Section("Locations") {
                    ForEach(allInstances) { material in
                        Button {
                            appState.present(.editMaterial(project, material))
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(material.space?.name ?? "Unknown space")
                                        .font(.subheadline).foregroundStyle(.primary)
                                    Text(material.space?.building?.name ?? "")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(material.quantity.formatted()) \(material.unit.rawValue)")
                                    .font(.caption.weight(.medium)).foregroundStyle(.secondary)
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
                    Label("Add to another space", systemImage: "plus.circle")
                }
            }
        }
        .onAppear {
            newName = originalName
        }
    }

    private func renameAll() {
        let trimmed = newName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed != originalName else { return }
        for mat in allInstances {
            mat.name = trimmed
        }
        try? modelContext.save()
        appState.showToast("Renamed to \"\(trimmed)\"")
    }
}
