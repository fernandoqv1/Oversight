//
//  Inspector.swift
//  Oversight
//
//  Single-row profile record for the signed-in field inspector. Mirrors the
//  `inspector` object in oversight-store.jsx (name, license, initials,
//  signature, free-text certifications) and Profile → Inspector details.
//

import Foundation
import SwiftData

@Model
final class Inspector {
    var name: String
    var company: String = ""
    var phone: String = ""
    var email: String = ""
    var certificationNumber: String = ""
    var license: String = ""
    /// PNG signature capture, stored as raw image data (drawn in the
    /// Signature sheet). Mirrors the desktop app's stored signature image.
    @Attribute(.externalStorage) var signatureData: Data?
    var defaultTemplatesRaw: [String]
    // Legacy field — kept for any existing stored data; no longer shown in UI
    var certifications: String = ""

    init(
        name: String = "",
        company: String = "",
        phone: String = "",
        email: String = "",
        certificationNumber: String = "",
        license: String = "",
        signatureData: Data? = nil,
        defaultTemplates: [DocumentTemplate] = []
    ) {
        self.name = name
        self.company = company
        self.phone = phone
        self.email = email
        self.certificationNumber = certificationNumber
        self.license = license
        self.signatureData = signatureData
        self.defaultTemplatesRaw = defaultTemplates.map(\.rawValue)
        self.certifications = ""
    }

    var initials: String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    var defaultTemplates: [DocumentTemplate] {
        get { defaultTemplatesRaw.compactMap(DocumentTemplate.init(rawValue:)) }
        set { defaultTemplatesRaw = newValue.map(\.rawValue) }
    }
}
