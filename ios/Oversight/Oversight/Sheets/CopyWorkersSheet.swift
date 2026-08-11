//
//  CopyWorkersSheet.swift
//  Oversight
//
//  Lists other projects that have a worker roster. Tapping one duplicates
//  all its workers into the current project. Existing workers are kept.
//

import SwiftUI
import SwiftData

struct CopyWorkersSheet: View {
    let project: Project

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @Query(sort: \Project.createdAt, order: .reverse)
    private var allProjects: [Project]

    private var sourceProjects: [Project] {
        allProjects.filter {
            $0.persistentModelID != project.persistentModelID && !$0.workerRoster.isEmpty
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if sourceProjects.isEmpty {
                    ContentUnavailableView(
                        "No Rosters to Copy",
                        systemImage: "person.2.slash",
                        description: Text("Other projects need workers before you can copy from them.")
                    )
                } else {
                    List {
                        Section {
                            Text("Workers will be duplicated into this project. Existing workers are kept.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Section("Select a project") {
                            ForEach(sourceProjects) { source in
                                Button {
                                    copyWorkers(from: source)
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(source.siteName)
                                            .font(.subheadline.weight(.semibold))
                                        Text("\(source.projectNumber) · \(source.workerRoster.count) worker\(source.workerRoster.count == 1 ? "" : "s")")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    .padding(.vertical, 2)
                                }
                                .foregroundStyle(.primary)
                            }
                        }
                    }
                    .groupedListStyle()
                }
            }
            .navigationTitle("Copy Workers From")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func copyWorkers(from source: Project) {
        var count = 0
        for w in source.workerRoster {
            let copy = Worker(
                name: w.name,
                role: w.role,
                aheraExpiration: w.aheraExpiration,
                medicalExpiration: w.medicalExpiration,
                respiratorFitExpiration: w.respiratorFitExpiration,
                leadExpiration: w.leadExpiration,
                leadMedExpiration: w.leadMedExpiration,
                respiratorTypes: w.respiratorTypes,
                project: project
            )
            modelContext.insert(copy)
            count += 1
        }
        try? modelContext.save()
        appState.showToast("\(count) worker\(count == 1 ? "" : "s") copied")
        dismiss()
    }
}
