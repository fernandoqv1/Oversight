//
//  TodayView.swift
//  Oversight
//
//  Today tab — needs attention, running samples, snapshot stats, active
//  projects. Ported from TodayScreen in oversight-screens.jsx.
//

import SwiftUI
import SwiftData

struct TodayView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \Project.createdAt, order: .reverse) private var allProjects: [Project]
    @Query private var inspectors: [Inspector]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            content
        }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    appState.tab = .profile
                } label: {
                    Text(inspectors.first?.initials ?? "?")
                        .font(.caption.weight(.bold))
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color.accentColor.opacity(0.15)))
                }
            }
        }
    }

    private var activeProjects: [Project] { allProjects.filter { $0.status == .active } }

    private var content: some View {
        let attention = Insights.attentionItems(projects: allProjects)
        let running = Insights.runningSamples(projects: allProjects)
        let samplesToday = allProjects.reduce(0) { $0 + $1.airSamples.filter { Calendar.current.isDate($0.date, inSameDayAs: .now) }.count }
        let pendingClearance = allProjects.reduce(0) { $0 + $1.containments.filter { $0.stage == .containmentClearance }.count }
        let dueThisWeek = activeProjects.filter { ($0.daysLeft ?? 99) <= 7 }.count
        let highPriority = attention.filter { if case .alert = $0.severity { return true } else { return false } }.count

        return List {
            if !attention.isEmpty {
                Section("Needs Attention") {
                    ForEach(attention) { item in
                        attentionRow(item)
                    }
                }
            }

            if !running.isEmpty {
                Section("Running Samples") {
                    ForEach(running) { r in
                        NavigationLink(value: r.project) {
                            runningRow(r)
                        }
                    }
                }
            }

            Section("Snapshot") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    StatCard(label: "Active Projects", value: "\(activeProjects.count)", subtitle: "\(dueThisWeek) due this week")
                    StatCard(label: "Samples Today", value: "\(samplesToday)", subtitle: "\(running.count) running now")
                    StatCard(label: "Pending Clearance", value: "\(pendingClearance)", subtitle: pendingClearance > 0 ? "in clearance" : "none")
                    StatCard(label: "Open Items", value: "\(attention.count)", subtitle: "\(highPriority) high priority", subtitleColor: highPriority > 0 ? .red : .secondary)
                }
                .listRowInsets(EdgeInsets())
                .padding(12)
            }

            Section {
                ForEach(activeProjects.prefix(3)) { project in
                    NavigationLink(value: project) {
                        ProjectRow(project: project, compact: true)
                    }
                }
            } header: {
                HStack {
                    Text("Active Projects")
                    Spacer()
                    Button("See All") { appState.tab = .projects }
                        .font(.caption)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
    }

    private func color(for severity: AttentionSeverity) -> Color {
        switch severity {
        case .alert: return .red
        case .warn: return .orange
        case .todo: return .blue
        case .ready: return .green
        }
    }

    @ViewBuilder
    private func attentionRow(_ item: AttentionItem) -> some View {
        let row = HStack(spacing: 12) {
            Image(systemName: item.severity.systemImage)
                .foregroundStyle(color(for: item.severity))
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                Text(item.meta).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        if let project = item.project {
            NavigationLink(value: project) { row }
        } else {
            row
        }
    }

    private func runningRow(_ r: RunningSample) -> some View {
        let elapsed = r.sample.elapsedMinutes ?? 0
        let volume = r.sample.runningVolumeEstimate ?? 0
        let target = r.sample.sampleType == .clearance ? 2500 : 1200
        let pct = min(100, Int((Double(volume) / Double(target)) * 100))
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(r.sample.shortID).font(.subheadline.weight(.semibold).monospaced())
                SampleTypeTag(type: r.sample.sampleType)
                Spacer()
                Label("Running", systemImage: "circle.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.green)
            }
            Text(r.project.siteName).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 16) {
                metric("Flow", String(format: "%.1f L/min", r.sample.startFlowRate ?? 0))
                metric("Volume", "\(volume) L")
                metric("Elapsed", Fmt.clock(elapsed))
            }
            HStack {
                ProgressBarView(percent: pct)
                Text("\(pct)%").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.caption.weight(.semibold).monospacedDigit())
        }
    }
}
