//
//  AppState.swift
//  Oversight
//
//  App-wide UI state: active tab, presented sheet, toast messages, and
//  appearance (theme + accent), mirroring the `app` object passed through
//  every screen in oversight-app.jsx.
//

import Foundation
import SwiftUI
import SwiftData

enum AppTab: String, CaseIterable {
    case today, projects, archive, profile

    var title: String {
        switch self {
        case .today: return "Today"
        case .projects: return "Projects"
        case .archive: return "Archive"
        case .profile: return "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "house"
        case .projects: return "square.grid.2x2"
        case .archive: return "archivebox"
        case .profile: return "person.crop.circle"
        }
    }
}

enum ActiveSheet: Identifiable {
    // Projects
    case newProject
    case editProject(Project)
    // Air Samples
    case newSample(Project)
    case editSample(Project, AirSample)
    // Containments
    case newContainment(Project)
    case editContainment(Project, Containment)
    // Visual Inspections
    case newVisualInspection(Containment)
    case editVisualInspection(Containment, VisualInspection)
    // Workers
    case newWorker(Project)
    case editWorker(Project, Worker)
    // Daily Logs
    case newDailyLog(Project)
    case editDailyLog(Project, DailyLog)
    case newLogEntry(DailyLog)
    case editLogEntry(DailyLog, LogEntry)
    // Bulk Samples
    case newBulkSample(Project)
    case editBulkSample(Project, BulkSample)
    // Wipe Samples
    case newWipeSample(Project)
    case editWipeSample(Project, WipeSample)
    // Spaces
    case editSpace(Project, Space)
    // Materials
    case newMaterial(Project)
    case editMaterial(Project, Material)
    case editMaterialByName(Project, String)
    case newBulkSampleFromMaterial(Project, String, String)
    // Profile
    case inspectorDetails
    case signature
    case appearance
    case defaultTemplates
    case info(title: String, body: String)
    // Documents
    case scanDocument(Project)
    // Workers
    case copyWorkers(Project)
    // Excel
    case exportExcel(Project)
    case importExcel

    var id: String {
        switch self {
        case .newProject: return "newProject"
        case .editProject(let p): return "editProject-\(p.persistentModelID)"
        case .newSample(let p): return "newSample-\(p.persistentModelID)"
        case .editSample(_, let s): return "editSample-\(s.persistentModelID)"
        case .newContainment(let p): return "newContainment-\(p.persistentModelID)"
        case .editContainment(_, let c): return "editContainment-\(c.persistentModelID)"
        case .newVisualInspection(let c): return "newVI-\(c.persistentModelID)"
        case .editVisualInspection(_, let v): return "editVI-\(v.persistentModelID)"
        case .newWorker(let p): return "newWorker-\(p.persistentModelID)"
        case .editWorker(_, let w): return "editWorker-\(w.persistentModelID)"
        case .newDailyLog(let p): return "newDailyLog-\(p.persistentModelID)"
        case .editDailyLog(_, let l): return "editDailyLog-\(l.persistentModelID)"
        case .newLogEntry(let l): return "newLogEntry-\(l.persistentModelID)"
        case .editLogEntry(_, let e): return "editLogEntry-\(e.persistentModelID)"
        case .newBulkSample(let p): return "newBulkSample-\(p.persistentModelID)"
        case .editBulkSample(_, let s): return "editBulkSample-\(s.persistentModelID)"
        case .newWipeSample(let p): return "newWipeSample-\(p.persistentModelID)"
        case .editWipeSample(_, let s): return "editWipeSample-\(s.persistentModelID)"
        case .editSpace(_, let s): return "editSpace-\(s.persistentModelID)"
        case .newMaterial(let p): return "newMaterial-\(p.persistentModelID)"
        case .editMaterial(_, let m): return "editMaterial-\(m.persistentModelID)"
        case .editMaterialByName(let p, let n): return "editMaterialByName-\(p.persistentModelID)-\(n)"
        case .newBulkSampleFromMaterial(let p, let m, let h): return "newBulkSampleFromMaterial-\(p.persistentModelID)-\(m)-\(h)"
        case .inspectorDetails: return "inspectorDetails"
        case .signature: return "signature"
        case .appearance: return "appearance"
        case .defaultTemplates: return "defaultTemplates"
        case .info(let title, _): return "info-\(title)"
        case .scanDocument(let p): return "scanDocument-\(p.persistentModelID)"
        case .copyWorkers(let p): return "copyWorkers-\(p.persistentModelID)"
        case .exportExcel(let p): return "exportExcel-\(p.persistentModelID)"
        case .importExcel: return "importExcel"
        }
    }
}

@Observable
final class AppState {
    var tab: AppTab = .today
    var activeSheet: ActiveSheet?
    var toastMessage: String?

    @ObservationIgnored private var toastTask: Task<Void, Never>?

    func showToast(_ message: String) {
        toastMessage = message
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.4))
            if !Task.isCancelled { self.toastMessage = nil }
        }
    }

    func present(_ sheet: ActiveSheet) { activeSheet = sheet }
    func dismissSheet() { activeSheet = nil }
}

enum AppearancePrefs {
    static let darkModeKey = "ovs_dark_mode"
    static let accentKey = "ovs_accent"
}
