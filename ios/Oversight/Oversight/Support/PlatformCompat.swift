//
//  PlatformCompat.swift
//  Oversight
//
//  Cross-platform shims so the same SwiftUI code compiles for both the
//  iOS and macOS slices of the multiplatform target. iOS-only APIs
//  (navigationBarTitleDisplayMode, insetGrouped, keyboardType) are
//  applied only under #if os(iOS).
//

import SwiftUI

extension View {
    /// `.navigationBarTitleDisplayMode(.inline)` on iOS; no-op on macOS.
    @ViewBuilder
    func inlineNavTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    /// `.listStyle(.insetGrouped)` on iOS; `.inset` on macOS.
    @ViewBuilder
    func groupedListStyle() -> some View {
        #if os(iOS)
        self.listStyle(.insetGrouped)
        #else
        self.listStyle(.inset)
        #endif
    }

    /// Phone-pad keyboard on iOS; no-op on macOS.
    @ViewBuilder
    func phoneKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.phonePad)
        #else
        self
        #endif
    }

    /// Decimal-pad keyboard on iOS; no-op on macOS.
    @ViewBuilder
    func decimalKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
        #else
        self
        #endif
    }
}
