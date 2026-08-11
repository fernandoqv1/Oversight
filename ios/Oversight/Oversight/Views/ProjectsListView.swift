//
//  ProjectsListView.swift
//  Oversight
//
//  Projects tab — searchable list with Active/Overdue/All segments.
//  Ported from ProjectsScreen in oversight-screens.jsx.
//

import SwiftUI
import SwiftData

struct ProjectsListView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \Project.createdAt, order: .reverse) private var allProjects: [Project]
    @State private var segment: Segment = .active
    @State private var query = ""

    enum Segment: String, CaseIterable, Identifiable {
        case active = "Active", overdue = "Overdue", all = "All"
        var id: String { rawValue }
    }

    private var filtered: [Project] {
        var list = allProjects
        switch segment {
        case .active: list = list.filter { $0.status == .active }
        case .overdue: list = list.filter(\.isOverdue)
        case .all: break
        }
        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
            let t = query.lowercased()
            list = list.filter { ($0.siteName + $0.projectNumber + $0.siteAddress).lowercased().contains(t) }
        }
        return list
    }

    var body: some View {
        List {
            Section("\(filtered.count) \(segment == .overdue ? "overdue" : segment.rawValue.lowercased()) \(filtered.count == 1 ? "project" : "projects")") {
                if filtered.isEmpty {
                    EmptyStateView(title: "No projects", subtitle: "Tap + to add one.")
                } else {
                    ForEach(filtered) { project in
                        NavigationLink(value: project) {
                            ProjectRow(project: project)
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .searchable(text: $query, prompt: "Search projects, sites, samples…")
        .safeAreaInset(edge: .top) {
            Picker("Filter", selection: $segment) {
                ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 6)
            .background(.bar)
        }
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        appState.present(.newProject)
                    } label: {
                        Label("New Project", systemImage: "plus")
                    }
                    Button {
                        appState.present(.importExcel)
                    } label: {
                        Label("Import from Excel", systemImage: "square.and.arrow.down")
                    }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
    }
}
