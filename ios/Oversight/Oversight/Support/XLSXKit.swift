//
//  XLSXKit.swift
//  Oversight
//
//  Pure-Swift XLSX writer and reader. No third-party dependencies.
//
//  Writer: builds XLSX (ZIP STORED, no compression) compatible with Excel
//  and the desktop app. Includes a _FullData sheet with project JSON so
//  the file can be re-imported without losing data.
//
//  Reader: reads XLSX files exported by the iOS app (STORED ZIP only).
//  Files compressed with DEFLATE (e.g. from the desktop app) are not
//  supported — users should re-export from the iOS app.
//

import Foundation
import Compression

// MARK: - XLSX value types

enum XLSXValue {
    case str(String)
    case num(Double)
    case empty
}

// MARK: - XLSX Writer

struct XLSXWriter {
    private(set) var sheets: [(name: String, rows: [[XLSXValue]])] = []

    mutating func addSheet(name: String, rows: [[XLSXValue]]) {
        sheets.append((name, rows))
    }

    func build() -> Data {
        var entries: [(path: String, data: Data)] = []

        // Content types
        var overrides = ""
        for (i, sheet) in sheets.enumerated() {
            overrides += "<Override PartName=\"/xl/worksheets/sheet\(i+1).xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
            let _ = sheet
        }
        let contentTypes = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
\(overrides)
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
"""
        entries.append(("[Content_Types].xml", contentTypes.utf8Data))

        // Root rels
        let rootRels = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""
        entries.append(("_rels/.rels", rootRels.utf8Data))

        // Workbook
        var sheetElems = ""
        for (i, sheet) in sheets.enumerated() {
            sheetElems += "<sheet name=\"\(xmlEscape(sheet.name))\" sheetId=\"\(i+1)\" r:id=\"rId\(i+1)\"/>"
        }
        let workbook = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>\(sheetElems)</sheets>
</workbook>
"""
        entries.append(("xl/workbook.xml", workbook.utf8Data))

        // Workbook rels
        var wbRels = ""
        for (i, _) in sheets.enumerated() {
            wbRels += "<Relationship Id=\"rId\(i+1)\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet\(i+1).xml\"/>"
        }
        wbRels += "<Relationship Id=\"rIdS\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
        let workbookRels = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
\(wbRels)
</Relationships>
"""
        entries.append(("xl/_rels/workbook.xml.rels", workbookRels.utf8Data))

        // Styles (minimal)
        let styles = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>
"""
        entries.append(("xl/styles.xml", styles.utf8Data))

        // Worksheets
        for (i, sheet) in sheets.enumerated() {
            entries.append(("xl/worksheets/sheet\(i+1).xml", buildWorksheet(sheet.rows)))
        }

        return ZipKit.write(entries)
    }

    private func buildWorksheet(_ rows: [[XLSXValue]]) -> Data {
        var xml = """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
"""
        for (ri, row) in rows.enumerated() {
            xml += "<row r=\"\(ri+1)\">"
            for (ci, val) in row.enumerated() {
                let addr = cellAddress(row: ri+1, col: ci+1)
                switch val {
                case .str(let s):
                    xml += "<c r=\"\(addr)\" t=\"inlineStr\"><is><t>\(xmlEscape(s))</t></is></c>"
                case .num(let n):
                    let formatted = n.truncatingRemainder(dividingBy: 1) == 0
                        ? String(Int(n)) : String(n)
                    xml += "<c r=\"\(addr)\"><v>\(formatted)</v></c>"
                case .empty:
                    xml += "<c r=\"\(addr)\"/>"
                }
            }
            xml += "</row>"
        }
        xml += "</sheetData></worksheet>"
        return xml.utf8Data
    }
}

// MARK: - XLSX Reader

struct XLSXReader {
    enum ReadError: Error {
        case invalidZip, unsupportedCompression, missingSheet, xmlParseFailed
    }

    static func read(_ data: Data) throws -> [String: [[String]]] {
        let entries = try ZipKit.read(data)

        // Read workbook to get sheet names
        guard let wbData = entries["xl/workbook.xml"] else { throw ReadError.missingSheet }
        let sheetMap = parseWorkbook(wbData)  // name → rId

        // Read workbook.xml.rels to map rId → file path
        guard let wbRelsData = entries["xl/_rels/workbook.xml.rels"] else { throw ReadError.missingSheet }
        let rIdToPath = parseRels(wbRelsData)  // rId → path relative to xl/

        // Load shared strings table (required for files from Excel/SheetJS on Windows)
        let sharedStrings: [String]
        if let ssData = entries["xl/sharedStrings.xml"] {
            sharedStrings = parseSharedStrings(ssData)
        } else {
            sharedStrings = []
        }

        var result: [String: [[String]]] = [:]
        for (name, rId) in sheetMap {
            guard let relativePath = rIdToPath[rId] else { continue }
            let fullPath: String
            if relativePath.hasPrefix("/xl/") {
                fullPath = String(relativePath.dropFirst(1))
            } else {
                fullPath = "xl/\(relativePath)"
            }
            guard let wsData = entries[fullPath] else { continue }
            result[name] = parseWorksheet(wsData, sharedStrings: sharedStrings)
        }
        return result
    }

    private static func parseSharedStrings(_ data: Data) -> [String] {
        let p = SharedStringsXMLParser()
        let xml = XMLParser(data: data)
        xml.delegate = p
        xml.parse()
        return p.strings
    }

    private static func parseWorkbook(_ data: Data) -> [String: String] {
        // Returns sheet name → r:id
        guard let xml = String(data: data, encoding: .utf8) else { return [:] }
        var result: [String: String] = [:]
        // Simple regex-free parsing: find <sheet ... /> elements
        var i = xml.startIndex
        while let start = xml.range(of: "<sheet ", range: i..<xml.endIndex) {
            guard let end = xml.range(of: "/>", range: start.upperBound..<xml.endIndex) else { break }
            let elem = String(xml[start.lowerBound..<end.upperBound])
            let name = attrValue(elem, "name") ?? ""
            let rId = attrValue(elem, "r:id") ?? attrValue(elem, "rId") ?? ""
            if !name.isEmpty && !rId.isEmpty { result[name] = rId }
            i = end.upperBound
        }
        return result
    }

    private static func parseRels(_ data: Data) -> [String: String] {
        // Returns Id → Target
        guard let xml = String(data: data, encoding: .utf8) else { return [:] }
        var result: [String: String] = [:]
        var i = xml.startIndex
        while let start = xml.range(of: "<Relationship ", range: i..<xml.endIndex) {
            guard let end = xml.range(of: "/>", range: start.upperBound..<xml.endIndex) else { break }
            let elem = String(xml[start.lowerBound..<end.upperBound])
            let id = attrValue(elem, "Id") ?? ""
            let target = attrValue(elem, "Target") ?? ""
            if !id.isEmpty && !target.isEmpty { result[id] = target }
            i = end.upperBound
        }
        return result
    }

    static func parseWorksheet(_ data: Data, sharedStrings: [String] = []) -> [[String]] {
        let parser = WorksheetXMLParser(sharedStrings: sharedStrings)
        let xml = XMLParser(data: data)
        xml.delegate = parser
        xml.parse()
        return parser.rows
    }

    private static func attrValue(_ elem: String, _ attr: String) -> String? {
        // Find attr="value" or attr='value'
        for quote: Character in ["\"", "'"] {
            let key = "\(attr)=\(quote)"
            if let r = elem.range(of: key) {
                let rest = elem[r.upperBound...]
                if let end = rest.firstIndex(of: quote) {
                    return xmlUnescape(String(rest[rest.startIndex..<end]))
                }
            }
        }
        return nil
    }
}

// MARK: - Worksheet XML Parser (SAX)

private final class WorksheetXMLParser: NSObject, XMLParserDelegate {
    var rows: [[String]] = []
    private let sharedStrings: [String]
    private var currentRow: [String] = []
    private var currentCellType = ""
    private var currentCellCol = 0
    private var currentValue = ""
    private var inValue = false
    private var lastRowIndex = 0

    init(sharedStrings: [String] = []) {
        self.sharedStrings = sharedStrings
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
                qualifiedName: String?, attributes: [String: String] = [:]) {
        switch name {
        case "row":
            currentRow = []
            lastRowIndex = Int(attributes["r"] ?? "0") ?? 0
        case "c":
            currentCellType = attributes["t"] ?? ""
            currentCellCol = columnIndex(from: attributes["r"] ?? "")
            currentValue = ""
        case "v", "t":
            inValue = true
            currentValue = ""
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inValue { currentValue += string }
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?,
                qualifiedName: String?) {
        switch name {
        case "v":
            // Shared-string reference (t="s"): currentValue is an index into sharedStrings.
            // Numeric or anything else: use as-is.
            let resolved: String
            if currentCellType == "s", let idx = Int(currentValue), idx < sharedStrings.count {
                resolved = sharedStrings[idx]
            } else {
                resolved = currentValue
            }
            while currentRow.count < currentCellCol - 1 { currentRow.append("") }
            currentRow.append(resolved)
            inValue = false
        case "t":
            // Inline string
            while currentRow.count < currentCellCol - 1 { currentRow.append("") }
            currentRow.append(currentValue)
            inValue = false
        case "row":
            rows.append(currentRow)
        default: break
        }
    }

    private func columnIndex(from cellRef: String) -> Int {
        var col = 0
        for c in cellRef.unicodeScalars {
            guard c.value >= 65, c.value <= 90 else { break }
            col = col * 26 + Int(c.value - 64)
        }
        return col
    }
}

// MARK: - Shared Strings XML Parser

private final class SharedStringsXMLParser: NSObject, XMLParserDelegate {
    var strings: [String] = []
    private var currentSI = ""
    private var currentT = ""
    private var inT = false

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
                qualifiedName: String?, attributes: [String: String] = [:]) {
        if name == "si" { currentSI = "" }
        else if name == "t" { inT = true; currentT = "" }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inT { currentT += string }
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?,
                qualifiedName: String?) {
        if name == "t" { currentSI += currentT; inT = false }
        else if name == "si" { strings.append(currentSI) }
    }
}

// MARK: - ZIP kit

private enum ZipKit {
    struct Entry { let path: String; let data: Data }

    static func write(_ entries: [(path: String, data: Data)]) -> Data {
        var blob = Data()
        var centralDir = Data()
        var offsets: [UInt32] = []

        let (dosDate, dosTime) = dosDateTime()

        for entry in entries {
            let nameBytes = entry.path.utf8Data
            let fileData = entry.data
            let crc = crc32(fileData)
            let sz = UInt32(fileData.count)
            let localOffset = UInt32(blob.count)
            offsets.append(localOffset)

            var lh = Data()
            lh.appendLE(UInt32(0x04034b50))
            lh.appendLE(UInt16(20))
            lh.appendLE(UInt16(0))
            lh.appendLE(UInt16(0))      // STORED
            lh.appendLE(dosTime)
            lh.appendLE(dosDate)
            lh.appendLE(crc)
            lh.appendLE(sz); lh.appendLE(sz)
            lh.appendLE(UInt16(nameBytes.count))
            lh.appendLE(UInt16(0))
            lh.append(nameBytes)
            lh.append(fileData)
            blob.append(lh)

            var cd = Data()
            cd.appendLE(UInt32(0x02014b50))
            cd.appendLE(UInt16(20)); cd.appendLE(UInt16(20))
            cd.appendLE(UInt16(0)); cd.appendLE(UInt16(0))
            cd.appendLE(dosTime); cd.appendLE(dosDate)
            cd.appendLE(crc)
            cd.appendLE(sz); cd.appendLE(sz)
            cd.appendLE(UInt16(nameBytes.count))
            cd.appendLE(UInt16(0)); cd.appendLE(UInt16(0))
            cd.appendLE(UInt16(0)); cd.appendLE(UInt16(0))
            cd.appendLE(UInt32(0))
            cd.appendLE(localOffset)
            cd.append(nameBytes)
            centralDir.append(cd)
        }

        let cdOffset = UInt32(blob.count)
        blob.append(centralDir)
        var eocd = Data()
        eocd.appendLE(UInt32(0x06054b50))
        eocd.appendLE(UInt16(0)); eocd.appendLE(UInt16(0))
        eocd.appendLE(UInt16(entries.count)); eocd.appendLE(UInt16(entries.count))
        eocd.appendLE(UInt32(centralDir.count))
        eocd.appendLE(cdOffset)
        eocd.appendLE(UInt16(0))
        blob.append(eocd)
        return blob
    }

    static func read(_ data: Data) throws -> [String: Data] {
        // Find End of Central Directory record
        guard data.count >= 22 else { throw XLSXReader.ReadError.invalidZip }
        var eocdOffset = data.count - 22
        while eocdOffset >= 0 {
            if data.readLE(UInt32.self, at: eocdOffset) == 0x06054b50 { break }
            eocdOffset -= 1
        }
        guard eocdOffset >= 0 else { throw XLSXReader.ReadError.invalidZip }

        let entryCount = Int(data.readLE(UInt16.self, at: eocdOffset + 8))
        let cdOffset = Int(data.readLE(UInt32.self, at: eocdOffset + 16))

        var result: [String: Data] = [:]
        var pos = cdOffset
        for _ in 0..<entryCount {
            guard data.readLE(UInt32.self, at: pos) == 0x02014b50 else { break }
            let method = Int(data.readLE(UInt16.self, at: pos + 10))
            let compSize = Int(data.readLE(UInt32.self, at: pos + 20))
            let nameLen = Int(data.readLE(UInt16.self, at: pos + 28))
            let extraLen = Int(data.readLE(UInt16.self, at: pos + 30))
            let commentLen = Int(data.readLE(UInt16.self, at: pos + 32))
            let localOffset = Int(data.readLE(UInt32.self, at: pos + 42))
            guard let name = String(data: data.subdata(in: (pos+46)..<(pos+46+nameLen)), encoding: .utf8) else {
                pos += 46 + nameLen + extraLen + commentLen; continue
            }

            // Read local file header
            let localExtraLen = Int(data.readLE(UInt16.self, at: localOffset + 28))
            let dataStart = localOffset + 30 + nameLen + localExtraLen

            if method == 0 {
                // STORED
                result[name] = data.subdata(in: dataStart..<(dataStart+compSize))
            } else if method == 8 {
                // DEFLATE — decompress using Compression framework
                let compressed = data.subdata(in: dataStart..<(dataStart+compSize))
                result[name] = deflateDecompress(compressed)
            }

            pos += 46 + nameLen + extraLen + commentLen
        }
        return result
    }

    // Decompress raw DEFLATE (ZIP method 8) using the Compression framework.
    // We prepend a minimal zlib header so COMPRESSION_ZLIB can process it.
    // The missing Adler32 trailer causes a terminal error, but by then all bytes
    // have been written to the output buffer — we accept the data regardless.
    private static func deflateDecompress(_ rawDeflate: Data) -> Data? {
        var src = Data([0x78, 0x9C])  // valid zlib CMF+FLG (0x789C % 31 == 0)
        src.append(rawDeflate)
        let maxOut = max(rawDeflate.count * 20, 2 * 1024 * 1024)
        var out = [UInt8](repeating: 0, count: maxOut)

        // Allocate uninitialized struct — C initializer fills the state field
        let sp = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { sp.deallocate() }
        guard compression_stream_init(sp, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else { return nil }
        defer { compression_stream_destroy(sp) }

        src.withUnsafeBytes { srcBuf in
            out.withUnsafeMutableBytes { dstBuf in
                sp.pointee.src_ptr = srcBuf.baseAddress!.assumingMemoryBound(to: UInt8.self)
                sp.pointee.src_size = srcBuf.count
                sp.pointee.dst_ptr = dstBuf.baseAddress!.assumingMemoryBound(to: UInt8.self)
                sp.pointee.dst_size = dstBuf.count
                compression_stream_process(sp, 1)  // 1 = COMPRESSION_STREAM_FINALIZE
            }
        }
        let written = maxOut - sp.pointee.dst_size
        return written > 0 ? Data(out.prefix(written)) : nil
    }
}

// MARK: - Helpers

private func crc32(_ data: Data) -> UInt32 {
    var crc: UInt32 = 0xFFFFFFFF
    for byte in data {
        crc ^= UInt32(byte)
        for _ in 0..<8 {
            crc = crc & 1 != 0 ? (crc >> 1) ^ 0xEDB88320 : crc >> 1
        }
    }
    return ~crc
}

private func dosDateTime() -> (UInt16, UInt16) {
    let c = Calendar.current
    let now = Date()
    let year = max(0, c.component(.year, from: now) - 1980)
    let month = c.component(.month, from: now)
    let day = c.component(.day, from: now)
    let hour = c.component(.hour, from: now)
    let minute = c.component(.minute, from: now)
    let second = c.component(.second, from: now) / 2
    let date = UInt16((year << 9) | (month << 5) | day)
    let time = UInt16((hour << 11) | (minute << 5) | second)
    return (date, time)
}

func cellAddress(row: Int, col: Int) -> String {
    var col = col; var letters = ""
    while col > 0 {
        col -= 1
        letters = String(UnicodeScalar(65 + (col % 26))!) + letters
        col /= 26
    }
    return "\(letters)\(row)"
}

func xmlEscape(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;")
     .replacingOccurrences(of: "<", with: "&lt;")
     .replacingOccurrences(of: ">", with: "&gt;")
     .replacingOccurrences(of: "\"", with: "&quot;")
}

func xmlUnescape(_ s: String) -> String {
    s.replacingOccurrences(of: "&amp;", with: "&")
     .replacingOccurrences(of: "&lt;", with: "<")
     .replacingOccurrences(of: "&gt;", with: ">")
     .replacingOccurrences(of: "&quot;", with: "\"")
     .replacingOccurrences(of: "&apos;", with: "'")
}

private extension String {
    var utf8Data: Data { Data(utf8) }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        let v = value.littleEndian
        Swift.withUnsafeBytes(of: v) { self.append(contentsOf: $0) }
    }

    func readLE<T: FixedWidthInteger>(_ type: T.Type, at offset: Int) -> T {
        guard offset >= 0, offset + MemoryLayout<T>.size <= count else { return 0 }
        return subdata(in: offset..<(offset+MemoryLayout<T>.size))
            .withUnsafeBytes { $0.load(as: T.self) }.littleEndian
    }
}
