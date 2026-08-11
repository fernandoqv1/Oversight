//
//  SeedData.swift
//  Oversight
//
//  First-launch demo data, ported project-for-project from the seed()
//  function in oversight-store.jsx so the iOS app opens with the same
//  five sample projects as the interactive prototype. "Reset demo data"
//  in Profile calls resetDemoData() to restore this exact state.
//

import Foundation
import SwiftData

enum SeedData {
    static func populateIfNeeded(_ context: ModelContext) {
        let existing = try? context.fetchCount(FetchDescriptor<Project>())
        if let existing, existing > 0 { return }
        insert(into: context)
    }

    static func resetDemoData(_ context: ModelContext) {
        for model in ((try? context.fetch(FetchDescriptor<Project>())) ?? []) { context.delete(model) }
        if let inspector = try? context.fetch(FetchDescriptor<Inspector>()).first { context.delete(inspector) }
        insert(into: context)
    }

    private static func days(_ n: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: n, to: .now) ?? .now
    }

    private static func time(_ daysOffset: Int, _ hour: Int, _ minute: Int) -> Date {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: days(daysOffset))
        comps.hour = hour
        comps.minute = minute
        return Calendar.current.date(from: comps) ?? .now
    }

    private static func insert(into context: ModelContext) {
        let inspector = Inspector(
            name: "Marcus Hale",
            company: "AsbTrack Environmental",
            certificationNumber: "AI-14-5821",
            license: "CAC #14-5821"
        )
        context.insert(inspector)

        // Project 1 — Riverside Elementary (overdue, active abatement)
        let p1 = Project(
            projectNumber: "OVS-2041", siteName: "Riverside Elementary",
            siteAddress: "1820 Riverside Dr, Building C",
            clientName: "Hartman Abatement", clientPhone: "(916) 555-0142",
            clientContactName: "Dana Cole", clientContactPhone: "(916) 555-0177",
            contractor: "Hartman Abatement Inc.", contractorPhone: "(916) 555-0142",
            foremanName: "Luis Romero", foremanPhone: "(916) 555-0190",
            status: .active, dueDate: days(-2), createdAt: days(-18)
        )
        context.insert(p1)

        let b1 = Building(name: "Building C", project: p1)
        context.insert(b1)
        let room104 = Space(name: "Room 104 — Classroom", building: b1)
        let boiler = Space(name: "Boiler Room", building: b1)
        let corridor = Space(name: "Corridor C-1", building: b1)
        context.insert(room104); context.insert(boiler); context.insert(corridor)
        [
            Material(name: "9×9 Floor Tile & Mastic", quantity: 880, unit: .squareFeet, materialType: .misc, space: room104),
            Material(name: "Window Glazing", quantity: 64, unit: .linearFeet, materialType: .misc, space: room104),
            Material(name: "Pipe Insulation (TSI)", quantity: 220, unit: .linearFeet, materialType: .tsi, space: boiler),
            Material(name: "Boiler Breeching", quantity: 40, unit: .squareFeet, materialType: .tsi, space: boiler),
            Material(name: "Drywall Joint Compound", quantity: 1200, unit: .squareFeet, materialType: .surfacing, space: corridor),
        ].forEach { context.insert($0) }

        let c1a = Containment(name: "Boiler Room", buildingName: b1.name, stage: .activeAbatement, spaceNames: [boiler.name], project: p1)
        let c1b = Containment(name: "Corridor", buildingName: b1.name, stage: .activeAbatement, spaceNames: [corridor.name], project: p1)
        let c1c = Containment(name: "Room 104", buildingName: b1.name, stage: .containmentPreparation, spaceNames: [room104.name], project: p1)
        [c1a, c1b, c1c].forEach { context.insert($0) }

        context.insert(AirSample(sampleId: "OVS-2041-AS11", sampleType: .area, location: "Outside Containment, Corridor C-1", containmentName: c1b.name, date: .now, startTime: time(0, 7, 40), startFlowRate: 4.0, project: p1))
        context.insert(AirSample(sampleId: "OVS-2041-AS08", sampleType: .area, location: "Boiler Room — North", containmentName: c1a.name, date: .now, startTime: time(0, 8, 5), stopTime: time(0, 11, 35), startFlowRate: 2.0, stopFlowRate: 2.0, project: p1))
        context.insert(AirSample(sampleId: "OVS-2041-PS03", sampleType: .personal, location: "Worker — R. Mota", containmentName: c1a.name, date: days(-1), startTime: time(-1, 8, 15), stopTime: time(-1, 12, 5), startFlowRate: 2.0, stopFlowRate: 1.9, project: p1))

        context.insert(Worker(name: "Luis Romero", role: .supervisor, aheraExpiration: days(120), medicalExpiration: days(90), respiratorFitExpiration: days(200), leadExpiration: days(240), leadMedExpiration: days(260), respiratorTypes: [.fullFace, .papr], project: p1))
        context.insert(Worker(name: "Rafael Mota", role: .worker, aheraExpiration: days(80), medicalExpiration: days(60), respiratorFitExpiration: days(-4), leadExpiration: days(180), leadMedExpiration: days(200), respiratorTypes: [.halfFace], project: p1))
        context.insert(Worker(name: "J. Okafor", role: .worker, aheraExpiration: days(150), medicalExpiration: days(30), respiratorFitExpiration: days(-1), leadExpiration: days(220), leadMedExpiration: days(240), respiratorTypes: [.halfFace], project: p1))

        let log1 = DailyLog(date: .now, project: p1)
        context.insert(log1)
        context.insert(LogEntry(time: time(0, 9, 18), note: "Gross removal of TSI in Boiler Room ongoing. Negative pressure verified at -0.04\" wc across 2 machines.", photoCount: 2, negativePressureNotes: "Boiler Room: -0.04\" wc", dailyLog: log1))
        let log1b = DailyLog(date: days(-1), project: p1)
        context.insert(log1b)
        context.insert(LogEntry(time: time(-1, 15, 30), note: "Visual inspection failed — debris remaining along east wall. Crew to re-clean.", photoCount: 4, dailyLog: log1b))

        // Project 2 — Mercy General Hospital (clearance)
        let p2 = Project(
            projectNumber: "OVS-2038", siteName: "Mercy General Hospital",
            siteAddress: "400 Medical Center Blvd, Wing C",
            clientName: "Hartman Abatement", clientPhone: "(916) 555-0142",
            clientContactName: "Priya Shah", clientContactPhone: "(916) 555-0211",
            contractor: "Hartman Abatement Inc.", contractorPhone: "(916) 555-0142",
            foremanName: "Luis Romero", foremanPhone: "(916) 555-0190",
            status: .active, dueDate: days(3), createdAt: days(-26)
        )
        context.insert(p2)
        let b2 = Building(name: "Wing C", project: p2)
        context.insert(b2)
        let orSuite = Space(name: "OR Suite 3", building: b2)
        let mech2 = Space(name: "Mechanical 2", building: b2)
        context.insert(orSuite); context.insert(mech2)
        context.insert(Material(name: "Vinyl Sheet Flooring", quantity: 540, unit: .squareFeet, materialType: .misc, space: orSuite))
        context.insert(Material(name: "Pipe Fitting Insulation", quantity: 95, unit: .linearFeet, materialType: .tsi, space: mech2))

        let c2a = Containment(name: "OR Suite 3", buildingName: b2.name, stage: .containmentClearance, spaceNames: [orSuite.name], project: p2)
        let c2b = Containment(name: "Mechanical", buildingName: b2.name, stage: .containmentTeardown, spaceNames: [mech2.name], project: p2)
        [c2a, c2b].forEach { context.insert($0) }

        context.insert(AirSample(sampleId: "OVS-2038-PS204", sampleType: .personal, location: "Worker — Wing C", containmentName: c2a.name, date: .now, startTime: time(0, 6, 30), startFlowRate: 2.0, project: p2))
        context.insert(AirSample(sampleId: "OVS-2038-CA01", sampleType: .clearance, location: "OR Suite 3 — center", containmentName: c2a.name, date: days(-1), startTime: time(-1, 13, 0), stopTime: time(-1, 17, 10), startFlowRate: 10.0, stopFlowRate: 10.0, project: p2))

        context.insert(Worker(name: "Sara Kim", role: .supervisor, aheraExpiration: days(200), medicalExpiration: days(140), respiratorFitExpiration: days(90), leadExpiration: days(260), leadMedExpiration: days(280), respiratorTypes: [.fullFace], project: p2))
        context.insert(Worker(name: "Tom Reyes", role: .worker, aheraExpiration: days(60), medicalExpiration: days(90), respiratorFitExpiration: days(120), leadExpiration: days(180), leadMedExpiration: days(200), respiratorTypes: [.halfFace, .fullFace], project: p2))

        let log2 = DailyLog(date: .now, project: p2)
        context.insert(log2)
        context.insert(LogEntry(time: time(0, 7, 5), note: "Final clearance air sampling started in OR Suite 3 after visual pass.", photoCount: 1, dailyLog: log2))

        // Project 3 — Pinewood Manufacturing (active abatement)
        let p3 = Project(
            projectNumber: "OVS-2061", siteName: "Pinewood Manufacturing",
            siteAddress: "1200 Industrial Pkwy, Plant 2",
            clientName: "Delta Environmental", clientPhone: "(209) 555-0120",
            clientContactName: "Bea Lutz", clientContactPhone: "(209) 555-0166",
            contractor: "Delta Environmental", contractorPhone: "(209) 555-0120",
            foremanName: "Hector Diaz", foremanPhone: "(209) 555-0145",
            status: .active, dueDate: days(6), createdAt: days(-9)
        )
        context.insert(p3)
        let b3 = Building(name: "Plant 2", project: p3)
        context.insert(b3)
        let pressLine = Space(name: "Press Line A", building: b3)
        context.insert(pressLine)
        context.insert(Material(name: "Transite Panel", quantity: 320, unit: .squareFeet, materialType: .misc, space: pressLine))
        context.insert(Material(name: "Gasket Material", quantity: 18, unit: .each, materialType: .misc, space: pressLine))
        let c3 = Containment(name: "Press Line A", buildingName: b3.name, stage: .activeAbatement, spaceNames: [pressLine.name], project: p3)
        context.insert(c3)
        context.insert(AirSample(sampleId: "OVS-2061-AS01", sampleType: .area, location: "Press Line A — south", containmentName: c3.name, date: days(-1), startTime: time(-1, 9, 0), stopTime: time(-1, 12, 30), startFlowRate: 2.0, stopFlowRate: 2.0, project: p3))
        context.insert(Worker(name: "Hector Diaz", role: .supervisor, aheraExpiration: days(180), medicalExpiration: days(120), respiratorFitExpiration: days(100), leadExpiration: days(260), leadMedExpiration: days(280), respiratorTypes: [.papr], project: p3))

        // Project 4 — Lincoln Court Apartments (prep)
        let p4 = Project(
            projectNumber: "OVS-2055", siteName: "Lincoln Court Apartments",
            siteAddress: "55 Lincoln Ave, Building 4",
            clientName: "Cityline Builders", clientPhone: "(415) 555-0133",
            clientContactName: "Owen Pratt", clientContactPhone: "(415) 555-0188",
            contractor: "Cityline Builders", contractorPhone: "(415) 555-0133",
            foremanName: "Marco Vela", foremanPhone: "(415) 555-0150",
            status: .active, dueDate: days(11), createdAt: days(-4)
        )
        context.insert(p4)
        let b4 = Building(name: "Building 4", project: p4)
        context.insert(b4)
        let unit4b = Space(name: "Unit 4B", building: b4)
        context.insert(unit4b)
        context.insert(Material(name: "Popcorn Ceiling Texture", quantity: 740, unit: .squareFeet, materialType: .surfacing, space: unit4b))
        let c4 = Containment(name: "Unit 4B", buildingName: b4.name, stage: .containmentPreparation, spaceNames: [unit4b.name], project: p4)
        context.insert(c4)
        context.insert(Worker(name: "Marco Vela", role: .supervisor, aheraExpiration: days(220), medicalExpiration: days(160), respiratorFitExpiration: days(130), leadExpiration: days(260), leadMedExpiration: days(280), respiratorTypes: [.fullFace], project: p4))

        // Project 5 — Westfield Office Tower (completed)
        let p5 = Project(
            projectNumber: "OVS-2029", siteName: "Westfield Office Tower",
            siteAddress: "90 Market St, Floors 8–10",
            clientName: "Westfield Group", clientPhone: "(415) 555-0100",
            clientContactName: "Nina Foss", clientContactPhone: "(415) 555-0102",
            contractor: "Summit Abatement", contractorPhone: "(415) 555-0109",
            foremanName: "Dale Knox", foremanPhone: "(415) 555-0111",
            status: .completed, dueDate: days(-12), createdAt: days(-60)
        )
        context.insert(p5)
        let b5 = Building(name: "Floors 8–10", project: p5)
        context.insert(b5)
        let floor9 = Space(name: "Floor 9 Core", building: b5)
        context.insert(floor9)
        context.insert(Material(name: "Fireproofing", quantity: 2400, unit: .squareFeet, materialType: .surfacing, space: floor9))
        let c5 = Containment(name: "Floor 9 Core", buildingName: b5.name, stage: .abatementCompleted, spaceNames: [floor9.name], project: p5)
        context.insert(c5)
        context.insert(AirSample(sampleId: "OVS-2029-CA07", sampleType: .clearance, location: "Floor 9 Core", containmentName: c5.name, date: days(-13), startTime: time(-13, 10, 0), stopTime: time(-13, 14, 15), startFlowRate: 10.0, stopFlowRate: 10.0, project: p5))
        context.insert(GeneratedDocument(name: "Final Clearance Report", date: days(-12), project: p5))
        context.insert(GeneratedDocument(name: "Project Closeout Summary", date: days(-11), project: p5))
    }
}
