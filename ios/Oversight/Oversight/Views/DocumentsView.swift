//
//  DocumentsView.swift
//  Oversight
//
//  Ported from DocsScreen in oversight-screens.jsx. Template names match
//  the real .docx files shipped under /templates on desktop.
//

import SwiftUI
import SwiftData

struct DocumentsView: View {
    @Bindable var project: Project
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        List {
            Section("Generate") {
                ForEach(DocumentTemplate.allCases) { template in
                    Button {
                        generate(template)
                    } label: {
                        HStack {
                            Image(systemName: "doc.text.fill").foregroundStyle(.green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(template.rawValue).font(.subheadline.weight(.medium))
                                Text(template.summary).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
            Section("Generated · \(project.documents.count)") {
                if project.documents.isEmpty {
                    EmptyStateView(title: "No documents generated yet", subtitle: "Tap a template above.")
                } else {
                    ForEach(project.documents.sorted { $0.date > $1.date }) { doc in
                        HStack {
                            Image(systemName: "doc.text.fill").foregroundStyle(.green)
                            Text(doc.name).font(.subheadline)
                            Spacer()
                            Text(Fmt.date(doc.date)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Documents")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func generate(_ template: DocumentTemplate) {
        let doc = GeneratedDocument(name: template.rawValue, date: .now, project: project)
        modelContext.insert(doc)
        try? modelContext.save()
    }
}
