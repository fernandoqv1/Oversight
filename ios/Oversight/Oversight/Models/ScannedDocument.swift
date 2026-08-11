//
//  ScannedDocument.swift
//  Oversight
//
//  Per-project scanned document records. Each page's JPEG data is stored
//  with .externalStorage so SwiftData keeps image bytes out of the SQLite
//  database file.
//

import Foundation
import SwiftData

@Model
final class ScannedDocument {
    var name: String
    var date: Date
    var project: Project?

    @Relationship(deleteRule: .cascade, inverse: \ScannedPage.document)
    var pages: [ScannedPage] = []

    var pageCount: Int { pages.count }

    init(name: String, date: Date = .now, project: Project? = nil) {
        self.name = name
        self.date = date
        self.project = project
    }
}

@Model
final class ScannedPage {
    @Attribute(.externalStorage) var imageData: Data
    var pageNumber: Int
    var document: ScannedDocument?

    init(imageData: Data, pageNumber: Int = 0) {
        self.imageData = imageData
        self.pageNumber = pageNumber
    }
}
