//
//  DailyLogFormSheet.swift
//  Oversight
//
//  Daily log entry — ported from DailyLogSheet in oversight-sheets.jsx.
//  Matches the "Daily Logs" naming used in js/excel.js and the Daily Log
//  Template document.
//

import SwiftUI
import SwiftData

struct DailyLogFormSheet: View {
    let project: Project

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var date = Date.now
    @State private var time = Date.now
    @State private var stage: Stage = .containmentPreparation
    @State private var note = ""
    @State private var photoCount = 0
    @State private var isFailedInspection = false

    private var isValid: Bool { !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        SheetScaffold(title: "Daily Log Entry", saveLabel: "Add", saveDisabled: !isValid, onSave: save) {
            Section {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                Picker("Stage", selection: $stage) {
                    ForEach(Stage.allCases) { s in Text(s.rawValue).tag(s) }
                }
            }
            Section("Notes") {
                TextEditor(text: $note)
                    .frame(minHeight: 100)
                    .overlay(alignment: .topLeading) {
                        if note.isEmpty {
                            Text("What happened on site today…")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8).padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
            }
            Section {
                Stepper("Photos attached: \(photoCount)", value: $photoCount, in: 0...50)
                Toggle(isOn: $isFailedInspection) {
                    VStack(alignment: .leading) {
                        Text("Flag as failed inspection")
                        Text("Marks this entry red on the timeline").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .onAppear {
            if let firstStage = project.containments.first?.stage { stage = firstStage }
        }
    }

    private func save() {
        let calendar = Calendar.current
        var comps = calendar.dateComponents([.year, .month, .day], from: date)
        let timeComps = calendar.dateComponents([.hour, .minute], from: time)
        comps.hour = timeComps.hour
        comps.minute = timeComps.minute
        let entryTime = calendar.date(from: comps) ?? .now

        let existingLog = project.dailyLogs.first { calendar.isDate($0.date, inSameDayAs: date) }
        let log: DailyLog
        if let existingLog {
            log = existingLog
        } else {
            log = DailyLog(date: date, project: project)
            modelContext.insert(log)
        }
        let entry = LogEntry(time: entryTime, stage: stage, note: note.trimmingCharacters(in: .whitespacesAndNewlines), photoCount: photoCount, isFailedInspection: isFailedInspection, dailyLog: log)
        modelContext.insert(entry)
        try? modelContext.save()
        appState.showToast("Log entry added")
    }
}
