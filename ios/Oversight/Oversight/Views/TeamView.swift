//
//  TeamView.swift
//  Oversight
//
//  Worker Roster — ported from TeamScreen in oversight-screens.jsx.
//  Certification labels match desktop worker records: AHERA, Medical,
//  Respirator fit, Lead.
//

import SwiftUI
import SwiftData

struct TeamView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            Section("\(project.workerRoster.count) worker\(project.workerRoster.count == 1 ? "" : "s")") {
                if project.workerRoster.isEmpty {
                    EmptyStateView(title: "No workers", subtitle: "Add the crew roster.", actionLabel: "Add worker") {
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
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Team")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { appState.present(.newWorker(project)) } label: { Image(systemName: "plus") }
            }
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
                            .background((worker.role == .supervisor ? Color.blue : Color.secondary).opacity(0.15), in: Capsule())
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
