//
//  MaterialFormSheet.swift
//  Oversight
//
//  Add/edit material — ported from MaterialSheet in oversight-sheets.jsx.
//  Supports both create (material == nil) and edit modes.
//  HMR# and Friable fields match the desktop material edit modal.
//
//  Inline building + space creation: if there are no buildings yet (or the
//  selected building has no spaces), text fields appear so the user can name
//  the new building and/or space without leaving the sheet.
//

import SwiftUI
import SwiftData

struct MaterialFormSheet: View {
    let project: Project
    var material: Material? = nil

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var buildingID: PersistentIdentifier?
    @State private var spaceID: PersistentIdentifier?
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit: MaterialUnit = .squareFeet
    @State private var materialType: MaterialType = .surfacing
    @State private var hmrNumber = ""
    @State private var isFriable = false

    // Inline creation fields
    @State private var newBuildingName = ""
    @State private var newSpaceName = ""
    @State private var showAddBuildingField = false
    @State private var showAddSpaceField = false

    // Existing-material template picker
    @State private var templateName = ""

    private var existingMaterials: [Material] {
        var seen = Set<String>()
        var result: [Material] = []
        for building in project.buildings {
            for space in building.spaces {
                for mat in space.materials {
                    if seen.insert(mat.name).inserted {
                        result.append(mat)
                    }
                }
            }
        }
        return result.sorted { $0.name < $1.name }
    }

    private var isEdit: Bool { material != nil }
    private var building: Building? { project.buildings.first { $0.persistentModelID == buildingID } }
    private var space: Space? { building?.spaces.first { $0.persistentModelID == spaceID } }

    private var isValid: Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty else { return false }
        if space != nil { return true }
        // Allow save when creating a new building + space inline
        let bldgOk = !newBuildingName.trimmingCharacters(in: .whitespaces).isEmpty
        let spaceOk = !newSpaceName.trimmingCharacters(in: .whitespaces).isEmpty
        return bldgOk && spaceOk
    }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Material" : "Add Material",
            saveLabel: isEdit ? "Save" : "Add",
            saveDisabled: !isValid,
            onSave: save
        ) {
            Section("Location") {
                if project.buildings.isEmpty {
                    // No buildings at all — show inline creation fields
                    LabeledContent("New Building") {
                        TextField("Building name", text: $newBuildingName)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("New Space") {
                        TextField("Space name (room/area)", text: $newSpaceName)
                            .multilineTextAlignment(.trailing)
                    }
                } else {
                    // Buildings exist — show picker + optional "Add Building" row
                    Picker("Building", selection: $buildingID) {
                        ForEach(project.buildings) { b in
                            Text(b.name).tag(Optional(b.persistentModelID))
                        }
                    }
                    .onChange(of: buildingID) {
                        spaceID = building?.spaces.first?.persistentModelID
                        // Reset inline fields when switching buildings
                        showAddSpaceField = false
                        newSpaceName = ""
                    }

                    if showAddBuildingField {
                        LabeledContent("New Building") {
                            TextField("Building name", text: $newBuildingName)
                                .multilineTextAlignment(.trailing)
                        }
                        Button("Cancel") {
                            showAddBuildingField = false
                            newBuildingName = ""
                        }
                        .foregroundStyle(.secondary)
                    } else {
                        Button {
                            showAddBuildingField = true
                            newBuildingName = ""
                        } label: {
                            Label("Add Building", systemImage: "plus.circle")
                        }
                    }

                    // Space picker / inline creation
                    let currentSpaces = building?.spaces ?? []
                    if currentSpaces.isEmpty || showAddSpaceField {
                        LabeledContent("New Space") {
                            TextField("Space name (room/area)", text: $newSpaceName)
                                .multilineTextAlignment(.trailing)
                        }
                        if !currentSpaces.isEmpty {
                            Button("Cancel") {
                                showAddSpaceField = false
                                newSpaceName = ""
                                spaceID = currentSpaces.first?.persistentModelID
                            }
                            .foregroundStyle(.secondary)
                        }
                    } else {
                        Picker("Space", selection: $spaceID) {
                            ForEach(currentSpaces) { s in
                                Text(s.name).tag(Optional(s.persistentModelID))
                            }
                        }
                        Button {
                            showAddSpaceField = true
                            newSpaceName = ""
                        } label: {
                            Label("Add Space", systemImage: "plus.circle")
                        }
                    }
                }
            }

            Section("Material") {
                if !existingMaterials.isEmpty && !isEdit {
                    Picker("Based on", selection: $templateName) {
                        Text("— New material —").tag("")
                        ForEach(existingMaterials) { m in
                            Text(m.name).tag(m.name)
                        }
                    }
                    .onChange(of: templateName) {
                        guard !templateName.isEmpty,
                              let template = existingMaterials.first(where: { $0.name == templateName }) else { return }
                        name = template.name
                        unit = template.unit
                        materialType = template.materialType
                        isFriable = template.isFriable
                        hmrNumber = template.hmrNumber
                    }
                }
                LabeledContent("Name") {
                    TextField("e.g. Pipe Insulation (TSI)", text: $name)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Quantity") {
                    TextField("0", text: $quantity)
                        .decimalKeyboard()
                        .multilineTextAlignment(.trailing)
                }
                Picker("Unit", selection: $unit) {
                    ForEach(MaterialUnit.allCases) { u in Text(u.rawValue).tag(u) }
                }
                Picker("Type", selection: $materialType) {
                    ForEach(MaterialType.allCases) { t in Text(t.rawValue).tag(t) }
                }
                Toggle("Friable", isOn: $isFriable)
            }

            Section {
                LabeledContent("HMR #") {
                    TextField("e.g. 01", text: $hmrNumber)
                        .multilineTextAlignment(.trailing)
                }
            } footer: {
                Text("Hazardous materials record number — optional, used for lab tracking.")
            }
        }
        .onAppear {
            if let mat = material {
                name = mat.name
                quantity = mat.quantity == 0 ? "" : String(mat.quantity)
                unit = mat.unit
                materialType = mat.materialType
                hmrNumber = mat.hmrNumber
                isFriable = mat.isFriable
                if let sp = mat.space, let bld = sp.building {
                    buildingID = bld.persistentModelID
                    spaceID = sp.persistentModelID
                }
            } else {
                buildingID = project.buildings.first?.persistentModelID
                spaceID = project.buildings.first?.spaces.first?.persistentModelID
            }
        }
    }

    private func save() {
        let targetSpace: Space

        if showAddBuildingField, !newBuildingName.trimmingCharacters(in: .whitespaces).isEmpty {
            // User is adding a brand-new building alongside an existing one
            let bldgName = newBuildingName.trimmingCharacters(in: .whitespaces)
            let spaceName = newSpaceName.trimmingCharacters(in: .whitespaces)
            guard !spaceName.isEmpty else { return }
            let newBuilding = Building(name: bldgName, project: project)
            modelContext.insert(newBuilding)
            let newSpace = Space(name: spaceName, building: newBuilding)
            modelContext.insert(newSpace)
            targetSpace = newSpace
        } else if let existing = space, !showAddSpaceField {
            // Fully existing building + space
            targetSpace = existing
        } else if let currentBuilding = building, showAddSpaceField {
            // Existing building, new space
            let spaceName = newSpaceName.trimmingCharacters(in: .whitespaces)
            guard !spaceName.isEmpty else { return }
            let newSpace = Space(name: spaceName, building: currentBuilding)
            modelContext.insert(newSpace)
            targetSpace = newSpace
        } else {
            // No buildings at all — create both from inline fields
            let bldgName = newBuildingName.trimmingCharacters(in: .whitespaces)
            let spaceName = newSpaceName.trimmingCharacters(in: .whitespaces)
            guard !bldgName.isEmpty, !spaceName.isEmpty else { return }
            let newBuilding = Building(name: bldgName, project: project)
            modelContext.insert(newBuilding)
            let newSpace = Space(name: spaceName, building: newBuilding)
            modelContext.insert(newSpace)
            targetSpace = newSpace
        }

        if let mat = material {
            mat.name = name.trimmingCharacters(in: .whitespaces)
            mat.quantity = Double(quantity) ?? 0
            mat.unit = unit
            mat.materialType = materialType
            mat.hmrNumber = hmrNumber
            mat.isFriable = isFriable
            if mat.space?.persistentModelID != targetSpace.persistentModelID {
                mat.space = targetSpace
            }
            try? modelContext.save()
            appState.showToast("Material updated")
        } else {
            let newMat = Material(
                name: name.trimmingCharacters(in: .whitespaces),
                quantity: Double(quantity) ?? 0,
                unit: unit, materialType: materialType,
                hmrNumber: hmrNumber, isFriable: isFriable,
                space: targetSpace
            )
            modelContext.insert(newMat)
            try? modelContext.save()
            appState.showToast("Material added")
        }
    }
}
