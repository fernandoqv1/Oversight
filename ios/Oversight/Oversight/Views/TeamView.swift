//
//  TeamView.swift
//  Oversight
//
//  Worker Roster — tap to edit, swipe to delete.
//  Mirrors the Workers tab in js/project.js.
//

import SwiftUI
import SwiftData

struct TeamView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var deleteConfirmFor: Worker?

    var body: some View {
        List {
            Section("\(project.workerRoster.count) worker\(project.workerRoster.count == 1 ? "" : "s")") {
                if project.workerRoster.isEmpty {
                    EmptyStateView(
                        title: "No workers",
                        subtitle: "Add the crew roster.",
                        actionLabel: "Add worker"
                    ) {
                        appState.present(.newWorker(project))
                    }
                } else {
                    ForEach(project.workerRoster) { worker in
                        Button {
                            appState.present(.editWorker(project, worker))
                        } label: {
                            workerCard(worker)
                        }
                        .foregroundStyle(.primary)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                deleteConfirmFor = worker
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Workers")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        appState.present(.newWorker(project))
                    } label: {
                        Label("Add Worker", systemImage: "person.badge.plus")
                    }
                    Button {
                        appState.present(.copyWorkers(project))
                    } label: {
                        Label("Copy from Another Project", systemImage: "person.2.badge.gearshape")
                    }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .confirmationDialog(
            "Delete \(deleteConfirmFor?.name ?? "") from the worker roster?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Worker", role: .destructive) {
                if let w = deleteConfirmFor {
                    modelContext.delete(w)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func workerCard(_ worker: Worker) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(worker.initials)
                    .font(.caption.weight(.bold))
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Color.accentColor.opacity(0.15)))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(worker.name).font(.subheadline.weight(.semibold))
                        Text(worker.role.label)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(
                                (worker.role == .supervisor ? Color.blue : Color.secondary).opacity(0.15),
                                in: Capsule()
                            )
                            .foregroundStyle(worker.role == .supervisor ? .blue : .secondary)
                    }
                    Text(worker.respiratorTypes.map(\.rawValue).joined(separator: ", "))
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                if worker.hasExpiredCertification {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
            }
            HStack(spacing: 14) {
                certColumn("AHERA", worker.aheraExpiration)
                certColumn("Medical", worker.medicalExpiration)
                certColumn("Resp. fit", worker.respiratorFitExpiration)
                certColumn("Lead", worker.leadExpiration)
            }
        }
        .padding(.vertical, 4)
    }

    private func certColumn(_ label: String, _ date: Date?) -> some View {
        let expired = date.map { $0 < Calendar.current.startOfDay(for: .now) } ?? false
        return VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(date.map { Fmt.date($0) } ?? "—")
                .font(.caption2.weight(.semibold).monospacedDigit())
                .foregroundStyle(expired ? .red : .primary)
        }
    }
}
