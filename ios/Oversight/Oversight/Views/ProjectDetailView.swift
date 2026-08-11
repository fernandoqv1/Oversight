//
//  ProjectDetailView.swift
//  Oversight
//
//  Project workspace — hero header, KPIs, lifecycle stepper, section
//  links (Containments/Air Samples/Materials/Team/Documents), recent
//  activity. Ported from ProjectScreen in oversight-screens.jsx.
//

import SwiftUI
import SwiftData

struct ProjectDetailView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var showEditMenu = false
    @State private var showAllContainments = false

    var body: some View {
        List {
            Section {
                heroHeader
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            Section("Containment Stage") {
                containmentStageSection
            }

            Section("Sections") {
                sectionLink(title: "Containments", icon: "shippingbox.fill", color: .blue, count: project.containments.count) {
                    ContainmentsView(project: project)
                }
                sectionLink(title: "Samples", icon: "aqi.medium", color: .indigo, count: project.totalSamplesCount) {
                    SamplesView(project: project)
                }
                sectionLink(title: "Daily Logs", icon: "calendar.badge.clock", color: .orange, count: project.dailyLogs.count) {
                    DailyLogsView(project: project)
                }
                sectionLink(title: "Materials & Spaces", icon: "square.stack.3d.up.fill", color: .purple, count: project.totalMaterialsCount) {
                    MaterialsView(project: project)
                }
                sectionLink(title: "Workers", icon: "person.2.fill", color: .brown, count: project.workerRoster.count) {
                    TeamView(project: project)
                }
                sectionLink(title: "Documents", icon: "doc.text.fill", color: .green, count: project.documents.count) {
                    DocumentsView(project: project)
                }
            }

            if !recentActivity.isEmpty {
                Section {
                    ForEach(Array(recentActivity.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.text).font(.subheadline)
                            Text(item.meta).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    HStack {
                        Text("Recent Activity")
                        Spacer()
                        Button("Log") { appState.present(.newDailyLog(project)) }.font(.caption)
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle(project.siteName)
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { showEditMenu = true }
            }
        }
        .confirmationDialog("\(project.projectNumber) · \(project.siteName)", isPresented: $showEditMenu, titleVisibility: .visible) {
            Button("Edit project details") { appState.present(.editProject(project)) }
            Button("Add air sample") { appState.present(.newSample(project)) }
            Button("Add daily log") { appState.present(.newDailyLog(project)) }
            Button("Export to Excel") { appState.present(.exportExcel(project)) }
            Button(project.status == .completed ? "Reopen project" : "Mark completed") {
                project.status = project.status == .completed ? .active : .completed
                try? modelContext.save()
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(project.projectNumber)
                    .font(.caption.monospaced().weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.background.secondary, in: Capsule())
                statusPill
            }
            Text(project.siteName).font(.title2.weight(.bold))
            VStack(alignment: .leading, spacing: 4) {
                Label(project.siteAddress, systemImage: "mappin.and.ellipse")
                if !project.contractor.isEmpty {
                    Label(project.contractor, systemImage: "person.fill")
                }
                if !project.projectFolderPath.isEmpty {
                    Label(URL(fileURLWithPath: project.projectFolderPath).lastPathComponent, systemImage: "folder")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var statusPill: some View {
        let (label, color): (String, Color) = project.isOverdue ? ("Overdue", .red) : (project.status == .completed ? ("Completed", .secondary) : ("Active", .green))
        return Label {
            Text(label).font(.caption.weight(.semibold))
        } icon: {
            Circle().fill(color).frame(width: 6, height: 6)
        }
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(color.opacity(0.14), in: Capsule())
        .foregroundStyle(color)
    }

    private var sortedContainments: [Containment] {
        project.containments.sorted {
            $0.stage.index != $1.stage.index ? $0.stage.index < $1.stage.index : $0.name < $1.name
        }
    }

    @ViewBuilder
    private var containmentStageSection: some View {
        let sorted = sortedContainments
        if sorted.isEmpty {
            Text("No containments yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.vertical, 4)
        } else {
            let visible = showAllContainments ? sorted : Array(sorted.prefix(4))
            ForEach(visible) { c in
                stageRow(for: c)
            }
            if sorted.count > 4 {
                Button {
                    withAnimation { showAllContainments.toggle() }
                } label: {
                    Text(showAllContainments ? "Show less" : "Show all (\(sorted.count))")
                        .font(.subheadline)
                }
            }
        }
    }

    private func stageRow(for c: Containment) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 7)
                    .fill(c.stage.tintColor.opacity(0.15))
                    .frame(width: 34, height: 34)
                Image(systemName: c.stage.systemImage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(c.stage.tintColor)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(c.name)
                    .font(.subheadline)
                Text(c.stage.shortLabel)
                    .font(.caption)
                    .foregroundStyle(c.stage.tintColor)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private func sectionLink<Destination: View>(title: String, icon: String, color: Color, count: Int, @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: destination()) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 8).fill(color).frame(width: 30, height: 30)
                    Image(systemName: icon).foregroundStyle(.white).font(.caption)
                }
                Text(title)
                Spacer()
                Text("\(count)").foregroundStyle(.secondary).monospacedDigit()
            }
        }
    }

    private struct ActivityItem { let text: String; let meta: String; let sortKey: String }

    private var recentActivity: [ActivityItem] {
        var items: [ActivityItem] = []
        for log in project.dailyLogs {
            for entry in log.entries {
                items.append(ActivityItem(
                    text: entry.note,
                    meta: "\(Fmt.date(log.date)) \(entry.time.formatted(date: .omitted, time: .shortened)) · \(entry.stage.shortLabel)",
                    sortKey: "\(log.date.timeIntervalSince1970)\(entry.time.timeIntervalSince1970)"
                ))
            }
        }
        for sample in project.airSamples {
            let volText = sample.sampleVolume.map { ", \($0) L" } ?? " running"
            items.append(ActivityItem(
                text: "Air sample \(sample.sampleId) — \(sample.sampleType.rawValue)\(volText)",
                meta: "\(Fmt.date(sample.date)) \(sample.startTime?.formatted(date: .omitted, time: .shortened) ?? "")",
                sortKey: "\(sample.date.timeIntervalSince1970)"
            ))
        }
        return items.sorted { $0.sortKey > $1.sortKey }.prefix(6).map { $0 }
    }
}
