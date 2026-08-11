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
/// exactly — these strings are written into stored projects and documents.
enum Stage: String, CaseIterable, Codable, Identifiable {
    case containmentPreparation = "Containment Preparation"
    case activeAbatement = "Active Abatement"
    case containmentClearance = "Containment Clearance"
    case containmentTeardown = "Containment Teardown"
    case abatementCompleted = "Abatement Completed"

    var id: String { rawValue }

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
        case .activeAbatement: return Color(red: 0.01, green: 0.365, blue: 0.671)
        case .containmentClearance: return .purple
        case .containmentTeardown: return .brown
        case .abatementCompleted: return .green
        }
    }

    var systemImage: String {
        switch self {
        case .containmentPreparation: return "hammer.fill"
        case .activeAbatement:        return "shield.fill"
        case .containmentClearance:   return "magnifyingglass"
        case .containmentTeardown:    return "wrench.and.screwdriver.fill"
        case .abatementCompleted:     return "checkmark.circle.fill"
        }
    }

    var isAbated: Bool {
        switch self {
        case .containmentClearance, .containmentTeardown, .abatementCompleted: return true
        default: return false
        }
    }
}

/// Air sample category. Matches SAMPLE_TYPES in the prototype.
enum SampleType: String, CaseIterable, Codable, Identifiable {
    case area = "Area"
    case personal = "Personal"
    case clearance = "Clearance"

    var id: String { rawValue }

    /// Base prefix — matches getAirSampleTypePrefix() in js/project.js.
    /// For lead samples the HazardType contributes "Pb-" before this prefix.
    var idPrefix: String {
        switch self {
        case .personal: return "PS"
        case .clearance: return "CA"
        case .area: return "AS"
        }
    }

    var tagColor: Color {
        switch self {
        case .area: return .blue
        case .personal: return .teal
        case .clearance: return .purple
        }
    }
}

/// Hazard type for an air sample — Asbestos or Lead (Pb).
/// Mirrors the hazard dropdown in the desktop app's sample form; lead samples
/// get "Pb-" inserted into the sample ID prefix.
enum HazardType: String, CaseIterable, Codable, Identifiable {
    case asbestos = "Asbestos"
    case lead = "Lead"

    var id: String { rawValue }

    /// Inserted between the project number and sample-type prefix for lead.
    /// e.g. OVS-2041-AS08 (asbestos) vs OVS-2041-Pb-PS01 (lead personal).
    var idSegment: String {
        switch self {
        case .asbestos: return ""
        case .lead: return "Pb-"
        }
    }
}

/// Visual inspection type — Pre-Start (before abatement begins) or Final
/// (before clearance sampling). Mirrors visualInspectionType values in
/// js/project.js openEditVisualInspectionModal.
enum VisualInspectionType: String, CaseIterable, Codable, Identifiable {
    case preStart = "Pre-Start"
    case finalInspection = "Final"

    var id: String { rawValue }
}

/// Worker certification role. Matches certificationType values ('S'/'W').
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

/// Material assessment/category.
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

/// Analysis method for a bulk sample — PLM/TEM/SEM for asbestos, XRF/ICP for lead.
enum BulkAnalysisType: String, CaseIterable, Codable, Identifiable {
    case plm = "PLM"
    case tem = "TEM"
    case sem = "SEM"
    case xrf = "XRF"
    case icp = "ICP"

    var id: String { rawValue }
}

/// Wipe sample category — mirrors wipe sample types in the Windows desktop app.
enum WipeSampleType: String, CaseIterable, Codable, Identifiable {
    case preStart = "Pre-Start"
    case clearance = "Clearance"
    case custom = "Custom"

    var id: String { rawValue }
}

/// Document templates available for generation.
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
