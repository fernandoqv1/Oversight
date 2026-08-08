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
    var license: String
    var certifications: String
    /// PNG signature capture, stored as raw image data (drawn in the
    /// Signature sheet). Mirrors the desktop app's stored signature image.
    @Attribute(.externalStorage) var signatureData: Data?
    var defaultTemplatesRaw: [String]

    init(
        name: String = "",
        license: String = "",
        certifications: String = "",
        signatureData: Data? = nil,
        defaultTemplates: [DocumentTemplate] = []
    ) {
        self.name = name
        self.license = license
        self.certifications = certifications
        self.signatureData = signatureData
        self.defaultTemplatesRaw = defaultTemplates.map(\.rawValue)
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
