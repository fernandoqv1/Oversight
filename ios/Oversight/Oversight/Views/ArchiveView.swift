//
//  ArchiveView.swift
//  Oversight
//
//  Archive tab — completed projects. Ported from ArchiveScreen in
//  oversight-screens.jsx.
//

import SwiftUI
import SwiftData

struct ArchiveView: View {
    @Query(filter: #Predicate<Project> { $0.statusRaw == "completed" }, sort: \Project.createdAt, order: .reverse)
    private var completed: [Project]

    var body: some View {
        List {
            Section("Completed · \(completed.count)") {
                if completed.isEmpty {
                    EmptyStateView(title: "No completed projects yet.")
                } else {
                    ForEach(completed) { project in
                        NavigationLink(value: project) {
                            ProjectRow(project: project)
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Archive")
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
    }
}
