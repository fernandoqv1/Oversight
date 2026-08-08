//
//  Containment.swift
//  Oversight
//
//  A containment work area within a building, tracked through the five
//  abatement stages (js/project.js ALL_STAGES). Spaces are stored as a
//  name snapshot (matching oversight-store.jsx's { id, name } snapshot
//  approach) rather than a live relationship, since a containment's
//  space list is fixed at creation and shouldn't drift if a space is
//  later renamed elsewhere.
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
