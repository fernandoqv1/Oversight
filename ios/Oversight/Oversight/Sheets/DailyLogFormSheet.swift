//
//  DailyLogFormSheet.swift
//  Oversight
//
//  Creates or edits a daily log header: date, inspector, and worker
//  multi-selection from the project roster. Entries (notes, photos,
//  negative pressure) are added separately via LogEntryFormSheet.
//  Mirrors the daily log form in the Windows app (js/project.js
//  openNewDailyLogModal: date, inspector, workers on site).
//

import SwiftUI
import SwiftData

struct DailyLogFormSheet: View {
    let project: Project
    let dailyLog: DailyLog?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var date = Date.now
    @State private var inspectorName = ""
    @State private var selectedWorkerNames: Set<String> = []

    private var isEdit: Bool { dailyLog != nil }
    private var sortedWorkers: [Worker] { project.workerRoster.sorted { $0.name < $1.name } }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Daily Log" : "New Daily Log",
            saveLabel: isEdit ? "Save" : "Create",
            onSave: save
        ) {
            Section("Log Date") {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                LabeledContent("Inspector") {
                    TextField("Inspector name", text: $inspectorName)
                        .multilineTextAlignment(.trailing)
                }
            }

            Section {
                if sortedWorkers.isEmpty {
                    Text("No workers on roster — add workers in the Team section first.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sortedWorkers) { worker in
                        Button {
                            if selectedWorkerNames.contains(worker.name) {
                                selectedWorkerNames.remove(worker.name)
                            } else {
                                selectedWorkerNames.insert(worker.name)
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(worker.name)
                                        .foregroundStyle(.primary)
                                    Text(worker.role.label)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selectedWorkerNames.contains(worker.name) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            } header: {
                Text("Workers On Site (\(selectedWorkerNames.count))")
            }
        }
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        if let log = dailyLog {
            date = log.date
            inspectorName = log.inspectorName
            selectedWorkerNames = Set(log.workerNames)
        } else {
            inspectorName = inspectors.first?.name ?? ""
        }
    }

    private func save() {
        let workerArray = Array(selectedWorkerNames).sorted()
        let workerCount = selectedWorkerNames.count

        if let log = dailyLog {
            log.date = date
            log.inspectorName = inspectorName.trimmingCharacters(in: .whitespaces)
            log.workerNames = workerArray
            log.workersOnSite = workerCount
            try? modelContext.save()
            appState.showToast("Daily log updated")
        } else {
            // Merge into existing log for the same day if one exists
            let calendar = Calendar.current
            let existing = project.dailyLogs.first { calendar.isDate($0.date, inSameDayAs: date) }
            if let existing {
                existing.inspectorName = inspectorName.trimmingCharacters(in: .whitespaces)
                existing.workerNames = workerArray
                existing.workersOnSite = workerCount
                try? modelContext.save()
                appState.showToast("Daily log updated")
            } else {
                let newLog = DailyLog(
                    date: date,
                    inspectorName: inspectorName.trimmingCharacters(in: .whitespaces),
                    workersOnSite: workerCount,
                    workerNames: workerArray,
                    project: project
                )
                modelContext.insert(newLog)
                try? modelContext.save()
                appState.showToast("Daily log created")
            }
        }
    }
}
