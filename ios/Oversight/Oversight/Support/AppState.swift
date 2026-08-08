//
//  AppState.swift
//  Oversight
//
//  App-wide UI state: active tab, presented sheet, toast messages, and
//  appearance (theme + accent), mirroring the `app` object passed through
//  every screen in oversight-app.jsx (app.tab, app.sheet, app.toast,
//  app.theme). Persisted prefs match ovs_ios_prefs / the Appearance sheet.
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

/// Identifies which bottom-sheet form is currently presented, and carries
/// the data it needs — the Swift equivalent of the `spec` object passed to
/// SheetHost in oversight-app.jsx.
enum ActiveSheet: Identifiable {
    case newProject
    case editProject(Project)
    case newSample(Project)
    case editSample(Project, AirSample)
    case newContainment(Project)
    case newWorker(Project)
    case editWorker(Project, Worker)
    case newDailyLog(Project)
    case newMaterial(Project)
    case inspectorDetails
    case signature
    case appearance
    case defaultTemplates
    case info(title: String, body: String)

    var id: String {
        switch self {
        case .newProject: return "newProject"
        case .editProject(let p): return "editProject-\(p.persistentModelID)"
        case .newSample(let p): return "newSample-\(p.persistentModelID)"
        case .editSample(_, let s): return "editSample-\(s.persistentModelID)"
        case .newContainment(let p): return "newContainment-\(p.persistentModelID)"
        case .newWorker(let p): return "newWorker-\(p.persistentModelID)"
        case .editWorker(_, let w): return "editWorker-\(w.persistentModelID)"
        case .newDailyLog(let p): return "newDailyLog-\(p.persistentModelID)"
        case .newMaterial(let p): return "newMaterial-\(p.persistentModelID)"
        case .inspectorDetails: return "inspectorDetails"
        case .signature: return "signature"
        case .appearance: return "appearance"
        case .defaultTemplates: return "defaultTemplates"
        case .info(let title, _): return "info-\(title)"
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

/// Appearance preferences, mirrors ovs_ios_prefs (dark/accent) — stored via
/// @AppStorage so it survives relaunch without needing SwiftData.
enum AppearancePrefs {
    static let darkModeKey = "ovs_dark_mode"
    static let accentKey = "ovs_accent"
}
