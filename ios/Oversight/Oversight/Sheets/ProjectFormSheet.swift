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
import UniformTypeIdentifiers

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
    @State private var projectFolderPath = ""
    @State private var showFolderPicker = false
    private var isEdit: Bool { project != nil }
    private var isValid: Bool { !projectNumber.trimmingCharacters(in: .whitespaces).isEmpty && !siteName.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        SheetScaffold(title: isEdit ? "Edit Project" : "New Project", saveLabel: isEdit ? "Save" : "Create", saveDisabled: !isValid, onSave: save) {
            Section("Project") {
                LabeledContent("Number") { TextField("PJ78162", text: $projectNumber) }
                HStack {
                    Label {
                        if projectFolderPath.isEmpty {
                            Text("No folder assigned").foregroundStyle(.secondary)
                        } else {
                            Text(URL(fileURLWithPath: projectFolderPath).lastPathComponent)
                        }
                    } icon: {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(projectFolderPath.isEmpty ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.accentColor))
                    }
                    Spacer()
                    if !projectFolderPath.isEmpty {
                        Button(role: .destructive) {
                            projectFolderPath = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 6)
                    }
                    Button("Browse") { showFolderPicker = true }
                        .font(.subheadline)
                }
            }
            Section("Site") {
                LabeledContent("Site name") { TextField("e.g. Riverside Elementary", text: $siteName) }
                LabeledContent("Address") { TextField("Street, building", text: $siteAddress) }
            }
            Section("Client") {
                LabeledContent("Client") { TextField("Client company", text: $clientName) }
                LabeledContent("Phone") { TextField("(000) 000-0000", text: $clientPhone).phoneKeyboard() }
                LabeledContent("Contact") { TextField("Site contact name", text: $clientContactName) }
                LabeledContent("Contact ph.") { TextField("(000) 000-0000", text: $clientContactPhone).phoneKeyboard() }
            }
            Section("Abatement contractor") {
                LabeledContent("Contractor") { TextField("Contractor name", text: $contractor) }
                LabeledContent("Phone") { TextField("(000) 000-0000", text: $contractorPhone).phoneKeyboard() }
                LabeledContent("Foreman") { TextField("Foreman name", text: $foremanName) }
                LabeledContent("Foreman ph.") { TextField("(000) 000-0000", text: $foremanPhone).phoneKeyboard() }
            }
        }
        .onAppear(perform: loadExisting)
        .fileImporter(
            isPresented: $showFolderPicker,
            allowedContentTypes: [.folder]
        ) { result in
            if case .success(let url) = result {
                projectFolderPath = url.path
            }
        }
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
        projectFolderPath = project.projectFolderPath
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
            project.projectFolderPath = projectFolderPath
            try? modelContext.save()
            appState.showToast("Project updated")
        } else {
            let np = Project(
                projectNumber: projectNumber, siteName: siteName, siteAddress: siteAddress,
                clientName: clientName, clientPhone: clientPhone,
                clientContactName: clientContactName, clientContactPhone: clientContactPhone,
                contractor: contractor, contractorPhone: contractorPhone,
                foremanName: foremanName, foremanPhone: foremanPhone,
                status: .active, createdAt: .now, projectFolderPath: projectFolderPath
            )
            modelContext.insert(np)
            try? modelContext.save()
            appState.showToast("Project created")
        }
    }
}
