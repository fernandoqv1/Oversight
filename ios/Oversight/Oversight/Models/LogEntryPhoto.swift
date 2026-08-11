//
//  LogEntryPhoto.swift
//  Oversight
//
//  One photo attached to a daily log entry. Mirrors entry.photos[] in the
//  desktop app (js/main.js). imageData uses .externalStorage so SwiftData
//  keeps JPEG bytes out of the SQLite database file.
//

import Foundation
import SwiftData

@Model
final class LogEntryPhoto {
    @Attribute(.externalStorage) var imageData: Data
    var takenAt: Date
    var logEntry: LogEntry?

    init(imageData: Data, takenAt: Date = .now) {
        self.imageData = imageData
        self.takenAt = takenAt
    }
}
