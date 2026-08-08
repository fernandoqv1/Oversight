//
//  Insights.swift
//  Oversight
//
//  "Needs Attention" and activity feed derivation, ported from
//  buildAttention() / allRunning() / projectActivity() in
//  oversight-screens.jsx.
//

import Foundation
import SwiftData

enum AttentionSeverity {
    case alert, warn, todo, ready

    var systemImage: String {
        switch self {
        case .alert: return "exclamationmark.triangle.fill"
        case .warn: return "clock.fill"
        case .todo: return "doc.text.fill"
        case .ready: return "checkmark.circle.fill"
        }
    }
}

struct AttentionItem: Identifiable {
    let id = UUID()
    let severity: AttentionSeverity
    let label: String
    let meta: String
    let project: Project?
}

struct RunningSample: Identifiable {
    var id: PersistentModelIDBox { PersistentModelIDBox(sample.persistentModelID) }
    let sample: AirSample
    let project: Project
}

/// SwiftData's PersistentIdentifier isn't directly Hashable-friendly for
/// ForEach in every SDK revision — box it for a stable Identifiable id.
struct PersistentModelIDBox: Hashable {
    let raw: String
    init(_ id: Any) { raw = String(describing: id) }
}

enum Insights {
    static func attentionItems(projects: [Project]) -> [AttentionItem] {
        var items: [AttentionItem] = []
        let today = Calendar.current.startOfDay(for: .now)

        for project in projects where project.status == .active {
            if project.isOverdue {
                items.append(AttentionItem(severity: .alert, label: "Project overdue", meta: "\(project.siteName) · \(project.dueLabel)", project: project))
            }
            for sample in project.airSamples where sample.isRunning {
                if let minutes = sample.elapsedMinutes, minutes > 240 {
                    items.append(AttentionItem(severity: .warn, label: "Sample \(sample.shortID) over target volume", meta: "\(project.siteName) · running \(Fmt.minutes(minutes))", project: project))
                }
            }
            for worker in project.workerRoster {
                if let exp = worker.respiratorFitExpiration, Calendar.current.startOfDay(for: exp) < today {
                    items.append(AttentionItem(severity: .warn, label: "Respirator fit-test expired", meta: "\(worker.name) · \(project.siteName)", project: project))
                }
            }
            let hasLogToday = project.dailyLogs.contains { Calendar.current.isDate($0.date, inSameDayAs: .now) }
            let hasActiveContainment = project.containments.contains { $0.stage == .activeAbatement }
            if !hasLogToday && hasActiveContainment {
                items.append(AttentionItem(severity: .todo, label: "Daily log not submitted", meta: "\(project.siteName) · today", project: project))
            }
        }

        for project in projects {
            for sample in project.airSamples where sample.sampleType == .clearance && sample.sampleVolume != nil {
                items.append(AttentionItem(severity: .ready, label: "Clearance results ready", meta: "\(project.siteName) · \(sample.shortID)", project: project))
            }
        }

        return Array(items.prefix(6))
    }

    static func runningSamples(projects: [Project]) -> [RunningSample] {
        var out: [RunningSample] = []
        for project in projects {
            for sample in project.airSamples where sample.isRunning {
                out.append(RunningSample(sample: sample, project: project))
            }
        }
        return out
    }
}
