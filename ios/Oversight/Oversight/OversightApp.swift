//
//  OversightApp.swift
//  Oversight
//
//  App entry point. Sets up the on-device SwiftData store (no backend,
//  offline-only — matching the desktop app's localStorage model per
//  CLAUDE.md).
//

import SwiftUI
import SwiftData

@main
struct OversightApp: App {
    let container: ModelContainer

    init() {
        let schema = Schema([
            Project.self, Building.self, Space.self, Material.self,
            Containment.self, VisualInspection.self, AirSample.self, BulkSample.self, WipeSample.self,
            Worker.self, DailyLog.self, LogEntry.self, GeneratedDocument.self, Inspector.self,
            ScannedDocument.self, ScannedPage.self, LogEntryPhoto.self,
        ])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create Oversight data store: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
