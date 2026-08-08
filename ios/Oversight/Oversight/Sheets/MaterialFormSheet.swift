//
//  MaterialFormSheet.swift
//  Oversight
//
//  Add material — ported from MaterialSheet in oversight-sheets.jsx.
//

import SwiftUI
import SwiftData

struct MaterialFormSheet: View {
    let project: Project

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var buildingID: PersistentIdentifier?
    @State private var spaceID: PersistentIdentifier?
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit: MaterialUnit = .squareFeet
    @State private var materialType: MaterialType = .surfacing

    private var building: Building? { project.buildings.first { $0.persistentModelID == buildingID } }
    private var space: Space? { building?.spaces.first { $0.persistentModelID == spaceID } }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && space != nil }

    var body: some View {
        SheetScaffold(title: "Add Material", saveLabel: "Add", saveDisabled: !isValid, onSave: save) {
            Section("Location") {
                Picker("Building", selection: $buildingID) {
                    ForEach(project.buildings) { b in Text(b.name).tag(Optional(b.persistentModelID)) }
                }
                .onChange(of: buildingID) { spaceID = building?.spaces.first?.persistentModelID }
                Picker("Space", selection: $spaceID) {
                    ForEach(building?.spaces ?? []) { s in Text(s.name).tag(Optional(s.persistentModelID)) }
                }
            }
            Section("Material") {
                LabeledContent("Name") { TextField("e.g. Pipe Insulation (TSI)", text: $name) }
                LabeledContent("Quantity") { TextField("0", text: $quantity).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                Picker("Unit", selection: $unit) { ForEach(MaterialUnit.allCases) { u in Text(u.rawValue).tag(u) } }
                Picker("Type", selection: $materialType) { ForEach(MaterialType.allCases) { t in Text(t.rawValue).tag(t) } }
            }
        }
        .onAppear {
            buildingID = project.buildings.first?.persistentModelID
            spaceID = project.buildings.first?.spaces.first?.persistentModelID
        }
    }

    private func save() {
        guard let space else { return }
        let material = Material(
            name: name.trimmingCharacters(in: .whitespaces),
            quantity: Double(quantity) ?? 0,
            unit: unit, materialType: materialType, space: space
        )
        modelContext.insert(material)
        try? modelContext.save()
        appState.showToast("Material added")
    }
}
