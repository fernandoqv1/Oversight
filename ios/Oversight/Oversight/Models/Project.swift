//
//  Project.swift
//  Oversight
//
//  Top-level project record. Field names mirror the desktop schema
//  (projectNumber, siteName, siteAddress, clientName, contractor,
//  foremanName, dueDate) from js/main.js / js/project.js so document
//  generation and any future desktop data import lines up 1:1.
//

import Foundation
import SwiftData

@Model
final class Project {
    var projectNumber: String
    var siteName: String
    var siteAddress: String

    var clientName: String
    var clientPhone: String
    var clientContactName: String
    var clientContactPhone: String

    var contractor: String
    var contractorPhone: String
    var foremanName: String
    var foremanPhone: String

    var statusRaw: String
    var dueDate: Date?
    var createdAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Building.project)
    var buildings: [Building] = []

    @Relationship(deleteRule: .cascade, inverse: \Containment.project)
    var containments: [Containment] = []

    @Relationship(deleteRule: .cascade, inverse: \AirSample.project)
    var airSamples: [AirSample] = []

    @Relationship(deleteRule: .cascade, inverse: \Worker.project)
    var workerRoster: [Worker] = []

    @Relationship(deleteRule: .cascade, inverse: \DailyLog.project)
    var dailyLogs: [DailyLog] = []

    @Relationship(deleteRule: .cascade, inverse: \GeneratedDocument.project)
    var documents: [GeneratedDocument] = []

    init(
        projectNumber: String,
        siteName: String,
        siteAddress: String = "",
        clientName: String = "",
        clientPhone: String = "",
        clientContactName: String = "",
        clientContactPhone: String = "",
        contractor: String = "",
        contractorPhone: String = "",
        foremanName: String = "",
        foremanPhone: String = "",
        status: ProjectStatus = .active,
        dueDate: Date? = nil,
        createdAt: Date = .now
    ) {
        self.projectNumber = projectNumber
        self.siteName = siteName
        self.siteAddress = siteAddress
        self.clientName = clientName
        self.clientPhone = clientPhone
        self.clientContactName = clientContactName
        self.clientContactPhone = clientContactPhone
        self.contractor = contractor
        self.contractorPhone = contractorPhone
        self.foremanName = foremanName
        self.foremanPhone = foremanPhone
        self.statusRaw = status.rawValue
        self.dueDate = dueDate
        self.createdAt = createdAt
    }

    var status: ProjectStatus {
        get { ProjectStatus(rawValue: statusRaw) ?? .active }
        set { statusRaw = newValue.rawValue }
    }
}

/// A generated report/document record (Docs tab). Mirrors the
/// `documents` array in oversight-store.jsx: { name, date }.
@Model
final class GeneratedDocument {
    var name: String
    var date: Date
    var project: Project?

    init(name: String, date: Date = .now, project: Project? = nil) {
        self.name = name
        self.date = date
        self.project = project
    }
}
