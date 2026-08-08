//
//  Components.swift
//  Oversight
//
//  Shared row/badge primitives reused across screens — the SwiftUI
//  equivalents of Stage, Bar, and the project row in oversight-ui.jsx /
//  oversight-screens.jsx.
//

import SwiftUI

struct StageBadge: View {
    let stage: Stage

    var body: some View {
        Label {
            Text(stage.rawValue)
                .font(.caption.weight(.semibold))
        } icon: {
            Circle().fill(stage.tintColor).frame(width: 6, height: 6)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(stage.tintColor.opacity(0.14), in: Capsule())
        .foregroundStyle(stage.tintColor)
    }
}

struct SampleTypeTag: View {
    let type: SampleType

    var body: some View {
        Text(type.rawValue)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(type.tagColor.opacity(0.14), in: Capsule())
            .foregroundStyle(type.tagColor)
    }
}

struct ProgressBarView: View {
    var percent: Int
    var tint: Color = .accentColor

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.15))
                Capsule().fill(tint)
                    .frame(width: geo.size.width * CGFloat(min(max(percent, 0), 100)) / 100)
            }
        }
        .frame(height: 6)
    }
}

struct StatCard: View {
    let label: String
    let value: String
    let subtitle: String
    var subtitleColor: Color = .secondary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(subtitleColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct EmptyStateView: View {
    let title: String
    var subtitle: String? = nil
    var actionLabel: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.headline)
            if let subtitle {
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            if let actionLabel, let action {
                Button(actionLabel, action: action)
                    .buttonStyle(.bordered)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

struct ProjectRow: View {
    let project: Project
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Circle()
                    .fill(project.isOverdue ? .red : (project.status == .completed ? .secondary : .green))
                    .frame(width: 7, height: 7)
                Text(project.projectNumber)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Spacer()
                Text(project.dueLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(project.isOverdue ? .red : (project.status == .completed ? .secondary : .primary))
            }
            Text(project.siteName)
                .font(.headline)
            if !compact {
                Text(project.siteAddress)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            HStack(spacing: 10) {
                StageBadge(stage: project.leadStage)
                ProgressBarView(percent: project.percentComplete)
                Text("\(project.percentComplete)%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

func avatarInitials(_ name: String) -> String {
    let parts = name.split(separator: " ")
    let letters = parts.prefix(2).compactMap { $0.first }
    return letters.isEmpty ? "?" : String(letters).uppercased()
}
