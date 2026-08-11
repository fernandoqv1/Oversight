//
//  Site.swift
//  Oversight
//
//  Buildings → Spaces → Materials, mirroring the desktop schema
//  (project.buildings[].spaces[].materials[]) used for ACM tracking.
//

import Foundation
import SwiftData

@Model
final class Building {
    var name: String
    var project: Project?

    @Relationship(deleteRule: .cascade, inverse: \Space.building)
    var spaces: [Space] = []

    init(name: String, project: Project? = nil) {
        self.name = name
        self.project = project
    }
}

@Model
final class Space {
    var name: String
    var building: Building?

    @Relationship(deleteRule: .cascade, inverse: \Material.space)
    var materials: [Material] = []

    init(name: String, building: Building? = nil) {
        self.name = name
        self.building = building
    }
}

/// Asbestos-containing material (ACM) record, scoped to a space.
/// Fields match desktop material records: name, quantity, unit, type,
/// hmrNumber (lab tracking), isFriable (ACM classification).
@Model
final class Material {
    var name: String
    var quantity: Double
    var unitRaw: String
    var materialTypeRaw: String
    /// HMR# — lab hazardous materials record number, optional.
    var hmrNumber: String
    /// Friable vs non-friable ACM classification.
    var isFriable: Bool
    var space: Space?

    init(
        name: String,
        quantity: Double = 0,
        unit: MaterialUnit = .squareFeet,
        materialType: MaterialType = .surfacing,
        hmrNumber: String = "",
        isFriable: Bool = false,
        space: Space? = nil
    ) {
        self.name = name
        self.quantity = quantity
        self.unitRaw = unit.rawValue
        self.materialTypeRaw = materialType.rawValue
        self.hmrNumber = hmrNumber
        self.isFriable = isFriable
        self.space = space
    }

    var unit: MaterialUnit {
        get { MaterialUnit(rawValue: unitRaw) ?? .squareFeet }
        set { unitRaw = newValue.rawValue }
    }

    var materialType: MaterialType {
        get { MaterialType(rawValue: materialTypeRaw) ?? .surfacing }
        set { materialTypeRaw = newValue.rawValue }
    }
}
