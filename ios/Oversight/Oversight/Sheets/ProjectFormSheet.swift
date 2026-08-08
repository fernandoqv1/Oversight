//
//  ProjectFormSheet.swift
//  Oversight
//
//  Create/edit project — ported from ProjectSheet in oversight-sheets.jsx.
//  Field groups match desktop project records: Project, Site, Client,
//  Abatement contractor.
//

import SwiftUI
import SwiftData

struct ProjectFormSheet: View {
    let project: Project?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var projectNumber = ""
    @State private var siteName = ""
    @State private var siteAddress = ""
    @State private var clientName = ""
    @State private var clientPhone = ""
    @State private var clientContactName = ""
    @State private var clientContactPhone = ""
    @State private var contractor = ""
    @State private var contractorPhone = ""
    @State private var foremanName = ""
    @State private var foremanPhone = ""
    @State private var dueDate = Calendar.current.date(byAdding: .day, value: 14, to: .now) ?? .now

    private var isEdit: Bool { project != nil }
    private var isValid: Bool { !projectNumber.trimmingCharacters(in: .whitespaces).isEmpty && !siteName.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        SheetScaffold(title: isEdit ? "Edit Project" : "New Project", saveLabel: isEdit ? "Save" : "Create", saveDisabled: !isValid, onSave: save) {
            Section("Project") {
                LabeledContent("Number") { TextField("OVS-0000", text: $projectNumber) }
                DatePicker("Due date", selection: $dueDate, displayedComponents: .date)
            }
            Section("Site") {
                LabeledContent("Site name") { TextField("e.g. Riverside Elementary", text: $siteName) }
                LabeledContent("Address") { TextField("Street, building", text: $siteAddress) }
            }
            Section("Client") {
                LabeledContent("Client") { TextField("Client company", text: $clientName) }
                LabeledContent("Phone") { TextField("(000) 000-0000", text: $clientPhone).keyboardType(.phonePad) }
                LabeledContent("Contact") { TextField("Site contact name", text: $clientContactName) }
                LabeledContent("Contact ph.") { TextField("(000) 000-0000", text: $clientContactPhone).keyboardType(.phonePad) }
            }
            Section("Abatement contractor") {
                LabeledContent("Contractor") { TextField("Contractor name", text: $contractor) }
                LabeledContent("Phone") { TextField("(000) 000-0000", text: $contractorPhone).keyboardType(.phonePad) }
                LabeledContent("Foreman") { TextField("Foreman name", text: $foremanName) }
                LabeledContent("Foreman ph.") { TextField("(000) 000-0000", text: $foremanPhone).keyboardType(.phonePad) }
            }
        }
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        guard let project else { return }
        projectNumber = project.projectNumber
        siteName = project.siteName
        siteAddress = project.siteAddress
        clientName = project.clientName
        clientPhone = project.clientPhone
        clientContactName = project.clientContactName
        clientContactPhone = project.clientContactPhone
        contractor = project.contractor
        contractorPhone = project.contractorPhone
        foremanName = project.foremanName
        foremanPhone = project.foremanPhone
        dueDate = project.dueDate ?? dueDate
    }

    private func save() {
        if let project {
            project.projectNumber = projectNumber
            project.siteName = siteName
            project.siteAddress = siteAddress
            project.clientName = clientName
            project.clientPhone = clientPhone
            project.clientContactName = clientContactName
            project.clientContactPhone = clientContactPhone
            project.contractor = contractor
            project.contractorPhone = contractorPhone
            project.foremanName = foremanName
            project.foremanPhone = foremanPhone
            project.dueDate = dueDate
            try? modelContext.save()
            appState.showToast("Project updated")
        } else {
            let np = Project(
                projectNumber: projectNumber, siteName: siteName, siteAddress: siteAddress,
                clientName: clientName, clientPhone: clientPhone,
                clientContactName: clientContactName, clientContactPhone: clientContactPhone,
                contractor: contractor, contractorPhone: contractorPhone,
                foremanName: foremanName, foremanPhone: foremanPhone,
                status: .active, dueDate: dueDate, createdAt: .now
            )
            modelContext.insert(np)
            try? modelContext.save()
            appState.showToast("Project created")
        }
    }
}
