//
//  DailyLog.swift
//  Oversight
//
//  Daily field log — matches the "Daily Logs" sheet name in js/excel.js
//  and the Daily Log Template document. One DailyLog per project per date,
//  holding one or more timestamped entries.
//

import Foundation
import SwiftData

@Model
final class DailyLog {
    var date: Date
    var project: Project?

    @Relationship(deleteRule: .cascade, inverse: \LogEntry.dailyLog)
    var entries: [LogEntry] = []

    init(date: Date, project: Project? = nil) {
        self.date = date
        self.project = project
    }
}

@Model
final class LogEntry {
    var time: Date
    var stageRaw: String
    var note: String
    var photoCount: Int
    /// Marks a failed visual inspection / failed step — renders red on the
    /// project activity timeline, matching the desktop "fail" flag.
    var isFailedInspection: Bool

    var dailyLog: DailyLog?

    init(
        time: Date = .now,
        stage: Stage,
        note: String,
        photoCount: Int = 0,
        isFailedInspection: Bool = false,
        dailyLog: DailyLog? = nil
    ) {
        self.time = time
        self.stageRaw = stage.rawValue
        self.note = note
        self.photoCount = photoCount
        self.isFailedInspection = isFailedInspection
        self.dailyLog = dailyLog
    }

    var stage: Stage {
        get { Stage(rawValue: stageRaw) ?? .containmentPreparation }
        set { stageRaw = newValue.rawValue }
    }
}
