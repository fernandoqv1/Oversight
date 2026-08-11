//
//  VisualInspection.swift
//  Oversight
//
//  Pre-Start and Final visual inspection records tied to a containment,
//  mirroring the visualInspections[] array on containment objects in
//  js/project.js. Stage transitions require these in the desktop app.
//

import Foundation
import SwiftData

@Model
final class VisualInspection {
    var inspectionTypeRaw: String
    var date: Date
    var inspectorName: String
    var passed: Bool
    var notes: String
    var containment: Containment?

    init(
        inspectionType: VisualInspectionType = .preStart,
        date: Date = .now,
        inspectorName: String = "",
        passed: Bool = true,
        notes: String = "",
        containment: Containment? = nil
    ) {
        self.inspectionTypeRaw = inspectionType.rawValue
        self.date = date
        self.inspectorName = inspectorName
        self.passed = passed
        self.notes = notes
        self.containment = containment
    }

    var inspectionType: VisualInspectionType {
        get { VisualInspectionType(rawValue: inspectionTypeRaw) ?? .preStart }
        set { inspectionTypeRaw = newValue.rawValue }
    }
}
