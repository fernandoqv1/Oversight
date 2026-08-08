//
//  RootView.swift
//  Oversight
//
//  App shell — 4-tab layout (Today, Projects, Archive, Profile), matching
//  OvsTabBar / CurrentScreen routing in oversight-app.jsx & oversight-screens.jsx.
//  Each tab owns its own NavigationStack so drilling into a project and its
//  sections (Containments, Air Samples, Materials, Team, Documents) works
//  natively via NavigationLink instead of the prototype's custom view stack.
//

import SwiftUI
import SwiftData

struct RootView: View {
    @State private var appState = AppState()
    @AppStorage(AppearancePrefs.darkModeKey) private var darkMode = false
    @AppStorage(AppearancePrefs.accentKey) private var accentRaw = AppAccent.blue.rawValue

    private var accent: AppAccent { AppAccent(rawValue: accentRaw) ?? .blue }

    var body: some View {
        TabView(selection: $appState.tab) {
            NavigationStack { TodayView() }
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
        case .newWorker(let project):
            WorkerFormSheet(project: project, worker: nil)
        case .editWorker(let project, let worker):
            WorkerFormSheet(project: project, worker: worker)
        case .newDailyLog(let project):
            DailyLogFormSheet(project: project)
        case .newMaterial(let project):
            MaterialFormSheet(project: project)
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
        }
    }
}

#Preview {
    RootView()
        .modelContainer(for: Project.self, inMemory: true)
}
