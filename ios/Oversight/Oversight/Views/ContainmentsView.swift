//
//  ContainmentsView.swift
//  Oversight
//
//  Ported from ContainmentsScreen in oversight-screens.jsx — containment
//  cards with a "Set stage" action advancing through the five stages.
//

import SwiftUI
import SwiftData

struct ContainmentsView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var stageMenuFor: Containment?

    var body: some View {
        List {
            Section("\(project.containments.count) containment\(project.containments.count == 1 ? "" : "s")") {
                if project.containments.isEmpty {
                    EmptyStateView(title: "No containments", subtitle: "Add the first work area.", actionLabel: "Add containment") {
                        appState.present(.newContainment(project))
                    }
                } else {
                    ForEach(project.containments) { containment in
                        containmentCard(containment)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Containments")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { appState.present(.newContainment(project)) } label: { Image(systemName: "plus") }
            }
        }
        .confirmationDialog(
            stageMenuFor.map { "\($0.name) — set stage" } ?? "",
            isPresented: Binding(get: { stageMenuFor != nil }, set: { if !$0 { stageMenuFor = nil } }),
            titleVisibility: .visible
        ) {
            if let containment = stageMenuFor {
                ForEach(Stage.allCases) { stage in
                    Button(stage.rawValue) {
                        containment.stage = stage
                        try? modelContext.save()
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func containmentCard(_ containment: Containment) -> some View {
        let sampleCount = project.airSamples.filter { $0.containmentName == containment.name }.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(containment.name).font(.subheadline.weight(.semibold))
                Spacer()
                StageBadge(stage: containment.stage)
            }
            Label("\(containment.buildingName) · \(containment.spaceNames.count) space(s)", systemImage: "building.2")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Label("\(sampleCount) samples", systemImage: "aqi.medium")
                    .font(.caption.weight(.medium))
                Spacer()
                Button("Set stage") { stageMenuFor = containment }
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(.vertical, 4)
    }
}
