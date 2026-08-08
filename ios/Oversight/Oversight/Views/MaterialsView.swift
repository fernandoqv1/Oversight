//
//  MaterialsView.swift
//  Oversight
//
//  Ported from MaterialsScreen in oversight-screens.jsx — materials
//  grouped by building → space.
//

import SwiftUI
import SwiftData

struct MaterialsView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            Section("\(project.totalMaterialsCount) material\(project.totalMaterialsCount == 1 ? "" : "s") · \(project.buildings.count) building(s)") {
                if project.totalMaterialsCount == 0 {
                    EmptyStateView(title: "No materials", subtitle: "Add ACM by space.", actionLabel: "Add material") {
                        appState.present(.newMaterial(project))
                    }
                }
            }
            ForEach(project.buildings) { building in
                Section {
                    ForEach(building.spaces) { space in
                        if !space.materials.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(space.name).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                ForEach(space.materials) { material in
                                    HStack {
                                        Text(material.name).font(.subheadline)
                                        Spacer()
                                        Text("\(material.quantity.formatted()) \(material.unit.rawValue) · \(material.materialType.rawValue)")
                                            .font(.caption).foregroundStyle(.secondary)
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
        .listStyle(.insetGrouped)
        .navigationTitle("Materials")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { appState.present(.newMaterial(project)) } label: { Image(systemName: "plus") }
            }
        }
    }
}
