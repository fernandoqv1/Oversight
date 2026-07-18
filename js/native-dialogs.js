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

// A styled, in-app replacement for window.prompt(), which Electron does not
// support (it returns null, silently breaking any "name/rename" flow). Uses the
// app's shared modal design system so it looks consistent with every other modal.
// Returns a Promise that resolves to the entered string, or null if cancelled.
(function () {
    'use strict';
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    window.showPromptModal = function (opts) {
        opts = opts || {};
        const title = opts.title || 'Enter a value';
        const label = opts.label || '';
        const defaultValue = opts.defaultValue != null ? String(opts.defaultValue) : '';
        const okText = opts.okText || 'Save';
        const placeholder = opts.placeholder || '';
        return new Promise(function (resolve) {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.style.zIndex = '20000';
            modal.innerHTML =
                '<div class="modal-content" style="max-width:440px;">' +
                '<h3>' + esc(title) + '</h3>' +
                '<form id="__prompt-form">' +
                (label ? '<label for="__prompt-input">' + esc(label) + '</label>' : '') +
                '<input type="text" id="__prompt-input" autocomplete="off" placeholder="' + esc(placeholder) + '">' +
                '</form>' +
                '<div class="modal-footer">' +
                '<button type="button" class="btn btn-secondary modal-cancel-btn" id="__prompt-cancel">Cancel</button>' +
                '<button type="submit" form="__prompt-form" class="btn btn-primary modal-save-btn">' + esc(okText) + '</button>' +
                '</div></div>';
            document.body.appendChild(modal);
            const input = modal.querySelector('#__prompt-input');
            input.value = defaultValue;
            const finish = function (val) { modal.remove(); resolve(val); };
            modal.querySelector('#__prompt-cancel').addEventListener('click', function () { finish(null); });
            modal.querySelector('#__prompt-form').addEventListener('submit', function (e) { e.preventDefault(); finish(input.value); });
            let downOnBackdrop = false;
            modal.addEventListener('mousedown', function (e) { downOnBackdrop = (e.target === modal); });
            modal.addEventListener('click', function (e) { if (e.target === modal && downOnBackdrop) finish(null); });
            document.addEventListener('keydown', function onKey(e) {
                if (!document.body.contains(modal)) { document.removeEventListener('keydown', onKey); return; }
                if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); finish(null); }
            });
            setTimeout(function () { input.focus(); input.select(); }, 30);
        });
    };
})();
