//
//  SignatureFormSheet.swift
//  Oversight
//
//  Drawable signature capture — ported from SignatureSheet in
//  oversight-sheets.jsx (canvas drawing there; SwiftUI Canvas + drag
//  gesture here). Saved as PNG data on the Inspector record.
//

import SwiftUI
import SwiftData

struct SignatureFormSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @Query private var inspectors: [Inspector]

    @State private var strokes: [[CGPoint]] = []
    @State private var currentStroke: [CGPoint] = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Text("Draw your signature below with a finger or mouse.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Canvas { context, size in
                    for stroke in strokes + [currentStroke] {
                        guard stroke.count > 1 else { continue }
                        var path = Path()
                        path.move(to: stroke[0])
                        for point in stroke.dropFirst() { path.addLine(to: point) }
                        context.stroke(path, with: .color(.primary), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                    }
                }
                .frame(height: 200)
                .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.separator))
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in currentStroke.append(value.location) }
                        .onEnded { _ in strokes.append(currentStroke); currentStroke = [] }
                )
                .padding(.horizontal)

                Button("Clear") { strokes = []; currentStroke = [] }
                    .padding(.top, 4)

                Spacer()
            }
            .padding(.top, 12)
            .navigationTitle("Signature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            // Existing signature is stored as image data — start blank
            // for re-drawing since strokes aren't retained separately.
        }
    }

    private func save() {
        let inspector = inspectors.first ?? {
            let created = Inspector()
            modelContext.insert(created)
            return created
        }()
        let renderer = ImageRenderer(content:
            Canvas { context, size in
                for stroke in strokes {
                    guard stroke.count > 1 else { continue }
                    var path = Path()
                    path.move(to: stroke[0])
                    for point in stroke.dropFirst() { path.addLine(to: point) }
                    context.stroke(path, with: .color(.black), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                }
            }
            .frame(width: 370, height: 200)
            .background(Color.white)
        )
        #if canImport(UIKit)
        if let uiImage = renderer.uiImage {
            inspector.signatureData = uiImage.pngData()
        }
        #endif
        try? modelContext.save()
        appState.showToast("Signature saved")
        dismiss()
    }
}
