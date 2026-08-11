//
//  SheetScaffold.swift
//  Oversight
//
//  Shared bottom-sheet chrome (Cancel / title / Save) — the SwiftUI
//  equivalent of the Sheet component in oversight-ui.jsx.
//

import SwiftUI

struct SheetScaffold<Content: View>: View {
    let title: String
    var saveLabel: String = "Save"
    var saveDisabled: Bool = false
    var hideCancelButton: Bool = false
    var onSave: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            Form { content }
                .navigationTitle(title)
                .inlineNavTitle()
                .toolbar {
                    if !hideCancelButton {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { dismiss() }
                        }
                    }
                    if let onSave {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(saveLabel) { onSave(); dismiss() }
                                .disabled(saveDisabled)
                                .fontWeight(.semibold)
                        }
                    }
                }
        }
    }
}
