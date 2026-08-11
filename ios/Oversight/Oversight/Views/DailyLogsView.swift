//
//  DailyLogsView.swift
//  Oversight
//
//  Daily log list for a project. Each log card shows the date, inspector,
//  and workers on site for the day. Tap to drill into DailyLogDetailView
//  where individual entries can be added, edited, or deleted.
//

import SwiftUI
import SwiftData

struct DailyLogsView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteConfirmFor: DailyLog?

    private var sortedLogs: [DailyLog] {
        project.dailyLogs.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section("\(project.dailyLogs.count) log\(project.dailyLogs.count == 1 ? "" : "s")") {
                if sortedLogs.isEmpty {
                    EmptyStateView(
                        title: "No daily logs",
                        subtitle: "Tap + to create a log for today.",
                        actionLabel: "New Log"
                    ) {
                        appState.present(.newDailyLog(project))
                    }
                } else {
                    ForEach(sortedLogs) { log in
                        NavigationLink(destination: DailyLogDetailView(log: log)) {
                            logRow(log)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                deleteConfirmFor = log
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                appState.present(.editDailyLog(project, log))
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(.blue)
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Daily Logs")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { appState.present(.newDailyLog(project)) } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .confirmationDialog(
            "Delete log for \(deleteConfirmFor.map { Fmt.dateFull($0.date) } ?? "")?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Log", role: .destructive) {
                if let log = deleteConfirmFor {
                    modelContext.delete(log)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func logRow(_ log: DailyLog) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(Fmt.dateFull(log.date))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(log.entries.count) entr\(log.entries.count == 1 ? "y" : "ies")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                if !log.inspectorName.isEmpty {
                    Label(log.inspectorName, systemImage: "person")
                }
                Label(
                    "\(log.workersOnSite) worker\(log.workersOnSite == 1 ? "" : "s") on site",
                    systemImage: "person.2"
                )
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Daily Log Detail

struct DailyLogDetailView: View {
    @Bindable var log: DailyLog
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteEntryFor: LogEntry?

    private var sortedEntries: [LogEntry] {
        log.entries.sorted { $0.time < $1.time }
    }

    var body: some View {
        List {
            Section("Log Details") {
                LabeledContent("Date", value: Fmt.dateFull(log.date))
                if !log.inspectorName.isEmpty {
                    LabeledContent("Inspector", value: log.inspectorName)
                }
                LabeledContent("Workers on site", value: "\(log.workersOnSite)")
                if !log.workerNames.isEmpty {
                    ForEach(log.workerNames.sorted(), id: \.self) { name in
                        Label(name, systemImage: "person.fill")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("\(log.entries.count) entr\(log.entries.count == 1 ? "y" : "ies")") {
                if sortedEntries.isEmpty {
                    EmptyStateView(
                        title: "No entries yet",
                        subtitle: "Tap + to record what happened on site.",
                        actionLabel: "Add Entry"
                    ) {
                        appState.present(.newLogEntry(log))
                    }
                } else {
                    ForEach(sortedEntries) { entry in
                        entryRow(entry)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteEntryFor = entry
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button {
                                    appState.present(.editLogEntry(log, entry))
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle(Fmt.dateFull(log.date))
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { appState.present(.newLogEntry(log)) } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .secondaryAction) {
                if let project = log.project {
                    Button("Edit Log") {
                        appState.present(.editDailyLog(project, log))
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete this entry?",
            isPresented: Binding(get: { deleteEntryFor != nil }, set: { if !$0 { deleteEntryFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Entry", role: .destructive) {
                if let entry = deleteEntryFor {
                    modelContext.delete(entry)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func entryRow(_ entry: LogEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(entry.time.formatted(date: .omitted, time: .shortened))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                HStack(spacing: 8) {
                    if entry.photoCount > 0 {
                        Label("\(entry.photoCount)", systemImage: "photo")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if !entry.negativePressureNotes.isEmpty {
                        Image(systemName: "gauge.with.dots.needle.33percent")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            Text(entry.note)
                .font(.subheadline)
                .lineLimit(3)
            if !entry.negativePressureNotes.isEmpty {
                Text("Neg. pressure: \(entry.negativePressureNotes)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }
}
