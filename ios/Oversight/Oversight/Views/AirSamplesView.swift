//
//  AirSamplesView.swift
//  Oversight
//
//  Ported from SamplesScreen in oversight-screens.jsx — All/Running/
//  Clearance segments, tap a row to edit.
//

import SwiftUI
import SwiftData

struct AirSamplesView: View {
    @Bindable var project: Project
    @Environment(AppState.self) private var appState
    @State private var segment: Segment = .all

    enum Segment: String, CaseIterable, Identifiable {
        case all = "All", running = "Running", clearance = "Clearance"
        var id: String { rawValue }
    }

    private var samples: [AirSample] {
        var list = project.airSamples.sorted { $0.date > $1.date }
        switch segment {
        case .all: break
        case .running: list = list.filter(\.isRunning)
        case .clearance: list = list.filter { $0.sampleType == .clearance }
        }
        return list
    }

    var body: some View {
        List {
            Section {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    StatCard(label: "Total Samples", value: "\(project.airSamples.count)", subtitle: "")
                    StatCard(label: "Running", value: "\(project.airSamples.filter(\.isRunning).count)", subtitle: "\(project.airSamples.compactMap(\.sampleVolume).reduce(0, +)) L logged")
                }
                .listRowInsets(EdgeInsets())
                .padding(12)
            }

            Section("\(samples.count) sample\(samples.count == 1 ? "" : "s")") {
                if samples.isEmpty {
                    EmptyStateView(title: "No samples", subtitle: "Log the first air sample.", actionLabel: "Add air sample") {
                        appState.present(.newSample(project))
                    }
                } else {
                    ForEach(samples) { sample in
                        Button {
                            appState.present(.editSample(project, sample))
                        } label: {
                            sampleRow(sample)
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .top) {
            Picker("Filter", selection: $segment) {
                ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 6)
            .background(.bar)
        }
        .navigationTitle("Air Samples")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { appState.present(.newSample(project)) } label: { Image(systemName: "plus") }
            }
        }
    }

    private func sampleRow(_ sample: AirSample) -> some View {
        let elapsed = sample.elapsedMinutes
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(sample.sampleId).font(.subheadline.weight(.semibold).monospaced())
                SampleTypeTag(type: sample.sampleType)
                Spacer()
                Text(sample.isRunning ? "Running" : "Complete")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background((sample.isRunning ? Color.green : Color.secondary).opacity(0.15), in: Capsule())
                    .foregroundStyle(sample.isRunning ? .green : .secondary)
            }
            if !sample.location.isEmpty {
                Text(sample.location).font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 16) {
                metric("Date", Fmt.date(sample.date))
                metric("Elapsed", Fmt.clock(elapsed))
                metric("Volume", sample.sampleVolume.map { "\($0) L" } ?? "—")
            }
        }
        .padding(.vertical, 4)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.caption.weight(.semibold).monospacedDigit())
        }
    }
}
