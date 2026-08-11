//
//  InspectorFormSheet.swift
//  Oversight
//
//  Inspector details — mirrors the Windows desktop Inspector Profile form:
//  Name, Company, Phone, Email, Certification Number, License, Signature.
//
//  The signature is drawn/imported here and saved atomically with the text
//  fields when the user taps Save — no separate Signature row needed.
//
//  isOnboarding: true shows a startup prompt and hides the Cancel button.
//  "Import from Desktop" scans the QR code from the Windows Share button.
//

import SwiftUI
import SwiftData

struct InspectorFormSheet: View {
    var isOnboarding: Bool = false

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Query private var inspectors: [Inspector]

    @State private var name = ""
    @State private var company = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var certificationNumber = ""
    @State private var license = ""
    @State private var signatureData: Data? = nil
    @State private var showQRImport = false
    @State private var showSignaturePad = false

    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    private var signatureImage: Image? {
        guard let data = signatureData else { return nil }
        #if canImport(UIKit)
        return UIImage(data: data).map(Image.init(uiImage:))
        #elseif canImport(AppKit)
        return NSImage(data: data).map(Image.init(nsImage:))
        #endif
    }

    var body: some View {
        SheetScaffold(
            title: "Inspector Profile",
            saveDisabled: !isValid,
            hideCancelButton: isOnboarding,
            onSave: save
        ) {
            if isOnboarding {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Please enter your inspector information before using Oversight.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button {
                            showQRImport = true
                        } label: {
                            Label("Import from Desktop", systemImage: "qrcode.viewfinder")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section {
                    Button {
                        showQRImport = true
                    } label: {
                        Label("Import from Desktop via QR", systemImage: "qrcode.viewfinder")
                    }
                }
            }

            Section("Identity") {
                LabeledContent("Name") {
                    TextField("e.g. John Smith", text: $name)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Company") {
                    TextField("Firm or employer", text: $company)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Phone") {
                    TextField("(000) 000-0000", text: $phone)
                        .multilineTextAlignment(.trailing)
                        .phoneKeyboard()
                }
                LabeledContent("Email") {
                    TextField("inspector@example.com", text: $email)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                LabeledContent("Certification #") {
                    TextField("e.g. AI-12345", text: $certificationNumber)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("License") {
                    TextField("e.g. NJ DEP Licensed", text: $license)
                        .multilineTextAlignment(.trailing)
                }
            }

            Section("Signature") {
                if let img = signatureImage {
                    img
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: 90)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
                        .padding(.vertical, 4)
                    HStack {
                        Button("Redraw") { showSignaturePad = true }
                        Spacer()
                        Button("Clear", role: .destructive) { signatureData = nil }
                    }
                } else {
                    Button("Draw Signature") { showSignaturePad = true }
                    Text("No signature on file")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onAppear {
            if let existing = inspectors.first {
                name = existing.name
                company = existing.company
                phone = existing.phone
                email = existing.email
                certificationNumber = existing.certificationNumber
                license = existing.license
                signatureData = existing.signatureData
            }
        }
        .sheet(isPresented: $showQRImport) {
            InspectorQRScanSheet { profile in
                applyImportedProfile(profile)
            }
        }
        .sheet(isPresented: $showSignaturePad) {
            SignatureFormSheet { capturedData in
                signatureData = capturedData
            }
        }
    }

    // MARK: Helpers

    private func applyImportedProfile(_ profile: ImportedInspectorProfile) {
        name = profile.name
        company = profile.company
        phone = profile.phone
        email = profile.email
        certificationNumber = profile.certificationNumber
        license = profile.license
        if let sigData = profile.signatureData {
            signatureData = sigData
        }
        appState.showToast("Profile imported — tap Save to apply")
    }

    private func save() {
        let inspector = inspectors.first ?? {
            let created = Inspector()
            modelContext.insert(created)
            return created
        }()
        inspector.name = name.trimmingCharacters(in: .whitespaces)
        inspector.company = company.trimmingCharacters(in: .whitespaces)
        inspector.phone = phone.trimmingCharacters(in: .whitespaces)
        inspector.email = email.trimmingCharacters(in: .whitespaces)
        inspector.certificationNumber = certificationNumber.trimmingCharacters(in: .whitespaces)
        inspector.license = license.trimmingCharacters(in: .whitespaces)
        inspector.signatureData = signatureData
        try? modelContext.save()
        appState.showToast("Profile updated")
    }
}
