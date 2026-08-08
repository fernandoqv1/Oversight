//
//  Formatting.swift
//  Oversight
//
//  Date/time formatting and cross-cutting business logic ported from
//  oversight-store.jsx (fmtDate, fmtDateFull, fmtMin, fmtClock, stageIdx,
//  projectPct, dueLabel, daysLeft) and js/project.js (air sample ID
//  generation). Keep this the single source of truth for these
//  calculations so screens and sheets never re-derive them differently.
//

import Foundation
import SwiftData

enum Fmt {
    static func date(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    static func dateFull(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }

    /// "1h 30m" or "45m" for a minute count.
    static func minutes(_ min: Int?) -> String {
        guard let min else { return "—" }
        let h = min / 60, m = min % 60
        return h > 0 ? "\(h)h \(String(format: "%02d", m))m" : "\(m)m"
    }

    /// "1:30" clock-style rendering of an elapsed minute count.
    static func clock(_ min: Int?) -> String {
        guard let min else { return "—" }
        let h = min / 60, m = min % 60
        return "\(h):\(String(format: "%02d", m))"
    }

    static func daysAgoOrOverdue(from date: Date) -> Int {
        let start = Calendar.current.startOfDay(for: date)
        let today = Calendar.current.startOfDay(for: .now)
        return Calendar.current.dateComponents([.day], from: start, to: today).day ?? 0
    }
}

extension Project {
    /// Percent complete, averaged across containments by stage index —
    /// mirrors projectPct() in oversight-store.jsx.
    var percentComplete: Int {
        guard !containments.isEmpty else { return 0 }
        let denom = Double(Stage.allCases.count - 1)
        let sum = containments.reduce(0.0) { $0 + Double($1.stage.index) / denom }
        return Int((sum / Double(containments.count) * 100).rounded())
    }

    var isOverdue: Bool {
        guard status == .active, let dueDate else { return false }
        return Calendar.current.startOfDay(for: dueDate) < Calendar.current.startOfDay(for: .now)
    }

    /// "3d overdue" / "Jun 12" / "Done" / "No date" — mirrors dueLabel().
    var dueLabel: String {
        if status == .completed { return "Done" }
        guard let dueDate else { return "No date" }
        if isOverdue {
            let days = Fmt.daysAgoOrOverdue(from: dueDate)
            return "\(days)d overdue"
        }
        return Fmt.date(dueDate)
    }

    /// Days remaining until due date (negative if overdue). Mirrors daysLeft().
    var daysLeft: Int? {
        guard let dueDate else { return nil }
        let start = Calendar.current.startOfDay(for: .now)
        let due = Calendar.current.startOfDay(for: dueDate)
        return Calendar.current.dateComponents([.day], from: start, to: due).day
    }

    /// Primary/lead stage shown on the project row — first containment's
    /// stage, defaulting to Containment Preparation for a brand-new project.
    var leadStage: Stage {
        containments.first?.stage ?? .containmentPreparation
    }

    var totalMaterialsCount: Int {
        buildings.reduce(0) { $0 + $1.spaces.reduce(0) { $0 + $1.materials.count } }
    }

    /// Next air sample ID for a given type — mirrors getNextAirSampleId()
    /// in js/project.js: scans existing samples matching this project's
    /// prefix + type prefix, returns prefix + (max existing sequence + 1),
    /// zero-padded to 2 digits.
    func nextSampleID(for type: SampleType, excluding current: AirSample? = nil) -> String {
        let prefix = "\(projectNumber)-\(type.idPrefix)"
        var maxN = 0
        for sample in airSamples {
            if let current, sample.persistentModelID == current.persistentModelID { continue }
            guard sample.sampleId.hasPrefix(prefix) else { continue }
            let suffix = sample.sampleId.dropFirst(prefix.count)
            if let n = Int(suffix) { maxN = max(maxN, n) }
        }
        return "\(prefix)\(String(format: "%02d", maxN + 1))"
    }
}

extension AirSample {
    /// Short label for compact rows — last segment of the sample ID
    /// (e.g. "AS08" from "OVS-2041-AS08").
    var shortID: String {
        sampleId.replacingOccurrences(of: "\(project?.projectNumber ?? "")-", with: "")
    }
}
