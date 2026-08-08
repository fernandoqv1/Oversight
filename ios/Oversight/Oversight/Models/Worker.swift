//
//  Worker.swift
//  Oversight
//
//  Crew roster entry ("Worker Roster" — matches templates/Worker Roster
//  Template.docx and js/excel.js sheet name). Certification expiration
//  fields match js/project.js worker records: AHERA, medical, respirator
//  fit-test, lead training, lead medical.
//

import Foundation
import SwiftData

@Model
final class Worker {
    var name: String
    var roleRaw: String

    var aheraExpiration: Date?
    var medicalExpiration: Date?
    var respiratorFitExpiration: Date?
    var leadExpiration: Date?
    var leadMedExpiration: Date?

    var respiratorTypesRaw: [String]

    var project: Project?

    init(
        name: String,
        role: WorkerRole = .worker,
        aheraExpiration: Date? = nil,
        medicalExpiration: Date? = nil,
        respiratorFitExpiration: Date? = nil,
        leadExpiration: Date? = nil,
        leadMedExpiration: Date? = nil,
        respiratorTypes: [RespiratorType] = [.halfFace],
        project: Project? = nil
    ) {
        self.name = name
        self.roleRaw = role.rawValue
        self.aheraExpiration = aheraExpiration
        self.medicalExpiration = medicalExpiration
        self.respiratorFitExpiration = respiratorFitExpiration
        self.leadExpiration = leadExpiration
        self.leadMedExpiration = leadMedExpiration
        self.respiratorTypesRaw = respiratorTypes.map(\.rawValue)
        self.project = project
    }

    var role: WorkerRole {
        get { WorkerRole(rawValue: roleRaw) ?? .worker }
        set { roleRaw = newValue.rawValue }
    }

    var respiratorTypes: [RespiratorType] {
        get { respiratorTypesRaw.compactMap(RespiratorType.init(rawValue:)) }
        set { respiratorTypesRaw = newValue.map(\.rawValue) }
    }

    var initials: String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    /// True if any tracked certification has lapsed — flags the worker
    /// card red, matching the desktop "expired" cert badge treatment.
    var hasExpiredCertification: Bool {
        let today = Calendar.current.startOfDay(for: .now)
        let dates = [aheraExpiration, medicalExpiration, respiratorFitExpiration]
        return dates.contains { date in
            guard let date else { return false }
            return date < today
        }
    }
}
