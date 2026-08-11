//
//  DocumentsView.swift
//  Oversight
//
//  Ported from DocsScreen in oversight-screens.jsx.
//  Scanned documents section with rename/delete context menu.
//  Chains of Custody section generates a .docx via DocxKit.
//

import SwiftUI
import SwiftData

struct DocumentsView: View {
    @Bindable var project: Project
    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    // Scanned document state
    @State private var deleteConfirmFor: ScannedDocument?
    @State private var selectedScan: ScannedDocument?
    @State private var showRename = false
    @State private var renameTarget: ScannedDocument?
    @State private var renameName = ""

    // COC share sheet state
    @State private var cocURL: URL?
    @State private var showCOCShare = false

    @Query private var inspectors: [Inspector]

    var body: some View {
        List {
            // MARK: Chains of Custody
            Section("Chains of Custody") {
                Button {
                    generateCOC()
                } label: {
                    HStack {
                        Image(systemName: "doc.text.fill").foregroundStyle(.teal)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Generate Chain of Custody")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                            Text("Air sample submission form \u{2014} opens in Word or Pages")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // MARK: Scanned
            Section("Scanned \u{00B7} \(project.scannedDocuments.count)") {
                if project.scannedDocuments.isEmpty {
                    EmptyStateView(
                        title: "No scanned documents",
                        subtitle: "Scan inspection reports, clearances, or field notes.",
                        actionLabel: "Scan Document"
                    ) {
                        appState.present(.scanDocument(project))
                    }
                } else {
                    ForEach(project.scannedDocuments.sorted { $0.date > $1.date }) { scan in
                        Button { selectedScan = scan } label: {
                            HStack {
                                Image(systemName: "doc.viewfinder.fill").foregroundStyle(.blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(scan.name).font(.subheadline)
                                    Text("\(scan.pages.count) page\(scan.pages.count == 1 ? "" : "s")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(Fmt.date(scan.date)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                        .contextMenu {
                            Button {
                                renameTarget = scan
                                renameName = scan.name
                                showRename = true
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                deleteConfirmFor = scan
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                deleteConfirmFor = scan
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .groupedListStyle()
        .navigationTitle("Documents")
        .inlineNavTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        appState.present(.scanDocument(project))
                    } label: {
                        Label("Scan Document", systemImage: "doc.viewfinder")
                    }
                    Button {
                        generateCOC()
                    } label: {
                        Label("Generate Chain of Custody", systemImage: "doc.text.fill")
                    }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .confirmationDialog(
            "Delete \"\(deleteConfirmFor?.name ?? "")\"?",
            isPresented: Binding(get: { deleteConfirmFor != nil }, set: { if !$0 { deleteConfirmFor = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Scan", role: .destructive) {
                if let s = deleteConfirmFor {
                    modelContext.delete(s)
                    try? modelContext.save()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Rename Document", isPresented: $showRename) {
            TextField("Name", text: $renameName)
            Button("Rename") {
                if let target = renameTarget, !renameName.trimmingCharacters(in: .whitespaces).isEmpty {
                    target.name = renameName.trimmingCharacters(in: .whitespaces)
                    try? modelContext.save()
                }
                renameTarget = nil
            }
            Button("Cancel", role: .cancel) {
                renameTarget = nil
            }
        } message: {
            Text("Enter a new name for \"\(renameTarget?.name ?? "")\".")
        }
        .sheet(item: $selectedScan) { scan in
            ScannedDocumentViewer(scan: scan)
        }
        .sheet(isPresented: $showCOCShare, onDismiss: {
            if let url = cocURL { try? FileManager.default.removeItem(at: url) }
        }) {
            if let url = cocURL {
                ShareSheetView(url: url).ignoresSafeArea()
            }
        }
    }

    // MARK: - Actions

    private func generateCOC() {
        let inspector = inspectors.first
        let samples = project.airSamples.sorted { $0.sampleId < $1.sampleId }
        let data = DocxGenerator.generateCOC(project: project, inspector: inspector, samples: samples)

        // Build a safe filename from the project number
        let rawName = "\(project.projectNumber)_COC.docx"
        let safeName = rawName
            .unicodeScalars
            .filter { CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.")).contains($0) }
            .map { String($0) }
            .joined()
        let fileName = safeName.isEmpty ? "COC.docx" : safeName

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? data.write(to: url)
        cocURL = url
        showCOCShare = true
    }
}

// MARK: - ScannedDocumentViewer

struct ScannedDocumentViewer: View {
    let scan: ScannedDocument
    @Environment(\.dismiss) private var dismiss

    private var sortedPages: [ScannedPage] {
        scan.pages.sorted { $0.pageNumber < $1.pageNumber }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(sortedPages.indices, id: \.self) { i in
                        if let img = UIImage(data: sortedPages[i].imageData) {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFit()
                                .cornerRadius(6)
                                .shadow(radius: 3)
                                .padding(.horizontal, 12)
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .navigationTitle(scan.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
