//
//  AirSample.swift
//  Oversight
//
//  Air monitoring sample. sampleId format matches buildAirSampleIdPrefix()
//  in js/project.js: "{projectNumber}-{hazardSegment}{typePrefix}{sequence}"
//  e.g. OVS-2041-AS08 (asbestos area), OVS-2041-Pb-PS01 (lead personal).
//  Volume/elapsed calculation mirrors calcElapsed / calcVolume in
//  oversight-store.jsx.
//

import Foundation
import SwiftData

@Model
final class AirSample {
    var sampleId: String
    var sampleTypeRaw: String
    /// "Asbestos" or "Lead" — matches the hazard dropdown in the desktop
    /// sample form. Affects sample ID prefix (Pb- segment for lead).
    var hazardTypeRaw: String
    var location: String
    var containmentName: String
    var date: Date

    var startTime: Date?
    var stopTime: Date?
    var startFlowRate: Double?
    var stopFlowRate: Double?
    /// Groups auto-created clearance samples from the same stage transition.
    var sampleSetId: String?
    var autoCreated: Bool = false

    var project: Project?

    init(
        sampleId: String,
        sampleType: SampleType,
        hazardType: HazardType = .asbestos,
        location: String = "",
        containmentName: String = "",
        date: Date = .now,
        startTime: Date? = nil,
        stopTime: Date? = nil,
        startFlowRate: Double? = nil,
        stopFlowRate: Double? = nil,
        sampleSetId: String? = nil,
        autoCreated: Bool = false,
        project: Project? = nil
    ) {
        self.sampleId = sampleId
        self.sampleTypeRaw = sampleType.rawValue
        self.hazardTypeRaw = hazardType.rawValue
        self.location = location
        self.containmentName = containmentName
        self.date = date
        self.startTime = startTime
        self.stopTime = stopTime
        self.startFlowRate = startFlowRate
        self.stopFlowRate = stopFlowRate
        self.sampleSetId = sampleSetId
        self.autoCreated = autoCreated
        self.project = project
    }

    var sampleType: SampleType {
        get { SampleType(rawValue: sampleTypeRaw) ?? .area }
        set { sampleTypeRaw = newValue.rawValue }
    }

    var hazardType: HazardType {
        get { HazardType(rawValue: hazardTypeRaw) ?? .asbestos }
        set { hazardTypeRaw = newValue.rawValue }
    }

    var isRunning: Bool { startTime != nil && stopTime == nil }

    var elapsedMinutes: Int? {
        guard let start = startTime else { return nil }
        let end = stopTime ?? Date.now
        return max(0, Int(end.timeIntervalSince(start) / 60))
    }

    var sampleVolume: Int? {
        guard let minutes = elapsedMinutes, !isRunning else { return nil }
        let flows = [startFlowRate, stopFlowRate].compactMap { $0 }
        guard !flows.isEmpty else { return nil }
        let avg = flows.reduce(0, +) / Double(flows.count)
        return Int((avg * Double(minutes)).rounded())
    }

    var runningVolumeEstimate: Int? {
        guard isRunning, let minutes = elapsedMinutes else { return nil }
        let flow = startFlowRate ?? 2.0
        return Int((flow * Double(minutes)).rounded())
    }

    /// Short ID for display (strips project number prefix).
    var shortID: String {
        let parts = sampleId.components(separatedBy: "-")
        guard parts.count > 2 else { return sampleId }
        return parts.dropFirst(2).joined(separator: "-")
    }
}
