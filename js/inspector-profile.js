/**
 * Inspector Profile - stored in localStorage, available across all pages
 * Fields: name, initials, company, phone, email, certifications
 */

const INSPECTOR_PROFILE_KEY = 'inspector_profile';
const INSPECTOR_SIGNATURES_KEY = 'inspector_signatures_registry'; // Registry of signatures by inspector name

/**
 * Format a phone number as (XXX) XXX-XXXX
 * @param {string} value - The input value to format
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(value) {
    if (!value) return '';
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format based on length
    if (limited.length === 0) return '';
    if (limited.length <= 3) return `(${limited}`;
    if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}

/**
 * Apply phone number formatting to an input element
 * @param {HTMLInputElement} input - The input element to format
 */
function applyPhoneFormatting(input) {
    if (!input) return;
    
    // Format on input
    input.addEventListener('input', (e) => {
        const cursorPosition = e.target.selectionStart;
        const oldValue = e.target.value;
        const oldLength = oldValue.length;
        const formatted = formatPhoneNumber(e.target.value);
        e.target.value = formatted;
        
        // Adjust cursor position to account for formatting characters
        const newLength = formatted.length;
        const lengthDiff = newLength - oldLength;
        
        // Calculate new cursor position
        let newPosition = cursorPosition + lengthDiff;
        
        // If we're in the middle of typing, try to keep cursor in a logical position
        if (cursorPosition === oldLength) {
            // Cursor was at the end, keep it at the end
            newPosition = formatted.length;
        } else {
            // Cursor was in the middle, try to maintain relative position
            // Count digits before cursor in old value
            const digitsBefore = oldValue.slice(0, cursorPosition).replace(/\D/g, '').length;
            // Find position in new value where we have the same number of digits
            let digitCount = 0;
            for (let i = 0; i < formatted.length; i++) {
                if (/\d/.test(formatted[i])) {
                    digitCount++;
                    if (digitCount === digitsBefore) {
                        newPosition = i + 1;
                        break;
                    }
                }
            }
        }
        
        e.target.setSelectionRange(newPosition, newPosition);
    });
    
    // Format existing value if any
    if (input.value) {
        input.value = formatPhoneNumber(input.value);
    }
}

function getInspectorProfile() {
    try {
        const raw = localStorage.getItem(INSPECTOR_PROFILE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function isInspectorProfileComplete() {
    const profile = getInspectorProfile();
    return !!(String(profile.name || '').trim() && String(profile.initials || '').trim());
}

function promptInspectorProfileIfNeeded() {
    if (isInspectorProfileComplete()) return;
    requestAnimationFrame(() => openInspectorProfileModal({ startup: true }));
}

function saveInspectorProfile(profile) {
    localStorage.setItem(INSPECTOR_PROFILE_KEY, JSON.stringify(profile));
    
    // Also save signature to the registry keyed by inspector name
    if (profile.name && profile.signatureBase64) {
        const registry = getInspectorSignaturesRegistry();
        registry[profile.name] = profile.signatureBase64;
        localStorage.setItem(INSPECTOR_SIGNATURES_KEY, JSON.stringify(registry));
    }
    
    updateProfileButton();
}

/**
 * Get the signatures registry (map of inspector name -> signature base64)
 * @returns {Object} Object with inspector names as keys and signature base64 as values
 */
function getInspectorSignaturesRegistry() {
    try {
        const raw = localStorage.getItem(INSPECTOR_SIGNATURES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Convert base64 data URL to ArrayBuffer for docxtemplater image module
 * @param {string} dataURL - data:image/png;base64,... or data:image/jpeg;base64,...
 * @returns {ArrayBuffer|false} ArrayBuffer or false if invalid
 */
function base64DataURLToArrayBuffer(dataURL) {
    const base64Regex = /^data:image\/(png|jpg|jpeg|svg|svg\+xml);base64,/i;
    if (!dataURL || !base64Regex.test(dataURL)) return false;
    const stringBase64 = dataURL.replace(base64Regex, '');
    let binaryString;
    if (typeof window !== 'undefined') {
        binaryString = window.atob(stringBase64);
    } else {
        binaryString = Buffer.from(stringBase64, 'base64').toString('binary');
    }
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/** 1x1 transparent PNG for empty signature placeholder */
const EMPTY_SIGNATURE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Get image dimensions from buffer (JPEG/PNG). Sync, no external deps.
 * @param {ArrayBuffer} buf - Image buffer
 * @returns {{ width: number, height: number }|null}
 */
function getImageDimensionsFromBuffer(buf) {
    if (!buf || buf.byteLength < 24) return null;
    const u8 = new Uint8Array(buf);
    const readU16 = (o) => (u8[o] << 8) | u8[o + 1];
    const readU32 = (o) => (u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3];
    if (u8[0] === 0xFF && u8[1] === 0xD8) {
        let i = 2;
        while (i < u8.length - 8) {
            if (u8[i] !== 0xFF) { i++; continue; }
            if (u8[i + 1] === 0xC0 || u8[i + 1] === 0xC2) {
                return { height: readU16(i + 5), width: readU16(i + 7) };
            }
            i += 2 + readU16(i + 2);
        }
        return null;
    }
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
        return { width: readU32(16), height: readU32(20) };
    }
    return null;
}

/**
 * Scale dimensions to fit within maxW x maxH while preserving aspect ratio.
 * @param {number} w - Original width
 * @param {number} h - Original height
 * @param {number} maxW - Max width
 * @param {number} maxH - Max height
 * @returns {[number, number]}
 */
function fitDimensions(w, h, maxW, maxH) {
    if (!w || !h) return [Math.max(1, maxW), Math.max(1, maxH)];
    const scale = Math.min(maxW / w, maxH / h, 1);
    const wOut = Math.max(1, Math.round(w * scale));
    const hOut = Math.max(1, Math.round(h * scale));
    return [wOut, hOut];
}

/**
 * Create ImageModule instance for docxtemplater signature rendering.
 * Use {%image} or {%%image} (centered) in templates. Pass image: signatureBase64 in template data.
 * @returns {Object|null} ImageModule instance or null if ImageModule not loaded
 */
function createSignatureImageModule() {
    if (typeof ImageModule === 'undefined') return null;
    return new ImageModule({
        centered: false,
        fileType: 'docx',
        getImage: function (tagValue, tagName) {
            if (!tagValue || typeof tagValue !== 'string') {
                const decoded = atob(EMPTY_SIGNATURE_PNG);
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                return bytes.buffer;
            }
            // Strip whitespace/newlines that can corrupt base64
            const cleaned = String(tagValue).trim().replace(/\s/g, '');
            const buf = base64DataURLToArrayBuffer(cleaned);
            return buf || (function () {
                const decoded = atob(EMPTY_SIGNATURE_PNG);
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                return bytes.buffer;
            })();
        },
        getSize: function (imgBuffer, tagValue, partValue) {
            // Photo log: max 3.5" x 3.5" (336px), preserve aspect ratio
            if (partValue === 'photo') {
                const dims = getImageDimensionsFromBuffer(imgBuffer);
                if (dims) return fitDimensions(dims.width, dims.height, 336, 336);
                return [336, 336];
            }
            // Signature: small
            return [250, 80];
        }
    });
}

/**
 * Get signature base64 for a specific inspector by name
 * @param {string} inspectorName - The name of the inspector
 * @returns {string} base64 data URL or empty string
 */
function getInspectorSignatureByName(inspectorName) {
    if (!inspectorName) return '';
    const registry = getInspectorSignaturesRegistry();
    return registry[inspectorName] || '';
}

function updateProfileButton() {
    const profile = getInspectorProfile();
    const nameEl = document.getElementById('inspector-profile-name');
    if (nameEl) {
        if (profile.name) {
            nameEl.textContent = profile.name;
        } else {
            nameEl.textContent = 'Set Profile';
        }
    }
}

function openInspectorProfileModal(options = {}) {
    const profile = getInspectorProfile();
    const isStartupPrompt = !!options.startup;
    
    // Remove any existing modal
    document.querySelector('.inspector-profile-modal')?.remove();
    
    // Track signature data locally during modal session
    let currentSignatureBase64 = profile.signatureBase64 || '';
    
    const modal = document.createElement('div');
    modal.className = 'modal active inspector-profile-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    const hasSignature = !!currentSignatureBase64;
    
    modal.innerHTML = `
        <div class="modal-content" style="background:white;border-radius:1rem;padding:2rem;max-width:540px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
            <div style="margin-bottom:1.5rem;">
                <h3 style="font-size:1.25rem;font-weight:600;color:#111827;margin:0;">Inspector Profile</h3>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;">
                ${isStartupPrompt ? '<p class="profile-startup-notice">Please enter your inspector information before using Oversight.</p>' : ''}
                <div class="profile-summary" style="display:flex;align-items:center;gap:1rem;padding:1rem;background:#f3f4f6;border-radius:0.75rem;">
                    <div style="width:48px;height:48px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.125rem;" id="profile-avatar">
                        ${profile.initials || '?'}
                    </div>
                    <div>
                        <p class="profile-summary-name">${_escHtml(profile.name || 'Inspector Name')}</p>
                        <p class="profile-summary-meta">${_escHtml(profile.company || 'Company not set')}</p>
                    </div>
                </div>
                <div>
                    <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Full Name *</label>
                    <input type="text" id="profile-name" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="e.g., John Smith" value="${_escHtml(profile.name || '')}">
                </div>
                <div>
                    <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Initials *</label>
                    <input type="text" id="profile-initials" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="e.g., JS" maxlength="4" value="${_escHtml(profile.initials || '')}">
                </div>
                <div>
                    <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Company</label>
                    <input type="text" id="profile-company" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="e.g., Environmental Consulting Inc." value="${_escHtml(profile.company || '')}">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Phone</label>
                        <input type="tel" id="profile-phone" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="(555) 123-4567" value="${_escHtml(profile.phone || '')}">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Email</label>
                        <input type="email" id="profile-email" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="john@company.com" value="${_escHtml(profile.email || '')}">
                    </div>
                </div>
                <div>
                    <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">Certification Number</label>
                    <input type="text" id="profile-certification" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="e.g., AI-12345" value="${_escHtml(profile.certificationNumber || '')}">
                </div>
                <div>
                    <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.25rem;">License/State</label>
                    <input type="text" id="profile-license" style="width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;font-size:0.875rem;" placeholder="e.g., NJ DEP Licensed" value="${_escHtml(profile.license || '')}">
                </div>
                
                <!-- Signature Section -->
                <div style="border-top:1px solid #e5e7eb;padding-top:1rem;">
                    <label style="display:block;font-size:0.875rem;font-weight:600;color:#374151;margin-bottom:0.5rem;">Signature (Optional)</label>
                    <p class="profile-hint" style="font-size:0.75rem;color:#6b7280;margin-bottom:0.75rem;">Upload an image or draw your signature. This will be placed on generated documents.</p>
                    
                    <!-- Signature Preview -->
                    <div id="sig-preview-area" style="display:${hasSignature ? 'flex' : 'none'};flex-direction:column;align-items:center;justify-content:center;margin-bottom:0.75rem;padding:0.75rem;border:1px solid #d1d5db;border-radius:0.5rem;background:#fafafa;">
                        <p class="profile-hint" style="font-size:0.75rem;color:#6b7280;margin-bottom:0.5rem;">Current Signature:</p>
                        <img id="sig-preview-img" src="${hasSignature ? _safeImageSrc(currentSignatureBase64) : ''}" alt="Signature" style="max-width:100%;max-height:80px;display:block;margin:0 auto;${hasSignature ? '' : 'display:none;'}">
                        <div style="margin-top:0.5rem;">
                            <button id="sig-remove-btn" type="button" style="padding:0.25rem 0.75rem;border:1px solid #ef4444;border-radius:0.375rem;background:white;color:#ef4444;font-size:0.75rem;cursor:pointer;">Remove Signature</button>
                        </div>
                    </div>
                    
                    <!-- Signature Mode Tabs -->
                    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
                        <button id="sig-tab-upload" type="button" style="flex:1;padding:0.5rem;border:2px solid #4f46e5;border-radius:0.5rem;background:#eef2ff;color:#4f46e5;font-size:0.8rem;font-weight:500;cursor:pointer;">Upload Image</button>
                        <button id="sig-tab-draw" type="button" style="flex:1;padding:0.5rem;border:2px solid #d1d5db;border-radius:0.5rem;background:white;color:#374151;font-size:0.8rem;font-weight:500;cursor:pointer;">Draw Signature</button>
                    </div>
                    
                    <!-- Upload Panel -->
                    <div id="sig-upload-panel" style="display:block;">
                        <input type="file" id="sig-file-input" accept="image/png,image/jpeg" style="display:none;">
                        <button id="sig-upload-btn" type="button" style="width:100%;padding:0.75rem;border:2px dashed #d1d5db;border-radius:0.5rem;background:#f9fafb;color:#6b7280;font-size:0.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                            Choose PNG or JPG file
                        </button>
                    </div>
                    
                    <!-- Draw Panel -->
                    <div id="sig-draw-panel" style="display:none;">
                        <div style="border:2px solid #d1d5db;border-radius:0.5rem;overflow:hidden;background:white;">
                            <canvas id="sig-canvas" width="460" height="150" style="width:100%;cursor:crosshair;display:block;"></canvas>
                        </div>
                        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                            <button id="sig-canvas-clear" type="button" style="flex:1;padding:0.4rem;border:1px solid #d1d5db;border-radius:0.375rem;background:white;color:#374151;font-size:0.8rem;cursor:pointer;">Clear</button>
                            <button id="sig-canvas-save" type="button" style="flex:1;padding:0.4rem;border:none;border-radius:0.375rem;background:#4f46e5;color:white;font-size:0.8rem;cursor:pointer;">Use This Signature</button>
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e5e7eb;">
                <button class="profile-cancel-btn" style="padding:0.625rem 1.25rem;border:1px solid #d1d5db;border-radius:0.5rem;background:white;color:#374151;font-size:0.875rem;font-weight:500;cursor:pointer;">Cancel</button>
                <button class="profile-save-btn" style="padding:0.625rem 1.25rem;border:none;border-radius:0.5rem;background:#4f46e5;color:white;font-size:0.875rem;font-weight:500;cursor:pointer;">Save Profile</button>
            </div>
        </div>
    `;
    
    // Events
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal && mouseDownOnBackdrop) {
            modal.remove();
        }
        mouseDownOnBackdrop = false;
    });
    
    modal.querySelector('.profile-cancel-btn').addEventListener('click', () => modal.remove());
    
    // ========== Signature Tab Switching ==========
    const tabUpload = modal.querySelector('#sig-tab-upload');
    const tabDraw = modal.querySelector('#sig-tab-draw');
    const panelUpload = modal.querySelector('#sig-upload-panel');
    const panelDraw = modal.querySelector('#sig-draw-panel');
    
    tabUpload.addEventListener('click', () => {
        tabUpload.style.borderColor = '#4f46e5';
        tabUpload.style.background = '#eef2ff';
        tabUpload.style.color = '#4f46e5';
        tabDraw.style.borderColor = '#d1d5db';
        tabDraw.style.background = 'white';
        tabDraw.style.color = '#374151';
        panelUpload.style.display = 'block';
        panelDraw.style.display = 'none';
    });
    
    tabDraw.addEventListener('click', () => {
        tabDraw.style.borderColor = '#4f46e5';
        tabDraw.style.background = '#eef2ff';
        tabDraw.style.color = '#4f46e5';
        tabUpload.style.borderColor = '#d1d5db';
        tabUpload.style.background = 'white';
        tabUpload.style.color = '#374151';
        panelDraw.style.display = 'block';
        panelUpload.style.display = 'none';
    });
    
    // ========== Signature Upload ==========
    const fileInput = modal.querySelector('#sig-file-input');
    const uploadBtn = modal.querySelector('#sig-upload-btn');
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
            alert('Please select a PNG or JPG image file.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('Image file is too large. Please use an image under 2MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            currentSignatureBase64 = evt.target.result;
            _updateSignaturePreview(modal, currentSignatureBase64);
        };
        reader.readAsDataURL(file);
    });
    
    // ========== Signature Canvas Drawing ==========
    const canvas = modal.querySelector('#sig-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if (e.touches && e.touches.length > 0) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    function startDraw(e) {
        e.preventDefault();
        isDrawing = true;
        const coords = getCanvasCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const coords = getCanvasCoords(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function stopDraw(e) {
        if (e) e.preventDefault();
        isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);
    
    modal.querySelector('#sig-canvas-clear').addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    
    modal.querySelector('#sig-canvas-save').addEventListener('click', () => {
        // Check if canvas has any drawings (not blank)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasContent = imageData.data.some((val, idx) => idx % 4 === 3 && val > 0); // check alpha channel
        if (!hasContent) {
            alert('Please draw your signature on the canvas first.');
            return;
        }
        currentSignatureBase64 = canvas.toDataURL('image/png');
        _updateSignaturePreview(modal, currentSignatureBase64);
    });
    
    // ========== Remove Signature ==========
    modal.querySelector('#sig-remove-btn').addEventListener('click', () => {
        currentSignatureBase64 = '';
        _updateSignaturePreview(modal, '');
    });
    
    // ========== Save Profile ==========
    modal.querySelector('.profile-save-btn').addEventListener('click', () => {
        const name = document.getElementById('profile-name').value.trim();
        const initials = document.getElementById('profile-initials').value.trim();
        
        if (!name) {
            alert('Please enter your name.');
            return;
        }
        if (!initials) {
            alert('Please enter your initials.');
            return;
        }
        
        const updatedProfile = {
            name: name,
            initials: initials,
            company: document.getElementById('profile-company').value.trim(),
            phone: document.getElementById('profile-phone').value.trim(),
            email: document.getElementById('profile-email').value.trim(),
            certificationNumber: document.getElementById('profile-certification').value.trim(),
            license: document.getElementById('profile-license').value.trim(),
            signatureBase64: currentSignatureBase64,
            updatedAt: new Date().toISOString()
        };
        
        saveInspectorProfile(updatedProfile);
        modal.remove();
        
        // Show a quick notification if available
        const area = document.getElementById('notification-area');
        if (area) {
            const note = document.createElement('div');
            note.className = 'p-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600';
            note.textContent = 'Profile saved!';
            area.appendChild(note);
            setTimeout(() => note.remove(), 3000);
        }
    });
    
    // Auto-generate initials from name
    const nameInput = modal.querySelector('#profile-name');
    const initialsInput = modal.querySelector('#profile-initials');
    nameInput.addEventListener('input', () => {
        const parts = nameInput.value.trim().split(/\s+/);
        if (parts.length >= 2 && !initialsInput.dataset.userEdited) {
            initialsInput.value = parts.map(p => p[0]).join('').toUpperCase().substr(0, 4);
            const avatar = modal.querySelector('#profile-avatar');
            if (avatar) avatar.textContent = initialsInput.value || '?';
        }
    });
    initialsInput.addEventListener('input', () => {
        initialsInput.dataset.userEdited = 'true';
        const avatar = modal.querySelector('#profile-avatar');
        if (avatar) avatar.textContent = initialsInput.value || '?';
    });
    
    document.body.appendChild(modal);
    nameInput.focus();
    
    // Apply phone formatting to phone input
    setTimeout(() => {
        const phoneInput = document.getElementById('profile-phone');
        if (phoneInput) {
            applyPhoneFormatting(phoneInput);
        }
    }, 50);
}

/**
 * Update the signature preview area in the profile modal
 */
function _updateSignaturePreview(modal, base64) {
    const previewArea = modal.querySelector('#sig-preview-area');
    const previewImg = modal.querySelector('#sig-preview-img');
    if (base64) {
        previewArea.style.display = 'block';
        previewImg.src = base64;
        previewImg.style.display = 'inline-block';
    } else {
        previewArea.style.display = 'none';
        previewImg.src = '';
        previewImg.style.display = 'none';
    }
}

function _escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    // Also escape double quotes for safe use in HTML attributes (e.g. value="...")
    return div.innerHTML.replace(/"/g, '&quot;');
}

// Only allow well-formed data:image/* base64 URLs to be interpolated into
// <img src=...>. Anything else collapses to a 1x1 transparent PNG so a
// tampered signature blob can never carry script through an attribute.
const _SAFE_IMG_FALLBACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
const _SAFE_IMG_HDR_RE = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i;
function _safeImageSrc(value) {
    if (typeof value !== 'string') return _SAFE_IMG_FALLBACK;
    const trimmed = value.trim();
    const m = _SAFE_IMG_HDR_RE.exec(trimmed);
    if (!m) return _SAFE_IMG_FALLBACK;
    const payload = trimmed.slice(m[0].length);
    if (!payload.length || /[^A-Za-z0-9+/=\s]/.test(payload)) return _SAFE_IMG_FALLBACK;
    return trimmed.replace(/"/g, '');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateProfileButton();
    promptInspectorProfileIfNeeded();

    const profileBtn = document.getElementById('inspector-profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => openInspectorProfileModal());
    }
});
