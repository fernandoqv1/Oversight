//
//  LogEntryFormSheet.swift
//  Oversight
//
//  Adds or edits a timestamped entry within a daily log. Fields: time,
//  notes, negative pressure readings, and up to 5 photos. Mirrors
//  individual log entry fields from the Windows app (js/project.js).
//

import SwiftUI
import SwiftData
import PhotosUI

struct LogEntryFormSheet: View {
    let dailyLog: DailyLog
    let logEntry: LogEntry?

    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState

    @State private var time = Date.now
    @State private var note = ""
    @State private var includesNegativePressure = false
    @State private var negativePressureNotes = ""

    @State private var selectedPhotos: [UIImage] = []
    @State private var showCamera = false
    @State private var photosPickerItems: [PhotosPickerItem] = []

    private let maxPhotos = 5
    private var remainingSlots: Int { maxPhotos - selectedPhotos.count }
    private var isEdit: Bool { logEntry != nil }
    private var isValid: Bool { !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        SheetScaffold(
            title: isEdit ? "Edit Entry" : "Log Entry",
            saveLabel: isEdit ? "Save" : "Add",
            saveDisabled: !isValid,
            onSave: save
        ) {
            Section {
                DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
            }

            Section("Notes") {
                TextEditor(text: $note)
                    .frame(minHeight: 100)
                    .overlay(alignment: .topLeading) {
                        if note.isEmpty {
                            Text("What happened on site today…")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8).padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
            }

            Section("Negative Pressure") {
                Toggle("Include readings", isOn: $includesNegativePressure)
                if includesNegativePressure {
                    TextEditor(text: $negativePressureNotes)
                        .frame(minHeight: 80)
                        .overlay(alignment: .topLeading) {
                            if negativePressureNotes.isEmpty {
                                Text("e.g. Rm A: -0.05 in. WC, Rm B: -0.04 in. WC")
                                    .foregroundStyle(.tertiary)
                                    .font(.caption)
                                    .padding(.top, 8).padding(.leading, 4)
                                    .allowsHitTesting(false)
                            }
                        }
                }
            }

            Section {
                photoThumbnailRow
                addPhotoButtons
            } header: {
                Text("Photos (\(selectedPhotos.count)/\(maxPhotos))")
            }
        }
        .onAppear(perform: loadExisting)
        .onChange(of: photosPickerItems) { _, newItems in
            Task {
                for item in newItems {
                    if selectedPhotos.count >= maxPhotos { break }
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        selectedPhotos.append(image)
                    }
                }
                photosPickerItems = []
            }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPickerView { image in
                if selectedPhotos.count < maxPhotos { selectedPhotos.append(image) }
                showCamera = false
            } onCancel: {
                showCamera = false
            }
            .ignoresSafeArea()
        }
        #endif
    }

    @ViewBuilder
    private var photoThumbnailRow: some View {
        if !selectedPhotos.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(selectedPhotos.indices, id: \.self) { i in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: selectedPhotos[i])
                                .resizable().scaledToFill()
                                .frame(width: 80, height: 80)
                                .clipped().cornerRadius(8)
                            Button { selectedPhotos.remove(at: i) } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundStyle(.white)
                                    .background(Circle().fill(Color.black.opacity(0.45)))
                            }
                            .padding(4)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder
    private var addPhotoButtons: some View {
        if remainingSlots > 0 {
            HStack(spacing: 20) {
                #if os(iOS)
                if CameraPickerView.isAvailable {
                    Button { showCamera = true } label: {
                        Label("Camera", systemImage: "camera")
                    }
                }
                #endif
                PhotosPicker(
                    selection: $photosPickerItems,
                    maxSelectionCount: remainingSlots,
                    matching: .images
                ) {
                    Label("Photo Library", systemImage: "photo.on.rectangle")
                }
            }
            .font(.subheadline)
        } else {
            Text("5-photo limit reached").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func loadExisting() {
        guard let entry = logEntry else { return }
        time = entry.time
        note = entry.note
        negativePressureNotes = entry.negativePressureNotes
        includesNegativePressure = !entry.negativePressureNotes.isEmpty
        // Load existing photos
        let sorted = entry.photos.sorted { $0.takenAt < $1.takenAt }
        selectedPhotos = sorted.compactMap { UIImage(data: $0.imageData) }
    }

    private func save() {
        let negNotes = includesNegativePressure ? negativePressureNotes : ""
        if let entry = logEntry {
            entry.time = time
            entry.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            entry.negativePressureNotes = negNotes
            // Replace photos
            for photo in entry.photos { modelContext.delete(photo) }
            for img in selectedPhotos {
                if let data = img.jpegData(compressionQuality: 0.78) {
                    let p = LogEntryPhoto(imageData: data, takenAt: .now)
                    p.logEntry = entry
                    modelContext.insert(p)
                }
            }
            entry.photoCount = selectedPhotos.count
            try? modelContext.save()
            appState.showToast("Entry updated")
        } else {
            let entry = LogEntry(
                time: time,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                photoCount: selectedPhotos.count,
                negativePressureNotes: negNotes,
                dailyLog: dailyLog
            )
            modelContext.insert(entry)
            for img in selectedPhotos {
                if let data = img.jpegData(compressionQuality: 0.78) {
                    let p = LogEntryPhoto(imageData: data, takenAt: .now)
                    p.logEntry = entry
                    modelContext.insert(p)
                }
            }
            try? modelContext.save()
            let photoSuffix = selectedPhotos.isEmpty ? "" : " with \(selectedPhotos.count) photo\(selectedPhotos.count == 1 ? "" : "s")"
            appState.showToast("Entry added\(photoSuffix)")
        }
    }
}
