//
//  DocxKit.swift
//  Oversight
//
//  Pure-Swift .docx (Word) writer for Chain of Custody forms.
//  A .docx is a ZIP archive containing Open XML files. This uses the same
//  STORED (method 0, no compression) ZIP approach as XLSXKit.swift so the
//  resulting file opens in Word, Pages, and Excel on all platforms.
//

import Foundation

// MARK: - DocxWriter (ZIP builder)

struct DocxWriter {
    private var entries: [(path: String, data: Data)] = []

    mutating func add(path: String, content: String) {
        if let data = content.data(using: .utf8) {
            entries.append((path: path, data: data))
        }
    }

    func build() -> Data {
        var blob = Data()
        var centralDir = Data()

        let (dosDate, dosTime) = docxDosDateTime()

        for entry in entries {
            let nameBytes = Data(entry.path.utf8)
            let fileData = entry.data
            let crc = docxCRC32(fileData)
            let sz = UInt32(fileData.count)
            let localOffset = UInt32(blob.count)

            // Local file header
            var lh = Data()
            lh.docxAppendLE(UInt32(0x04034b50))   // signature
            lh.docxAppendLE(UInt16(20))             // version needed
            lh.docxAppendLE(UInt16(0))              // flags
            lh.docxAppendLE(UInt16(0))              // method: STORED
            lh.docxAppendLE(dosTime)
            lh.docxAppendLE(dosDate)
            lh.docxAppendLE(crc)
            lh.docxAppendLE(sz)
            lh.docxAppendLE(sz)
            lh.docxAppendLE(UInt16(nameBytes.count))
            lh.docxAppendLE(UInt16(0))              // extra field length
            lh.append(nameBytes)
            lh.append(fileData)
            blob.append(lh)

            // Central directory entry
            var cd = Data()
            cd.docxAppendLE(UInt32(0x02014b50))
            cd.docxAppendLE(UInt16(20))
            cd.docxAppendLE(UInt16(20))
            cd.docxAppendLE(UInt16(0))
            cd.docxAppendLE(UInt16(0))
            cd.docxAppendLE(dosTime)
            cd.docxAppendLE(dosDate)
            cd.docxAppendLE(crc)
            cd.docxAppendLE(sz)
            cd.docxAppendLE(sz)
            cd.docxAppendLE(UInt16(nameBytes.count))
            cd.docxAppendLE(UInt16(0))  // extra
            cd.docxAppendLE(UInt16(0))  // comment
            cd.docxAppendLE(UInt16(0))  // disk number start
            cd.docxAppendLE(UInt16(0))  // internal attrs
            cd.docxAppendLE(UInt32(0))  // external attrs
            cd.docxAppendLE(localOffset)
            cd.append(nameBytes)
            centralDir.append(cd)
        }

        let cdOffset = UInt32(blob.count)
        blob.append(centralDir)

        // End of central directory
        var eocd = Data()
        eocd.docxAppendLE(UInt32(0x06054b50))
        eocd.docxAppendLE(UInt16(0))
        eocd.docxAppendLE(UInt16(0))
        eocd.docxAppendLE(UInt16(entries.count))
        eocd.docxAppendLE(UInt16(entries.count))
        eocd.docxAppendLE(UInt32(centralDir.count))
        eocd.docxAppendLE(cdOffset)
        eocd.docxAppendLE(UInt16(0))  // comment length
        blob.append(eocd)

        return blob
    }
}

// MARK: - DocxGenerator

enum DocxGenerator {

    // MARK: Static XML pieces

    private static let contentTypesXml = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>
"""

    private static let relsXml = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>
"""

    private static let wordRelsXml = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>
"""

    private static let stylesXml = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:rPr><w:b/><w:sz w:val="18"/></w:rPr></w:style></w:styles>
"""

    // MARK: Public entry point

    static func generateCOC(project: Project, inspector: Inspector?, samples: [AirSample]) -> Data {
        let docXml = buildDocumentXml(project: project, inspector: inspector, samples: samples)

        var writer = DocxWriter()
        writer.add(path: "[Content_Types].xml", content: contentTypesXml)
        writer.add(path: "_rels/.rels", content: relsXml)
        writer.add(path: "word/_rels/document.xml.rels", content: wordRelsXml)
        writer.add(path: "word/styles.xml", content: stylesXml)
        writer.add(path: "word/document.xml", content: docXml)
        return writer.build()
    }

    // MARK: Document XML builder

    private static func buildDocumentXml(project: Project, inspector: Inspector?, samples: [AirSample]) -> String {
        let dateFmt = DateFormatter()
        dateFmt.dateFormat = "MM/dd/yyyy"
        let timeFmt = DateFormatter()
        timeFmt.dateFormat = "HH:mm"
        let now = dateFmt.string(from: .now)

        var body = ""

        // Title
        body += para(text: "CHAIN OF CUSTODY \u{2014} AIR SAMPLE ANALYSIS", bold: true, size: 28, centered: true)
        body += para(text: "")

        // Project info table
        let infoRows: [(String, String)] = [
            ("Project Number:", project.projectNumber),
            ("Site Name:", project.siteName),
            ("Site Address:", project.siteAddress),
            ("Client:", project.clientName),
            ("Contractor:", project.contractor),
            ("Inspector:", inspector?.name ?? ""),
            ("Date Generated:", now),
        ]
        body += infoTable(rows: infoRows)
        body += para(text: "")

        // Sample table header
        body += para(text: "AIR SAMPLES SUBMITTED FOR ANALYSIS", bold: true, size: 22)
        body += para(text: "")

        // Sample table
        let sortedSamples = samples.sorted { $0.sampleId < $1.sampleId }
        body += sampleTable(samples: sortedSamples, dateFmt: dateFmt, timeFmt: timeFmt)
        body += para(text: "")

        // Signature / relinquishment footer
        body += para(text: "Relinquished by: _______________________________    Date/Time: ___________________", size: 18)
        body += para(text: "")
        body += para(text: "Received by: _______________________________    Date/Time: ___________________", size: 18)
        body += para(text: "")
        body += para(text: "Lab Name: _______________________________    Rush: \u{2610} Yes  \u{2610} No", size: 18)
        body += para(text: "")
        body += para(text: "Analysis Method: \u{2610} PCM  \u{2610} TEM  \u{2610} SEM", size: 18)

        return """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>\(body)<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>
"""
    }

    // MARK: XML helpers

    /// Build a single paragraph run.
    private static func para(text: String, bold: Bool = false, size: Int = 20, centered: Bool = false) -> String {
        let justification = centered ? "<w:jc w:val=\"center\"/>" : ""
        let boldTag = bold ? "<w:b/>" : ""
        let escaped = xmlEsc(text)
        return "<w:p><w:pPr>\(justification)</w:pPr><w:r><w:rPr>\(boldTag)<w:sz w:val=\"\(size)\"/></w:rPr><w:t xml:space=\"preserve\">\(escaped)</w:t></w:r></w:p>"
    }

    /// Build a cell with given text, optional bold, and width in twips.
    private static func cell(text: String, bold: Bool = false, width: Int, size: Int = 18) -> String {
        let boldTag = bold ? "<w:b/>" : ""
        return "<w:tc><w:tcPr><w:tcW w:w=\"\(width)\" w:type=\"dxa\"/></w:tcPr><w:p><w:r><w:rPr>\(boldTag)<w:sz w:val=\"\(size)\"/></w:rPr><w:t xml:space=\"preserve\">\(xmlEsc(text))</w:t></w:r></w:p></w:tc>"
    }

    /// 2-column key-value project info table.
    private static func infoTable(rows: [(String, String)]) -> String {
        let borders = "<w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/></w:tblBorders>"
        let tblPr = "<w:tblPr><w:tblW w:w=\"9000\" w:type=\"dxa\"/>\(borders)</w:tblPr>"
        var tblXml = "<w:tbl>\(tblPr)"
        for (key, value) in rows {
            tblXml += "<w:tr>"
            tblXml += cell(text: key, bold: true, width: 2000)
            tblXml += cell(text: value, bold: false, width: 7000)
            tblXml += "</w:tr>"
        }
        tblXml += "</w:tbl>"
        return tblXml
    }

    /// Multi-column sample table.
    private static func sampleTable(samples: [AirSample], dateFmt: DateFormatter, timeFmt: DateFormatter) -> String {
        let borders = "<w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/></w:tblBorders>"
        let tblPr = "<w:tblPr><w:tblW w:w=\"9000\" w:type=\"dxa\"/>\(borders)</w:tblPr>"
        var tblXml = "<w:tbl>\(tblPr)"

        // Header row
        tblXml += "<w:tr>"
        tblXml += cell(text: "Sample ID", bold: true, width: 1500)
        tblXml += cell(text: "Type", bold: true, width: 900)
        tblXml += cell(text: "Hazard", bold: true, width: 900)
        tblXml += cell(text: "Location", bold: true, width: 2000)
        tblXml += cell(text: "Date", bold: true, width: 1000)
        tblXml += cell(text: "Start", bold: true, width: 800)
        tblXml += cell(text: "Stop", bold: true, width: 800)
        tblXml += cell(text: "Vol (L)", bold: true, width: 700)
        tblXml += cell(text: "Result", bold: true, width: 400)
        tblXml += "</w:tr>"

        if samples.isEmpty {
            tblXml += "<w:tr>"
            tblXml += cell(text: "No air samples recorded.", bold: false, width: 9000)
            tblXml += "</w:tr>"
        } else {
            for s in samples {
                let dateStr = dateFmt.string(from: s.date)
                let startStr = s.startTime.map { timeFmt.string(from: $0) } ?? ""
                let stopStr  = s.stopTime.map  { timeFmt.string(from: $0) } ?? ""
                let volStr   = s.sampleVolume.map { "\($0)" } ?? ""
                tblXml += "<w:tr>"
                tblXml += cell(text: s.sampleId, width: 1500)
                tblXml += cell(text: s.sampleType.rawValue, width: 900)
                tblXml += cell(text: s.hazardType.rawValue, width: 900)
                tblXml += cell(text: s.location.isEmpty ? s.containmentName : s.location, width: 2000)
                tblXml += cell(text: dateStr, width: 1000)
                tblXml += cell(text: startStr, width: 800)
                tblXml += cell(text: stopStr, width: 800)
                tblXml += cell(text: volStr, width: 700)
                tblXml += cell(text: "", width: 400)  // result field — left blank for lab
                tblXml += "</w:tr>"
            }
        }

        tblXml += "</w:tbl>"
        return tblXml
    }

    private static func xmlEsc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
         .replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;")
         .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

// MARK: - Private ZIP helpers (local to DocxKit)

private func docxCRC32(_ data: Data) -> UInt32 {
    var crc: UInt32 = 0xFFFFFFFF
    for byte in data {
        crc ^= UInt32(byte)
        for _ in 0..<8 {
            crc = crc & 1 != 0 ? (crc >> 1) ^ 0xEDB88320 : crc >> 1
        }
    }
    return ~crc
}

private func docxDosDateTime() -> (UInt16, UInt16) {
    let c = Calendar.current
    let now = Date()
    let year  = max(0, c.component(.year,   from: now) - 1980)
    let month = c.component(.month,  from: now)
    let day   = c.component(.day,    from: now)
    let hour  = c.component(.hour,   from: now)
    let minute = c.component(.minute, from: now)
    let second = c.component(.second, from: now) / 2
    let date = UInt16((year << 9) | (month << 5) | day)
    let time = UInt16((hour << 11) | (minute << 5) | second)
    return (date, time)
}

private extension Data {
    mutating func docxAppendLE<T: FixedWidthInteger>(_ value: T) {
        let v = value.littleEndian
        Swift.withUnsafeBytes(of: v) { self.append(contentsOf: $0) }
    }
}
