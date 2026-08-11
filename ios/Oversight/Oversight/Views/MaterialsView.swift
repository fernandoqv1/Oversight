//
//  MaterialsView.swift
//  Oversight
//
//  Materials grouped by Building → Space. Tap to edit, swipe to delete.
//  Shows friable flag and HMR# when present. Mirrors Materials & Spaces
//  tab in js/project.js.
//

import SwiftUI
import SwiftData

struct MaterialsView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteConfirmFor: Material?

    // Add Building alert
    @State private var showAddBuilding = false
    @State private var newBuildingName = ""

    // Add Space sheet
    @State private var showAddSpace = false
    @State private var addSpaceBuildingID: PersistentIdentifier? = nil
    @State private var addSpaceName = ""
    @State private var addSpaceNewBuildingName = ""

    private struct MaterialTotal: Identifiable {
        var id: String { name }
        let name: String
        let total: Double
        let unit: MaterialUnit
        let type: MaterialType
        let isFriable: Bool
        let spaceCount: Int
    }

    private var materialTotals: [MaterialTotal] {
        var groups: [String: (total: Double, unit: MaterialUnit, type: MaterialType, isFriable: Bool, spaces: Int)] = [:]
        for building in project.buildings {
            for space in building.spaces {
                for material in space.materials {
                    var entry = groups[material.name] ?? (0, material.unit, material.materialType, material.isFriable, 0)
                    entry.total += material.quantity
                    entry.spaces += 1
                    groups[material.name] = entry
                }
            }
        }
        return groups.map { key, val in
            MaterialTotal(name: key, total: val.total, unit: val.unit, type: val.type, isFriable: val.isFriable, spaceCount: val.spaces)
        }.sorted { $0.name < $1.name }
    }

    var body: some View {
        List {
            // Materials section (formerly "Project Totals") — now at top
            if !materialTotals.isEmpty {
                Section {
                    ForEach(materialTotals) { total in
                        Button {
                            appState.present(.editMaterialByName(project, total.name))
                        } label: {
                            materialTotalRow(total)
                        }
                        .foregroundStyle(.primary)
                    }
                } header: {
                    Label("Materials", systemImage: "sum")
                }
            }

            // Header / empty state section
            Section("\(project.totalMaterialsCount) material\(project.totalMaterialsCount == 1 ? "" : "s") · \(project.buildings.count) building\(project.buildings.count == 1 ? "" : "s")") {
                if project.totalMaterialsCount == 0 {
                    EmptyStateView(
                        title: "No materials",
                        subtitle: "Add ACM by space.",
                        actionLabel: "Add material"
                    ) {
                        appState.present(.newMaterial(project))
                    }
                }
            }

            // Buildings with spaces below
            ForEach(project.buildings) { building in
                Section {
                    ForEach(building.spaces) { space in
                        if !space.materials.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(space.name)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .onTapGesture {
                                        appState.present(.editSpace(project, space))
                                    }
                                ForEach(space.materials) { material in
                                    Button {
                                        appState.present(.editMaterial(project, material))
                                    } label: {
                                        materialRow(material)
                                    }
                                    .foregroundStyle(.primary)
                                    .contextMenu {
                                        if !material.hmrNumber.isEmpty {
                                            Button {
                                                appState.present(.newBulkSample(project))
                                            } label: {
                                                Label("New Bulk Sample", systemImage: "doc.text.magnifyingglass")
                                            }
                                        }
                                        Button {
                                            appState.present(.editMaterial(project, material))
                                        } label: {
                                            Label("Edit", systemImage: "pencil")
                                        }
                                        Button(role: .destructive) {
                                            deleteConfirmFor = material
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button(role: .destructive) {
                                            deleteConfirmFor = material
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                        Button {
                                            appState.present(.editMaterial(project, material))
                                        } label: {
                                            Label("Edit", systemImage: "pencil")
                                        }
                                        .tint(.blue)
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                } header: {
                    Label(building.name, systemImage: "building.2")
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Materials & Spaces")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        appState.present(.newMaterial(project))
                    } label: {
                        Label("Add Material", systemImage: "plus.circle")
                    }
                    Button {
                        addSpaceName = ""
                        addSpaceNewBuildingName = ""
                        addSpaceBuildingID = project.buildings.first?.persistentModelID
                        showAddSpace = true
                    } label: {
                        Label("Add Space", systemImage: "square.stack.3d.up")
                    }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddSpace) {
            NavigationStack {
                Form {
                    Section("Building") {
                        if !project.buildings.isEmpty {
                            Picker("Building", selection: $addSpaceBuildingID) {
                                Text("New Building…").tag(Optional<PersistentIdentifier>.none)
                                ForEach(project.buildings) { b in
                                    Text(b.name).tag(Optional(b.persistentModelID))
                                }
                            }
                        }
                        if addSpaceBuildingID == nil {
                            TextField("Building name", text: $addSpaceNewBuildingName)
                        }
                    }
                    Section("Space") {
                        TextField("Space name (room/area)", text: $addSpaceName)
                    }
                }
                .navigationTitle("Add Space")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showAddSpace = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { saveNewSpace() }
                            .disabled(addSpaceName.trimmingCharacters(in: .whitespaces).isEmpty ||
                                      (addSpaceBuildingID == nil && addSpaceNewBuildingName.trimmingCharacters(in: .whitespaces).isEmpty))
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete \(deleteConfirmFor?.name ?? "")?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Material", role: .destructive) {
                if let m = deleteConfirmFor {
                    modelContext.delete(m)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func saveNewSpace() {
        let spaceName = addSpaceName.trimmingCharacters(in: .whitespaces)
        guard !spaceName.isEmpty else { return }
        let targetBuilding: Building
        if let bid = addSpaceBuildingID,
           let existing = project.buildings.first(where: { $0.persistentModelID == bid }) {
            targetBuilding = existing
        } else {
            let bName = addSpaceNewBuildingName.trimmingCharacters(in: .whitespaces)
            guard !bName.isEmpty else { return }
            targetBuilding = Building(name: bName, project: project)
            modelContext.insert(targetBuilding)
        }
        let newSpace = Space(name: spaceName, building: targetBuilding)
        modelContext.insert(newSpace)
        try? modelContext.save()
        appState.showToast("Space added")
        showAddSpace = false
    }

    private func materialTotalRow(_ total: MaterialTotal) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(total.name).font(.subheadline)
                    if total.isFriable {
                        Text("Friable")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color.red.opacity(0.12), in: Capsule())
                            .foregroundStyle(.red)
                    }
                }
                Text("\(total.type.rawValue) · \(total.spaceCount) space\(total.spaceCount == 1 ? "" : "s")")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(total.total.formatted()) \(total.unit.rawValue)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
        }
    }

    private func materialRow(_ material: Material) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(material.name).font(.subheadline)
                    if material.isFriable {
                        Text("Friable")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color.red.opacity(0.12), in: Capsule())
                            .foregroundStyle(.red)
                    }
                }
                if !material.hmrNumber.isEmpty {
                    Text("HMR# \(material.hmrNumber)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text("\(material.quantity.formatted()) \(material.unit.rawValue) · \(material.materialType.rawValue)")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}
