//
//  ContainmentFormSheet.swift
//  Oversight
//
//  Add containment — ported from ContainmentSheet in oversight-sheets.jsx.
//

import SwiftUI
import SwiftData

struct ContainmentFormSheet: View {
    let project: Project

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var name = ""
    @State private var buildingID: PersistentIdentifier?
    @State private var stage: Stage = .containmentPreparation
    @State private var selectedSpaceNames: Set<String> = []

    private var building: Building? {
        project.buildings.first { $0.persistentModelID == buildingID }
    }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && building != nil }

    var body: some View {
        SheetScaffold(title: "Add Containment", saveLabel: "Add", saveDisabled: !isValid, onSave: save) {
            Section {
                LabeledContent("Name") { TextField("e.g. North, Boiler Room", text: $name) }
                Picker("Building", selection: $buildingID) {
                    ForEach(project.buildings) { b in Text(b.name).tag(Optional(b.persistentModelID)) }
                }
                Picker("Stage", selection: $stage) {
                    ForEach(Stage.allCases) { s in Text(s.rawValue).tag(s) }
                }
            } footer: {
                Text("The “Containment” suffix is added automatically in documents.")
            }

            Section("Spaces" + (building?.spaces.isEmpty ?? true ? " — none in this building" : "")) {
                ForEach(building?.spaces ?? []) { space in
                    Button {
                        if selectedSpaceNames.contains(space.name) { selectedSpaceNames.remove(space.name) }
                        else { selectedSpaceNames.insert(space.name) }
                    } label: {
                        HStack {
                            Image(systemName: selectedSpaceNames.contains(space.name) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(selectedSpaceNames.contains(space.name) ? Color.accentColor : .secondary)
                            VStack(alignment: .leading) {
                                Text(space.name).foregroundStyle(.primary)
                                Text("\(space.materials.count) material(s)").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            if buildingID == nil { buildingID = project.buildings.first?.persistentModelID }
        }
    }

    private func save() {
        guard let building else { return }
        let containment = Containment(
            name: name.trimmingCharacters(in: .whitespaces),
            buildingName: building.name,
            stage: stage,
            spaceNames: Array(selectedSpaceNames),
            project: project
        )
        modelContext.insert(containment)
        try? modelContext.save()
        appState.showToast("Containment added")
    }
}
