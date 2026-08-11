//
//  WipeSample.swift
//  Oversight
//
//  Lead wipe sample record. Mirrors wipe sample fields in the Windows
//  desktop app (js/project.js). sampleId format: {ProjectNumber}-W{Seq}, e.g. "PJ001-W01".
//

import Foundation
import SwiftData

@Model
final class WipeSample {
    var sampleId: String
    var wipeSampleTypeRaw: String
    var containmentName: String
    var buildingName: String
    var spaceName: String
    var substrate: String
    var component: String
    var squareFeet: Double
    var locationComment: String
    var date: Date
    var inspectorName: String
    var notes: String
    var autoCreated: Bool = false

    var project: Project?

    init(
        sampleId: String,
        wipeSampleType: WipeSampleType = .clearance,
        containmentName: String = "",
        buildingName: String = "",
        spaceName: String = "",
        substrate: String = "",
        component: String = "",
        squareFeet: Double = 0,
        locationComment: String = "",
        date: Date = .now,
        inspectorName: String = "",
        notes: String = "",
        autoCreated: Bool = false,
        project: Project? = nil
    ) {
        self.sampleId = sampleId
        self.wipeSampleTypeRaw = wipeSampleType.rawValue
        self.containmentName = containmentName
        self.buildingName = buildingName
        self.spaceName = spaceName
        self.substrate = substrate
        self.component = component
        self.squareFeet = squareFeet
        self.locationComment = locationComment
        self.date = date
        self.inspectorName = inspectorName
        self.notes = notes
        self.autoCreated = autoCreated
        self.project = project
    }

    var wipeSampleType: WipeSampleType {
        get { WipeSampleType(rawValue: wipeSampleTypeRaw) ?? .clearance }
        set { wipeSampleTypeRaw = newValue.rawValue }
    }
}
