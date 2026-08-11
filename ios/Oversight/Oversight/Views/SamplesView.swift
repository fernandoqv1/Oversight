//
//  SamplesView.swift
//  Oversight
//
//  Combined samples view with tab-bar selector for Air, Bulk, and Wipe
//  sample types. Mirrors the Samples section of the Windows desktop app
//  which tracks all three sample types per project.
//

import SwiftUI
import SwiftData

struct SamplesView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState

    enum SampleTab: String, CaseIterable, Identifiable {
        case air = "Air"
        case bulk = "Bulk"
        case wipe = "Wipe"
        var id: String { rawValue }
    }

    @State private var selectedTab: SampleTab = .air

    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample type", selection: $selectedTab) {
                ForEach(SampleTab.allCases) { tab in
                    Text(tabLabel(tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            switch selectedTab {
            case .air:
                AirSamplesView(project: project)
            case .bulk:
                BulkSamplesView(project: project)
            case .wipe:
                WipeSamplesView(project: project)
            }
        }
        .navigationTitle("Samples")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                addButton
            }
        }
    }

    private func tabLabel(_ tab: SampleTab) -> String {
        switch tab {
        case .air: return "Air (\(project.airSamples.count))"
        case .bulk: return "Bulk (\(project.bulkSamples.count))"
        case .wipe: return "Wipe (\(project.wipeSamples.count))"
        }
    }

    @ViewBuilder
    private var addButton: some View {
        switch selectedTab {
        case .air:
            Button { appState.present(.newSample(project)) } label: { Image(systemName: "plus") }
        case .bulk:
            Button { appState.present(.newBulkSample(project)) } label: { Image(systemName: "plus") }
        case .wipe:
            Button { appState.present(.newWipeSample(project)) } label: { Image(systemName: "plus") }
        }
    }
}

// MARK: - Bulk Samples

struct BulkSamplesView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteConfirmFor: BulkSample?

    private var sorted: [BulkSample] {
        project.bulkSamples.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section("\(project.bulkSamples.count) bulk sample\(project.bulkSamples.count == 1 ? "" : "s")") {
                if sorted.isEmpty {
                    EmptyStateView(
                        title: "No bulk samples",
                        subtitle: "Tap + to add a bulk material sample.",
                        actionLabel: "Add Bulk Sample"
                    ) {
                        appState.present(.newBulkSample(project))
                    }
                } else {
                    ForEach(sorted) { s in
                        bulkRow(s)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) { deleteConfirmFor = s } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { appState.present(.editBulkSample(project, s)) } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                }
            }
        }
        .listStyle(.plain)
        .confirmationDialog(
            "Delete bulk sample \(deleteConfirmFor?.sampleId ?? "")?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Sample", role: .destructive) {
                if let s = deleteConfirmFor { modelContext.delete(s); try? modelContext.save() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func bulkRow(_ s: BulkSample) -> some View {
        Button { appState.present(.editBulkSample(project, s)) } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(s.sampleId).font(.subheadline.weight(.semibold)).monospacedDigit()
                    Spacer()
                    Text(s.analysisType.rawValue)
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.brown.opacity(0.12), in: Capsule())
                        .foregroundStyle(.brown)
                }
                if !s.materialName.isEmpty {
                    Text(s.materialName).font(.subheadline)
                }
                HStack {
                    if !s.containmentName.isEmpty {
                        Label(s.containmentName, systemImage: "shippingbox")
                    }
                    if !s.location.isEmpty {
                        Label(s.location, systemImage: "mappin")
                    }
                    Spacer()
                    Text(Fmt.date(s.date))
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
        .foregroundStyle(.primary)
    }
}

// MARK: - Wipe Samples

struct WipeSamplesView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteConfirmFor: WipeSample?

    private var sorted: [WipeSample] {
        project.wipeSamples.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section("\(project.wipeSamples.count) wipe sample\(project.wipeSamples.count == 1 ? "" : "s")") {
                if sorted.isEmpty {
                    EmptyStateView(
                        title: "No wipe samples",
                        subtitle: "Tap + to add a lead wipe sample.",
                        actionLabel: "Add Wipe Sample"
                    ) {
                        appState.present(.newWipeSample(project))
                    }
                } else {
                    ForEach(sorted) { s in
                        wipeRow(s)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) { deleteConfirmFor = s } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { appState.present(.editWipeSample(project, s)) } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                }
            }
        }
        .listStyle(.plain)
        .confirmationDialog(
            "Delete wipe sample \(deleteConfirmFor?.sampleId ?? "")?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Sample", role: .destructive) {
                if let s = deleteConfirmFor { modelContext.delete(s); try? modelContext.save() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func wipeRow(_ s: WipeSample) -> some View {
        Button { appState.present(.editWipeSample(project, s)) } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(s.sampleId).font(.subheadline.weight(.semibold)).monospacedDigit()
                    Spacer()
                    Text(s.wipeSampleType.rawValue)
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.teal.opacity(0.12), in: Capsule())
                        .foregroundStyle(.teal)
                }
                HStack(spacing: 10) {
                    if !s.containmentName.isEmpty { Label(s.containmentName, systemImage: "shippingbox") }
                    if !s.spaceName.isEmpty { Label(s.spaceName, systemImage: "door.left.hand.open") }
                    if !s.component.isEmpty { Label(s.component, systemImage: "square") }
                    Spacer()
                    Text(Fmt.date(s.date))
                }
                .font(.caption).foregroundStyle(.secondary)
                if s.squareFeet > 0 {
                    Text("\(Int(s.squareFeet)) ft²")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 4)
        }
        .foregroundStyle(.primary)
    }
}
