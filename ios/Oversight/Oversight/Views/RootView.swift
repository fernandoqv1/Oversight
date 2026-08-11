//
//  RootView.swift
//  Oversight
//
//  App shell — 4-tab layout (Today, Projects, Archive, Profile).
//  First-run: if the inspector profile has no name, a non-dismissible
//  "Inspector Profile" cover is shown immediately — matching
//  promptInspectorProfileIfNeeded() in inspector-profile.js on the desktop app.
//

import SwiftUI
import SwiftData

struct RootView: View {
    @State private var appState = AppState()
    @AppStorage(AppearancePrefs.darkModeKey) private var darkMode = false
    @AppStorage(AppearancePrefs.accentKey) private var accentRaw = AppAccent.blue.rawValue
    @Query private var inspectors: [Inspector]
    @State private var showOnboarding = false

    private var accent: AppAccent { AppAccent(rawValue: accentRaw) ?? .blue }

    var body: some View {
        TabView(selection: $appState.tab) {
            NavigationStack { TodayView(inspector: inspectors.first) }
                .tabItem { Label(AppTab.today.title, systemImage: AppTab.today.systemImage) }
                .tag(AppTab.today)

            NavigationStack { ProjectsListView() }
                .tabItem { Label(AppTab.projects.title, systemImage: AppTab.projects.systemImage) }
                .tag(AppTab.projects)

            NavigationStack { ArchiveView() }
                .tabItem { Label(AppTab.archive.title, systemImage: AppTab.archive.systemImage) }
                .tag(AppTab.archive)

            NavigationStack { ProfileView() }
                .tabItem { Label(AppTab.profile.title, systemImage: AppTab.profile.systemImage) }
                .tag(AppTab.profile)
        }
        .tint(accent.color)
        .preferredColorScheme(darkMode ? .dark : .light)
        .environment(appState)
        .overlay(alignment: .bottom) {
            if let message = appState.toastMessage {
                Text(message)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
                    .padding(.bottom, 76)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
        .animation(.default, value: appState.toastMessage)
        .sheet(item: $appState.activeSheet) { sheet in
            sheetView(for: sheet)
                .environment(appState)
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            InspectorFormSheet(isOnboarding: true)
                .environment(appState)
                .interactiveDismissDisabled()
        }
        .onChange(of: inspectors, initial: true) {
            let needsSetup = inspectors.first.map {
                $0.name.trimmingCharacters(in: .whitespaces).isEmpty
            } ?? true
            showOnboarding = needsSetup
        }
    }

    @ViewBuilder
    private func sheetView(for sheet: ActiveSheet) -> some View {
        switch sheet {
        case .newProject:
            ProjectFormSheet(project: nil)
        case .editProject(let project):
            ProjectFormSheet(project: project)
        case .newSample(let project):
            AirSampleFormSheet(project: project, sample: nil)
        case .editSample(let project, let sample):
            AirSampleFormSheet(project: project, sample: sample)
        case .newContainment(let project):
            ContainmentFormSheet(project: project)
        case .editContainment(let project, let containment):
            ContainmentFormSheet(project: project, containment: containment)
        case .newVisualInspection(let containment):
            VisualInspectionFormSheet(containment: containment, inspection: nil)
        case .editVisualInspection(let containment, let inspection):
            VisualInspectionFormSheet(containment: containment, inspection: inspection)
        case .newWorker(let project):
            WorkerFormSheet(project: project, worker: nil)
        case .editWorker(let project, let worker):
            WorkerFormSheet(project: project, worker: worker)
        case .newDailyLog(let project):
            DailyLogFormSheet(project: project, dailyLog: nil)
        case .editDailyLog(let project, let log):
            DailyLogFormSheet(project: project, dailyLog: log)
        case .newLogEntry(let log):
            LogEntryFormSheet(dailyLog: log, logEntry: nil)
        case .editLogEntry(let log, let entry):
            LogEntryFormSheet(dailyLog: log, logEntry: entry)
        case .newBulkSample(let project):
            BulkSampleFormSheet(project: project, sample: nil)
        case .editBulkSample(let project, let sample):
            BulkSampleFormSheet(project: project, sample: sample)
        case .newWipeSample(let project):
            WipeSampleFormSheet(project: project, sample: nil)
        case .editWipeSample(let project, let sample):
            WipeSampleFormSheet(project: project, sample: sample)
        case .editSpace(let project, let space):
            SpaceFormSheet(project: project, space: space)
        case .newMaterial(let project):
            MaterialFormSheet(project: project)
        case .editMaterial(let project, let material):
            MaterialFormSheet(project: project, material: material)
        case .editMaterialByName(let project, let name):
            EditMaterialByNameSheet(project: project, originalName: name)
        case .newBulkSampleFromMaterial(let project, let matName, let hmrNum):
            BulkSampleFormSheet(project: project, sample: nil,
                                prefilledMaterialName: matName,
                                prefilledHmrNumber: hmrNum)
        case .inspectorDetails:
            InspectorFormSheet()
        case .signature:
            SignatureFormSheet()
        case .appearance:
            AppearanceFormSheet()
        case .defaultTemplates:
            DefaultTemplatesSheet()
        case .info(let title, let body):
            InfoSheet(title: title, body: body)
        case .scanDocument(let project):
            DocumentScannerSheet(project: project)
        case .copyWorkers(let project):
            CopyWorkersSheet(project: project)
        case .exportExcel(let project):
            ExcelExportSheet(project: project)
        case .importExcel:
            ExcelImportSheet()
        }
    }
}

#Preview {
    RootView()
        .modelContainer(for: Project.self, inMemory: true)
}
