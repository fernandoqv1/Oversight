//
//  DailyLog.swift
//  Oversight
//
//  Daily field log — one DailyLog per project per date, holding one or
//  more timestamped entries. inspectorName and workersOnSite mirror the
//  daily log header fields in the desktop app (js/project.js
//  openNewDailyLogModal: Inspector Name, Workers Onsite Total).
//

import Foundation
import SwiftData

@Model
final class DailyLog {
    var date: Date
    var inspectorName: String
    var workersOnSite: Int
    /// Names of workers selected from the project roster for this log.
    var workerNames: [String] = []
    var project: Project?

    @Relationship(deleteRule: .cascade, inverse: \LogEntry.dailyLog)
    var entries: [LogEntry] = []

    init(
        date: Date,
        inspectorName: String = "",
        workersOnSite: Int = 0,
        workerNames: [String] = [],
        project: Project? = nil
    ) {
        self.date = date
        self.inspectorName = inspectorName
        self.workersOnSite = workersOnSite
        self.workerNames = workerNames
        self.project = project
    }
}

@Model
final class LogEntry {
    var time: Date
    var note: String
    var photoCount: Int
    /// Free-text notes for negative pressure readings (e.g. "Room A: -0.05 in. WC").
    var negativePressureNotes: String = ""

    // Legacy fields kept for backward compatibility
    var stageRaw: String
    var isFailedInspection: Bool

    var dailyLog: DailyLog?

    @Relationship(deleteRule: .cascade, inverse: \LogEntryPhoto.logEntry)
    var photos: [LogEntryPhoto] = []

    init(
        time: Date = .now,
        note: String,
        photoCount: Int = 0,
        negativePressureNotes: String = "",
        dailyLog: DailyLog? = nil
    ) {
        self.time = time
        self.note = note
        self.photoCount = photoCount
        self.negativePressureNotes = negativePressureNotes
        self.stageRaw = Stage.containmentPreparation.rawValue
        self.isFailedInspection = false
        self.dailyLog = dailyLog
    }

    var stage: Stage {
        get { Stage(rawValue: stageRaw) ?? .containmentPreparation }
        set { stageRaw = newValue.rawValue }
    }
}
