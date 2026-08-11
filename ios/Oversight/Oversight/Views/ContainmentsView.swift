//
//  ContainmentsView.swift
//  Oversight
//
//  Containment cards with Set stage, Edit, Delete, and Visual Inspection
//  management. Mirrors the Containments tab in js/project.js.
//

import SwiftUI
import SwiftData

struct ContainmentsView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var stageMenuFor: Containment?
    @State private var deleteConfirmFor: Containment?
    @State private var deleteVIConfirmFor: VisualInspection?
    @State private var pendingStageChange: PendingStageChange?

    var body: some View {
        List {
            Section("\(project.containments.count) containment\(project.containments.count == 1 ? "" : "s")") {
                if project.containments.isEmpty {
                    EmptyStateView(
                        title: "No containments",
                        subtitle: "Add the first work area.",
                        actionLabel: "Add containment"
                    ) {
                        appState.present(.newContainment(project))
                    }
                } else {
                    ForEach(project.containments) { containment in
                        containmentCard(containment)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteConfirmFor = containment
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button {
                                    appState.present(.editContainment(project, containment))
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }

                        // Visual inspection rows for this containment
                        let sortedVIs = containment.visualInspections.sorted { $0.date < $1.date }
                        ForEach(sortedVIs) { vi in
                            viRow(vi, containment: containment)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        deleteVIConfirmFor = vi
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                    Button {
                                        appState.present(.editVisualInspection(containment, vi))
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(.blue)
                                }
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Containments")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { appState.present(.newContainment(project)) } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .confirmationDialog(
            stageMenuFor.map { "\($0.name) Containment — set stage" } ?? "",
            isPresented: Binding(get: { stageMenuFor != nil }, set: { if !$0 { stageMenuFor = nil } }),
            titleVisibility: .visible
        ) {
            if let containment = stageMenuFor {
                ForEach(Stage.allCases) { stage in
                    Button(stage.rawValue) {
                        stageMenuFor = nil
                        handleStageChange(containment: containment, targetStage: stage)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(item: $pendingStageChange) { pending in
            GatedStageChangeSheet(pending: pending)
        }
        .confirmationDialog(
            "Delete \(deleteConfirmFor?.name ?? "") Containment?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Containment", role: .destructive) {
                if let c = deleteConfirmFor {
                    modelContext.delete(c)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete this visual inspection?",
            isPresented: Binding(get: { deleteVIConfirmFor != nil }, set: { if !$0 { deleteVIConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Inspection", role: .destructive) {
                if let vi = deleteVIConfirmFor {
                    modelContext.delete(vi)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func handleStageChange(containment: Containment, targetStage: Stage) {
        // Prep → Active requires Pre-Start VI
        if containment.stage == .containmentPreparation && targetStage == .activeAbatement {
            pendingStageChange = PendingStageChange(
                containment: containment, project: project,
                targetStage: targetStage, viType: .preStart
            )
            return
        }
        // Active → Clearance requires Final VI + auto-creates clearance air samples
        if containment.stage == .activeAbatement && targetStage == .containmentClearance {
            pendingStageChange = PendingStageChange(
                containment: containment, project: project,
                targetStage: targetStage, viType: .finalInspection
            )
            return
        }
        // All other stage changes apply directly
        containment.stage = targetStage
        try? modelContext.save()
    }

    private func containmentCard(_ containment: Containment) -> some View {
        let sampleCount = project.airSamples.filter { $0.containmentName == containment.name }.count
        let viCount = containment.visualInspections.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(containment.name + " Containment")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                StageBadge(stage: containment.stage)
            }
            Label(
                "\(containment.buildingName) · \(containment.spaceNames.count) space\(containment.spaceNames.count == 1 ? "" : "s")",
                systemImage: "building.2"
            )
            .font(.caption).foregroundStyle(.secondary)

            HStack {
                Label("\(sampleCount) sample\(sampleCount == 1 ? "" : "s")", systemImage: "aqi.medium")
                    .font(.caption.weight(.medium))
                if viCount > 0 {
                    Label("\(viCount) inspection\(viCount == 1 ? "" : "s")", systemImage: "checkmark.seal")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Set stage") { stageMenuFor = containment }
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(.vertical, 4)
    }

    private func viRow(_ vi: VisualInspection, containment: Containment) -> some View {
        Button {
            appState.present(.editVisualInspection(containment, vi))
        } label: {
            HStack(spacing: 10) {
                Image(systemName: vi.passed ? "checkmark.seal.fill" : "xmark.seal.fill")
                    .foregroundStyle(vi.passed ? .green : .red)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(vi.inspectionType.rawValue)
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Text(vi.passed ? "Pass" : "Fail")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(vi.passed ? .green : .red)
                    }
                    HStack {
                        Text(vi.inspectorName).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Text(Fmt.date(vi.date)).font(.caption).foregroundStyle(.secondary)
                    }
                    if !vi.notes.isEmpty {
                        Text(vi.notes)
                            .font(.caption2).foregroundStyle(.tertiary)
                            .lineLimit(2)
                    }
                }
            }
            .padding(.leading, 16)
        }
        .foregroundStyle(.primary)
    }
}
