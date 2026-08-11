//
//  BulkSample.swift
//  Oversight
//
//  Bulk material sample record. Mirrors bulk sample fields in the Windows
//  desktop app (js/project.js). sampleId format: {HMR#}{Letter}, e.g. "01A".
//

import Foundation
import SwiftData

@Model
final class BulkSample {
    var sampleId: String
    var materialName: String
    var hmrNumber: String
    var location: String
    var containmentName: String
    var hazardTypeRaw: String
    var analysisTypeRaw: String
    var date: Date
    var inspectorName: String
    var notes: String
    var autoCreated: Bool = false

    var project: Project?

    init(
        sampleId: String,
        materialName: String = "",
        hmrNumber: String = "",
        location: String = "",
        containmentName: String = "",
        hazardType: HazardType = .asbestos,
        analysisType: BulkAnalysisType = .plm,
        date: Date = .now,
        inspectorName: String = "",
        notes: String = "",
        autoCreated: Bool = false,
        project: Project? = nil
    ) {
        self.sampleId = sampleId
        self.materialName = materialName
        self.hmrNumber = hmrNumber
        self.location = location
        self.containmentName = containmentName
        self.hazardTypeRaw = hazardType.rawValue
        self.analysisTypeRaw = analysisType.rawValue
        self.date = date
        self.inspectorName = inspectorName
        self.notes = notes
        self.autoCreated = autoCreated
        self.project = project
    }

    var hazardType: HazardType {
        get { HazardType(rawValue: hazardTypeRaw) ?? .asbestos }
        set { hazardTypeRaw = newValue.rawValue }
    }

    var analysisType: BulkAnalysisType {
        get { BulkAnalysisType(rawValue: analysisTypeRaw) ?? .plm }
        set { analysisTypeRaw = newValue.rawValue }
    }
}
