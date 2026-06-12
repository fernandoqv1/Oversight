// Replace Chromium's window.alert/window.confirm with Electron message boxes.
//
// Chromium's built-in dialogs have a long-standing bug in Electron: after one
// closes, the renderer's focus state is broken — text inputs and <select>
// dropdowns stop responding to clicks until the page is reloaded. This app
// calls alert()/confirm() throughout (form validation, delete confirmations),
// so any of those could leave the page "frozen" for typing.
//
// The overrides keep the exact blocking semantics of the originals via
// synchronous IPC, so call sites like `if (!confirm(...)) return;` work
// unchanged. Outside Electron (plain browser), the natives are left alone.
(function () {
    'use strict';
    const api = window.electronAPI;
    if (!api || typeof api.nativeAlert !== 'function' || typeof api.nativeConfirm !== 'function') return;

    window.alert = function (message) {
        api.nativeAlert(message === undefined ? '' : String(message));
    };

    window.confirm = function (message) {
        return api.nativeConfirm(message === undefined ? '' : String(message)) === true;
    };
})();
