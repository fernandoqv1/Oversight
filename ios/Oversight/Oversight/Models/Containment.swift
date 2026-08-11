//
//  Containment.swift
//  Oversight
//
//  A containment work area within a building, tracked through the five
//  abatement stages. Spaces stored as name snapshots — fixed at creation,
//  matching oversight-store.jsx's snapshot approach. Visual inspections
//  (Pre-Start and Final) are stored in the visualInspections relationship,
//  mirroring containment.visualInspections[] in js/project.js.
//

import Foundation
import SwiftData

@Model
final class Containment {
    var name: String
    var buildingName: String
    var stageRaw: String
    var spaceNames: [String]
    var project: Project?

    @Relationship(deleteRule: .cascade, inverse: \VisualInspection.containment)
    var visualInspections: [VisualInspection] = []

    init(
        name: String,
        buildingName: String,
        stage: Stage = .containmentPreparation,
        spaceNames: [String] = [],
        project: Project? = nil
    ) {
        self.name = name
        self.buildingName = buildingName
        self.stageRaw = stage.rawValue
        self.spaceNames = spaceNames
        self.project = project
    }

    var stage: Stage {
        get { Stage(rawValue: stageRaw) ?? .containmentPreparation }
        set { stageRaw = newValue.rawValue }
    }
}
