//
//  AppearanceFormSheet.swift
//  Oversight
//
//  Theme + accent color — ported from AppearanceSheet in
//  oversight-sheets.jsx (Profile → Appearance).
//

import SwiftUI

struct AppearanceFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppearancePrefs.darkModeKey) private var darkMode = false
    @AppStorage(AppearancePrefs.accentKey) private var accentRaw = AppAccent.blue.rawValue

    var body: some View {
        NavigationStack {
            Form {
                Section("Theme") {
                    Picker("Theme", selection: $darkMode) {
                        Text("Light").tag(false)
                        Text("Dark").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Accent color") {
                    ForEach(AppAccent.allCases) { accent in
                        Button {
                            accentRaw = accent.rawValue
                        } label: {
                            HStack {
                                Circle().fill(accent.color).frame(width: 22, height: 22)
                                Text(accent.name).foregroundStyle(.primary)
                                Spacer()
                                if accentRaw == accent.rawValue {
                                    Image(systemName: "checkmark").foregroundStyle(accent.color)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}
