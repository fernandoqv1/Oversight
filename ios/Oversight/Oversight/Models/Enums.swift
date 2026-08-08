//
//  Enums.swift
//  Oversight
//
//  Shared vocabulary — mirrors the terminology already used across the
//  Oversight desktop app (js/project.js, js/main.js) and its document
//  templates in /templates. Do not rename cases without checking those
//  source files; report generation depends on these exact labels.
//

import SwiftUI

/// Containment lifecycle stage. Raw values match `ALL_STAGES` in js/project.js
/// exactly (STAGE_CONTAINMENT_PREPARATION, STAGE_ACTIVE_ABATEMENT, etc.) —
/// these strings are written into stored projects and documents, so they
/// must stay byte-identical to the desktop app's stage names.
enum Stage: String, CaseIterable, Codable, Identifiable {
    case containmentPreparation = "Containment Preparation"
    case activeAbatement = "Active Abatement"
    case containmentClearance = "Containment Clearance"
    case containmentTeardown = "Containment Teardown"
    case abatementCompleted = "Abatement Completed"

    var id: String { rawValue }

    /// Short label for compact UI (stage stepper, badges).
    var shortLabel: String {
        switch self {
        case .containmentPreparation: return "Prep"
        case .activeAbatement: return "Active"
        case .containmentClearance: return "Clearance"
        case .containmentTeardown: return "Teardown"
        case .abatementCompleted: return "Completed"
        }
    }

    var index: Int { Stage.allCases.firstIndex(of: self) ?? 0 }

    var tintColor: Color {
        switch self {
        case .containmentPreparation: return .orange
        case .activeAbatement: return Color(red: 0.01, green: 0.365, blue: 0.671) // AsbTrack Blue
        case .containmentClearance: return .purple
        case .containmentTeardown: return .brown
        case .abatementCompleted: return .green
        }
    }

    /// Stages that count as "abated" for percentage-complete rollups
    /// (mirrors ABATED_STAGES in js/main.js — material removal completed,
    /// on or after Containment Clearance).
    var isAbated: Bool {
        switch self {
        case .containmentClearance, .containmentTeardown, .abatementCompleted: return true
        default: return false
        }
    }
}

/// Air sample category. Matches SAMPLE_TYPES in the prototype and the
/// `type` field used throughout js/project.js air sample records.
enum SampleType: String, CaseIterable, Codable, Identifiable {
    case area = "Area"
    case personal = "Personal"
    case clearance = "Clearance"
    case background = "Background"

    var id: String { rawValue }

    /// Sample ID prefix — matches getAirSampleTypePrefix() in js/project.js:
    /// Personal -> PS, Clearance -> CA, everything else (Area, Background) -> AS.
    var idPrefix: String {
        switch self {
        case .personal: return "PS"
        case .clearance: return "CA"
        case .area, .background: return "AS"
        }
    }

    var tagColor: Color {
        switch self {
        case .area: return .blue
        case .personal: return .teal
        case .clearance: return .purple
        case .background: return .gray
        }
    }
}

/// Worker certification role. Matches certificationType values ('S'/'W')
/// used in js/project.js worker records ("Supervisor" / "Worker" badges).
enum WorkerRole: String, CaseIterable, Codable, Identifiable {
    case supervisor = "S"
    case worker = "W"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .supervisor: return "Supervisor"
        case .worker: return "Worker"
        }
    }
}

/// Respirator type — matches respiratorOptions in js/project.js.
enum RespiratorType: String, CaseIterable, Codable, Identifiable {
    case halfFace = "Half-Face"
    case fullFace = "Full-Face"
    case papr = "PAPR"

    var id: String { rawValue }
}

/// Material assessment/category — matches the material "type" values used
/// on desktop (Surfacing, TSI = Thermal System Insulation, Misc).
enum MaterialType: String, CaseIterable, Codable, Identifiable {
    case surfacing = "Surfacing"
    case tsi = "TSI"
    case misc = "Misc"

    var id: String { rawValue }
}

/// Material quantity unit — matches UNITS in the prototype (ft², LF, EA, ft³).
enum MaterialUnit: String, CaseIterable, Codable, Identifiable {
    case squareFeet = "ft²"
    case linearFeet = "LF"
    case each = "EA"
    case cubicFeet = "ft³"

    var id: String { rawValue }
}

/// Project status.
enum ProjectStatus: String, Codable {
    case active
    case completed
}

/// In-app accent color choices (Profile → Appearance).
enum AppAccent: String, CaseIterable, Codable, Identifiable {
    case blue, teal, slate

    var id: String { rawValue }

    var name: String {
        switch self {
        case .blue: return "AsbTrack Blue"
        case .teal: return "Field Teal"
        case .slate: return "Graphite"
        }
    }

    var color: Color {
        switch self {
        case .blue: return Color(red: 0.01, green: 0.365, blue: 0.671)
        case .teal: return Color(red: 0.055, green: 0.486, blue: 0.482)
        case .slate: return Color(red: 0.247, green: 0.278, blue: 0.337)
        }
    }
}

/// Document templates available for generation. File names match the real
/// .docx templates shipped with the desktop app under /templates.
enum DocumentTemplate: String, CaseIterable, Codable, Identifiable {
    case airSample = "Air Sample Template"
    case dailyLog = "Daily Log Template"
    case containmentSummary = "Containment Summary Template"
    case visualInspection = "Visual Inspection Template"
    case workerRoster = "Worker Roster Template"
    case bulkSample = "Bulk Sample Template"
    case leadWipe = "Lead Wipe Template"

    var id: String { rawValue }

    var summary: String {
        switch self {
        case .airSample: return "Air sample results & volumes"
        case .dailyLog: return "Compiled site logs with photos"
        case .containmentSummary: return "Containment stage summary"
        case .visualInspection: return "Pre-clearance visual inspection"
        case .workerRoster: return "Crew certifications snapshot"
        case .bulkSample: return "Bulk sample lab results"
        case .leadWipe: return "Lead wipe sample results"
        }
    }
}
