//
//  DocumentScannerSheet.swift
//  Oversight
//
//  Presents VNDocumentCameraViewController (iOS) to scan physical documents
//  page-by-page. On completion the inspector names the scan and saves it.
//  Each page is stored as JPEG with .externalStorage in ScannedPage.
//

import SwiftUI
import SwiftData

struct DocumentScannerSheet: View {
    let project: Project

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var phase: Phase = .scanning
    @State private var scannedImages: [UIImage] = []
    @State private var scanName = ""

    private enum Phase { case scanning, naming }

    var body: some View {
        switch phase {
        case .scanning:
            #if os(iOS)
            DocumentCameraView { images in
                scannedImages = images
                scanName = "Scan \(Fmt.date(.now))"
                phase = .naming
            } onCancel: {
                dismiss()
            }
            .ignoresSafeArea()
            #else
            Text("Document scanning is only available on iPhone.")
                .padding()
            #endif

        case .naming:
            NavigationStack {
                Form {
                    Section("Document Name") {
                        TextField("e.g. Pre-Start Report", text: $scanName)
                    }
                    Section("\(scannedImages.count) page\(scannedImages.count == 1 ? "" : "s") scanned") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(scannedImages.indices, id: \.self) { i in
                                    Image(uiImage: scannedImages[i])
                                        .resizable()
                                        .scaledToFit()
                                        .frame(height: 130)
                                        .cornerRadius(6)
                                        .shadow(radius: 2)
                                }
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 2)
                        }
                    }
                }
                .navigationTitle("Save Scan")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { saveDocument() }
                            .disabled(scanName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private func saveDocument() {
        let doc = ScannedDocument(
            name: scanName.trimmingCharacters(in: .whitespaces),
            date: .now,
            project: project
        )
        modelContext.insert(doc)
        for (i, img) in scannedImages.enumerated() {
            if let data = img.jpegData(compressionQuality: 0.75) {
                let page = ScannedPage(imageData: data, pageNumber: i)
                page.document = doc
                modelContext.insert(page)
            }
        }
        try? modelContext.save()
        appState.showToast("\(scannedImages.count) page\(scannedImages.count == 1 ? "" : "s") saved")
        dismiss()
    }
}

#if os(iOS)
import VisionKit

private struct DocumentCameraView: UIViewControllerRepresentable {
    var onFinish: ([UIImage]) -> Void
    var onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentCameraView
        init(_ parent: DocumentCameraView) { self.parent = parent }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            parent.onFinish(images)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            parent.onCancel()
        }
    }
}
#endif
