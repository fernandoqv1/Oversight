//
//  InfoSheet.swift
//  Oversight
//
//  Generic read-only info sheet — ported from InfoSheet in
//  oversight-sheets.jsx (used for Certifications, Sync & Offline, About).
//

import SwiftUI

struct InfoSheet: View {
    let title: String
    let body_: String
    @Environment(\.dismiss) private var dismiss

    init(title: String, body: String) {
        self.title = title
        self.body_ = body
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(body_)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle(title)
            .inlineNavTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
