//
//  AirSample.swift
//  Oversight
//
//  Air monitoring sample. sampleId format matches buildAirSampleIdPrefix()
//  in js/project.js: "{projectNumber}-{typePrefix}{sequence}" — e.g.
//  OVS-2041-AS08, OVS-2041-PS03, OVS-2041-CA01. Volume/elapsed calculation
//  mirrors calcElapsed / calcVolume in oversight-store.jsx.
//

import Foundation
import SwiftData

@Model
final class AirSample {
    var sampleId: String
    var sampleTypeRaw: String
    var location: String
    var containmentName: String
    var date: Date

    /// Start/stop are stored as full timestamps so elapsed time and the
    /// "running" state are exact — the desktop app stores HH:mm strings
    /// on a given date, which this preserves via calendar components.
    var startTime: Date?
    var stopTime: Date?
    var startFlowRate: Double?
    var stopFlowRate: Double?

    var project: Project?

    init(
        sampleId: String,
        sampleType: SampleType,
        location: String = "",
        containmentName: String = "",
        date: Date = .now,
        startTime: Date? = nil,
        stopTime: Date? = nil,
        startFlowRate: Double? = nil,
        stopFlowRate: Double? = nil,
        project: Project? = nil
    ) {
        self.sampleId = sampleId
        self.sampleTypeRaw = sampleType.rawValue
        self.location = location
        self.containmentName = containmentName
        self.date = date
        self.startTime = startTime
        self.stopTime = stopTime
        self.startFlowRate = startFlowRate
        self.stopFlowRate = stopFlowRate
        self.project = project
    }

    var sampleType: SampleType {
        get { SampleType(rawValue: sampleTypeRaw) ?? .area }
        set { sampleTypeRaw = newValue.rawValue }
    }

    /// A sample with a start time but no stop time is still running —
    /// mirrors sampleRunning() in oversight-store.jsx.
    var isRunning: Bool { startTime != nil && stopTime == nil }

    /// Elapsed minutes: uses stopTime if set, otherwise "now" for a
    /// running sample (mirrors runningElapsedMin()).
    var elapsedMinutes: Int? {
        guard let start = startTime else { return nil }
        let end = stopTime ?? Date.now
        let minutes = Int(end.timeIntervalSince(start) / 60)
        return max(0, minutes)
    }

    /// Sampled volume in liters = average(start flow, stop flow) × minutes,
    /// mirrors calcVolume() in oversight-store.jsx.
    var sampleVolume: Int? {
        guard let minutes = elapsedMinutes, !isRunning else { return nil }
        let flows = [startFlowRate, stopFlowRate].compactMap { $0 }
        guard !flows.isEmpty else { return nil }
        let avg = flows.reduce(0, +) / Double(flows.count)
        return Int((avg * Double(minutes)).rounded())
    }

    /// Live volume estimate for a still-running sample (Today screen).
    var runningVolumeEstimate: Int? {
        guard isRunning, let minutes = elapsedMinutes else { return nil }
        let flow = startFlowRate ?? 2.0
        return Int((flow * Double(minutes)).rounded())
    }
}
