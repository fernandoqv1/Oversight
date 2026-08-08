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

    var body: some View {
        List {
            Section {
                heroHeader
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            Section {
                kpiGrid
            }
            .listRowInsets(EdgeInsets())

            Section("Lifecycle") {
                lifecycleStepper
            }

            Section("Sections") {
                sectionLink(title: "Containments", icon: "shippingbox.fill", color: .blue, count: project.containments.count) {
                    ContainmentsView(project: project)
                }
                sectionLink(title: "Air Samples", icon: "aqi.medium", color: .indigo, count: project.airSamples.count) {
                    AirSamplesView(project: project)
                }
                sectionLink(title: "Materials", icon: "square.stack.3d.up.fill", color: .purple, count: project.totalMaterialsCount) {
                    MaterialsView(project: project)
                }
                sectionLink(title: "Team", icon: "person.2.fill", color: .brown, count: project.workerRoster.count) {
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
        .listStyle(.insetGrouped)
        .navigationTitle(project.siteName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { showEditMenu = true }
            }
        }
        .confirmationDialog("\(project.projectNumber) · \(project.siteName)", isPresented: $showEditMenu, titleVisibility: .visible) {
            Button("Edit project details") { appState.present(.editProject(project)) }
            Button("Add air sample") { appState.present(.newSample(project)) }
            Button("Add daily log entry") { appState.present(.newDailyLog(project)) }
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
                Label("Due \(Fmt.dateFull(project.dueDate))\(project.isOverdue ? " · \(project.dueLabel)" : "")", systemImage: "calendar")
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

    private var kpiGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 10) {
            kpi("Complete", "\(project.percentComplete)%")
            kpi("Containments", "\(project.containments.count)")
            kpi("Samples", "\(project.airSamples.count)")
            kpi("Workers", "\(project.workerRoster.count)")
            kpi("Days Left", project.daysLeft.map { "\($0)" } ?? "—")
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private func kpi(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline.monospacedDigit())
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10))
    }

    private var lifecycleStepper: some View {
        let curIdx = project.containments.isEmpty ? 0 : Int((Double(project.containments.reduce(0) { $0 + $1.stage.index }) / Double(project.containments.count)).rounded())
        return HStack(spacing: 0) {
            ForEach(Array(Stage.allCases.enumerated()), id: \.offset) { i, stage in
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .fill(i < curIdx ? Color.accentColor : (i == curIdx ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.15)))
                            .frame(width: 26, height: 26)
                        if i < curIdx {
                            Image(systemName: "checkmark").font(.caption2.weight(.bold)).foregroundStyle(.white)
                        } else {
                            Text("\(i + 1)").font(.caption2.weight(.semibold)).foregroundStyle(i == curIdx ? Color.accentColor : .secondary)
                        }
                    }
                    Text(stage.shortLabel).font(.system(size: 9)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                if i < Stage.allCases.count - 1 {
                    Rectangle()
                        .fill(i < curIdx ? Color.accentColor : Color.secondary.opacity(0.15))
                        .frame(height: 2)
                        .padding(.bottom, 14)
                }
            }
        }
        .padding(.vertical, 6)
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
