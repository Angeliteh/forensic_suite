document.addEventListener('DOMContentLoaded', () => {
    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');
    const pageTitles = {
        dashboard: 'Resumen del caso',
        adb: 'Android / Respaldo y observación',
        whatsapp: 'WhatsApp Web / Auditoría',
        settings: 'Ajustes del espacio de trabajo'
    };
    pageTitles.dashboard = 'Resumen';
    pageTitles.adb = 'Android';
    pageTitles.whatsapp = 'WhatsApp Web';
    pageTitles.settings = 'Ajustes';

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');

            // Update active states
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            if (pageTitle) pageTitle.textContent = pageTitles[targetId] || 'Forensic Suite';

            // Show target section
            viewSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) {
                    section.classList.add('active');
                }
            });
        });
    });

    document.querySelectorAll('.route-link').forEach((item) => {
        item.addEventListener('click', () => {
            const target = document.querySelector(`.nav-item[data-target="${item.dataset.target}"]`);
            if (target) target.click();
            else {
                navItems.forEach(nav => nav.classList.remove('active'));
                viewSections.forEach(section => section.classList.toggle('active', section.id === item.dataset.target));
                if (pageTitle) pageTitle.textContent = pageTitles[item.dataset.target] || 'Forensic';
            }
        });
    });

    // Abrir directamente la herramienta principal; Android sigue disponible
    // desde la barra lateral y el flujo técnico permanece separado.
    document.querySelector('.nav-item[data-target="whatsapp"]')?.click();

    // License Logic (Mock for now, ready for Lemon Squeezy integration)
    const btnActivate = document.getElementById('btn-activate-license');
    const licenseInput = document.getElementById('license-key-input');
    const licenseError = document.getElementById('license-error');
    const licenseOverlay = document.getElementById('license-overlay');
    const runtimeConfig = window.electronAPI.getRuntimeConfig();

    if (runtimeConfig?.bypassLicense) {
        licenseOverlay.classList.add('hidden-overlay');
    }

    btnActivate.addEventListener('click', () => {
        const key = licenseInput.value.trim();
        
        if (key.length < 10) {
            licenseError.textContent = "Por favor, introduce una llave válida.";
            licenseError.classList.remove('hidden');
            return;
        }

        // Simulate API verification delay
        btnActivate.textContent = "Verificando...";
        btnActivate.disabled = true;

        setTimeout(() => {
            // Here we will do the real fetch() to your backend/Lemon Squeezy
            // For now, any key > 10 chars is "valid" to let you test the UI
            licenseError.classList.add('hidden');
            licenseOverlay.classList.add('hidden-overlay');
            btnActivate.textContent = "Verificar Licencia";
            btnActivate.disabled = false;
        }, 1500);
    });

    // Logout / Deactivate Logic
    const btnDeactivate = document.getElementById('btn-deactivate');
    if (btnDeactivate) {
        btnDeactivate.addEventListener('click', () => {
            if (runtimeConfig?.bypassLicense) {
                licenseOverlay.classList.add('hidden-overlay');
                return;
            }
            // Show overlay again
            licenseInput.value = "";
            licenseOverlay.classList.remove('hidden-overlay');
        });
    }

    // ADB Form Logic
    const adbMethodSelect = document.getElementById('adb-method');
    const wifiConfig = document.getElementById('wifi-config');
    const wifiPairFields = document.getElementById('wifi-pair-fields');
    let connectionReady = false;

    function syncWifiFields() {
        const method = adbMethodSelect.value;
        const isWifi = method.includes('wifi');
        const isNewPairing = method === 'wifi-new';
        wifiConfig.classList.toggle('hidden', !isWifi);
        wifiPairFields?.classList.toggle('hidden', !isNewPairing);
    }

    adbMethodSelect.addEventListener('change', () => {
        syncWifiFields();
        connectionReady = false;
        if (typeof updateAndroidButtons === 'function') updateAndroidButtons(false);
        if (typeof renderAndroidDevices === 'function') renderAndroidDevices();
        androidStatus.textContent = 'Actualizando dispositivos para el transporte seleccionado...';
        window.electronAPI.send('android-list-devices');
    });
    syncWifiFields();

    // Terminal Logic
    const terminalOutput = document.getElementById('terminal-output');
    const adbExtractionOutput = document.getElementById('adb-extraction-output');
    const adbExtractionStatus = document.getElementById('adb-extraction-status');
    function logToTerminal(message) {
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        terminalOutput.appendChild(line);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    function logToAdbExtraction(message) {
        if (!adbExtractionOutput) return;
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        adbExtractionOutput.appendChild(line);
        adbExtractionOutput.scrollTop = adbExtractionOutput.scrollHeight;
    }

    function setAdbExtractionStatus(state, message) {
        if (!adbExtractionStatus) return;
        adbExtractionStatus.className = `operation-status ${state}`;
        adbExtractionStatus.textContent = message;
    }

    // Start Button Logic
    const btnStartAdb = document.getElementById('btn-start-adb');
    const adbTestModeInput = document.getElementById('adb-test-mode');
    function syncBackupModeLabel() {
        const label = adbTestModeInput.checked ? 'INICIAR RESPALDO CONTROLADO' : 'INICIAR RESPALDO COMPLETO';
        btnStartAdb.querySelector('span').textContent = label;
    }
    adbTestModeInput.addEventListener('change', syncBackupModeLabel);
    syncBackupModeLabel();
    btnStartAdb.addEventListener('click', () => {
        if (!connectionReady || !document.getElementById('android-device-select')?.value) {
            setAdbExtractionStatus('error', 'Prepara primero una conexion ADB valida en la tarjeta de conexion.');
            return;
        }
        const method = adbMethodSelect.value;
        const testMode = document.getElementById('adb-test-mode').checked;
        const includeThumbnails = document.getElementById('adb-include-thumbnails').checked;
        const includeTrash = document.getElementById('adb-include-trash').checked;
        const connectIpPort = document.getElementById('adb-ip').value.trim();
        const pairIpPort = document.getElementById('adb-pair-ip')?.value.trim() || '';
        const pinCode = document.getElementById('adb-pair-code')?.value.trim() || '';
        const selectedSerial = document.getElementById('android-device-select')?.value;

        terminalOutput.replaceChildren();
        adbExtractionOutput?.replaceChildren();
        logToTerminal('>> Iniciando secuencia ADB...');
        logToAdbExtraction('>> Iniciando respaldo ADB...');
        setAdbExtractionStatus('running', 'En curso. El progreso aparecerá aquí y no se hará fallback a carpetas completas.');
        btnStartAdb.disabled = true;
        btnStartAdb.querySelector('span').textContent = 'RESPALDO EN CURSO...';

        // Send to Main Process
        window.electronAPI.send('start-adb', {
            method,
            testMode,
            includeThumbnails,
            includeTrash,
            ipPort: connectIpPort,
            connectIpPort,
            pairIpPort,
            pinCode,
            serial: selectedSerial || undefined
        });
    });

    // Android Lab / scrcpy
    const androidDeviceSelect = document.getElementById('android-device-select');
    const deviceBannerTitle = document.getElementById('device-banner-title');
    const btnAndroidRefresh = document.getElementById('btn-android-refresh');
    const btnAndroidConnect = document.getElementById('btn-android-connect');
    const androidConnectionBadge = document.getElementById('android-connection-badge');
    const androidConnectionStatus = document.getElementById('android-connection-status');
    const androidConnectionOutput = document.getElementById('android-connection-output');
    const btnAndroidMirror = document.getElementById('btn-android-mirror');
    const btnAndroidStop = document.getElementById('btn-android-stop');
    const androidMirrorRecord = document.getElementById('android-mirror-record');
    const androidMirrorStayAwake = document.getElementById('android-mirror-stay-awake');
    const btnAndroidObservedSession = document.getElementById('btn-android-observed-session');
    const btnAndroidStopObservedSession = document.getElementById('btn-android-stop-observed-session');
    const androidStatus = document.getElementById('android-status');
    if (androidStatus) androidStatus.textContent = 'ADB pendiente de validacion.';
    const androidDeviceHelp = document.getElementById('android-device-help');
    const adbLearningCommand = document.getElementById('adb-learning-command');
    const adbLearningDescription = document.getElementById('adb-learning-description');
    const btnAdbLearningRun = document.getElementById('btn-adb-learning-run');
    const adbLearningOutput = document.getElementById('adb-learning-output');
    const btnAndroidScreenshot = document.getElementById('btn-android-screenshot');
    const btnAndroidRecord = document.getElementById('btn-android-record');
    const btnAndroidBackupPlan = document.getElementById('btn-android-backup-plan');
    const btnAndroidDiscoverMedia = document.getElementById('btn-android-discover-media');
    const androidMediaInventoryStatus = document.getElementById('android-media-inventory-status');
    const androidMediaInventoryOutput = document.getElementById('android-media-inventory-output');
    const btnAndroidGalleryRpa = document.getElementById('btn-android-gallery-rpa');
    const androidGalleryRpaStatus = document.getElementById('android-gallery-rpa-status');
    const androidGalleryRpaOutput = document.getElementById('android-gallery-rpa-output');
    const androidEvidenceOutput = document.getElementById('android-evidence-output');
    const androidSessionRecord = document.getElementById('android-session-record');
    const androidSessionStayAwake = document.getElementById('android-session-stay-awake');
    const androidSessionBackup = document.getElementById('android-session-backup');
    const androidSessionScreenshots = document.getElementById('android-session-screenshots');
    const androidObservedSessionStatus = document.getElementById('android-observed-session-status');
    const androidObservedSessionOutput = document.getElementById('android-observed-session-output');
    const androidActionType = document.getElementById('android-action-type');
    const androidTapFields = document.getElementById('android-tap-fields');
    const androidSwipeFields = document.getElementById('android-swipe-fields');
    const androidActionDurationGroup = document.getElementById('android-action-duration-group');
    const androidActionLabelGroup = document.getElementById('android-action-label-group');
    const btnAndroidActionRun = document.getElementById('btn-android-action-run');
    const androidActionStatus = document.getElementById('android-action-status');
    const androidActionOutput = document.getElementById('android-action-output');
    let observedSessionRunning = false;
    let mirrorRunning = false;
    let galleryRpaRunning = false;

    function setConnectionStatus(state, message) {
        if (androidConnectionStatus) {
            androidConnectionStatus.className = `operation-status ${state}`;
            androidConnectionStatus.textContent = message;
        }
        if (androidConnectionBadge) {
            androidConnectionBadge.className = `state-badge ${state === 'success' ? 'success' : state === 'running' ? 'real' : 'muted'}`;
            androidConnectionBadge.textContent = state === 'success' ? 'CONECTADO' : state === 'running' ? 'VALIDANDO' : 'SIN CONEXION';
        }
    }

    function logToConnection(message) {
        if (!androidConnectionOutput) return;
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        androidConnectionOutput.appendChild(line);
        androidConnectionOutput.scrollTop = androidConnectionOutput.scrollHeight;
    }

    function updateAndroidButtons(running) {
        if (typeof running === 'boolean') mirrorRunning = running;
        const hasReadyDevice = connectionReady && Boolean(androidDeviceSelect.value);
        btnAndroidMirror.disabled = mirrorRunning || observedSessionRunning || !hasReadyDevice;
        btnAndroidStop.disabled = !mirrorRunning || observedSessionRunning;
        btnAndroidObservedSession.disabled = observedSessionRunning || mirrorRunning || !hasReadyDevice;
        btnAndroidStopObservedSession.disabled = !observedSessionRunning;
        btnAdbLearningRun.disabled = !adbLearningCommand.value;
        const evidenceDisabled = !hasReadyDevice;
        btnAndroidScreenshot.disabled = evidenceDisabled;
        btnAndroidRecord.disabled = evidenceDisabled;
        btnAndroidBackupPlan.disabled = false;
        if (btnAndroidDiscoverMedia) btnAndroidDiscoverMedia.disabled = evidenceDisabled;
        if (btnAndroidGalleryRpa) btnAndroidGalleryRpa.disabled = evidenceDisabled || observedSessionRunning || galleryRpaRunning;
        btnAndroidActionRun.disabled = !(mirrorRunning || observedSessionRunning) || !hasReadyDevice;
        btnStartAdb.disabled = !hasReadyDevice;
        if (btnAndroidConnect) btnAndroidConnect.disabled = false;
    }

    function syncPairedWifiEndpoint() {
        if (adbMethodSelect.value !== 'wifi-paired') return;
        const selectedSerial = androidDeviceSelect.value || '';
        if (/^[A-Za-z0-9.-]+:\d{1,5}$/.test(selectedSerial)) {
            const connectionInput = document.getElementById('adb-ip');
            if (connectionInput) connectionInput.value = selectedSerial;
        }
    }

    let availableAndroidDevices = [];

    function isWifiDevice(device) {
        return device?.transport === 'wifi'
            || /^[A-Za-z0-9.-]+:\d{1,5}$/.test(String(device?.serial || ''));
    }

    function visibleAndroidDevices() {
        if (adbMethodSelect.value === 'usb') {
            return availableAndroidDevices.filter((device) => !isWifiDevice(device));
        }
        return availableAndroidDevices.filter((device) => isWifiDevice(device));
    }

    function renderAndroidDevices() {
        const currentSerial = androidDeviceSelect.value;
        const devices = visibleAndroidDevices();
        androidDeviceSelect.replaceChildren();
        if (devices.length === 0) {
            const transportLabel = adbMethodSelect.value === 'usb' ? 'USB' : 'Wi-Fi';
            androidDeviceSelect.appendChild(new Option(`No hay dispositivos ${transportLabel} detectados`, ''));
            return devices;
        }
        devices.forEach((device) => {
            const transportLabel = isWifiDevice(device) ? 'Wi-Fi' : 'USB';
            const option = new Option(`${transportLabel} | ${device.serial} | ${device.state}`, device.serial);
            option.title = device.details || '';
            androidDeviceSelect.appendChild(option);
        });
        if (devices.some((device) => device.serial === currentSerial)) {
            androidDeviceSelect.value = currentSerial;
        }
        syncPairedWifiEndpoint();
        return devices;
    }

    window.electronAPI.send('android-learning-catalog');

    adbLearningCommand.addEventListener('change', () => {
        const selected = adbLearningCommand.options[adbLearningCommand.selectedIndex];
        adbLearningDescription.textContent = selected?.dataset.description || 'Selecciona una operación de solo lectura.';
        updateAndroidButtons(false);
    });

    btnAdbLearningRun.addEventListener('click', () => {
        const selected = adbLearningCommand.value;
        if (!selected) return;
        adbLearningOutput.textContent = 'Ejecutando...';
        window.electronAPI.send('android-learning-command', {
            id: selected,
            serial: androidDeviceSelect.value
        });
    });

    function runEvidenceOperation(operation) {
        androidEvidenceOutput.textContent = 'Preparando operacion...';
        window.electronAPI.send('android-evidence-operation', {
            operation,
            serial: androidDeviceSelect.value
        });
    }

    btnAndroidScreenshot.addEventListener('click', () => runEvidenceOperation('screenshot'));
    btnAndroidRecord.addEventListener('click', () => runEvidenceOperation('screenrecord'));
    btnAndroidBackupPlan.addEventListener('click', () => runEvidenceOperation('backup-plan'));

    btnAndroidDiscoverMedia?.addEventListener('click', () => {
        if (!connectionReady || !androidDeviceSelect.value) return;
        btnAndroidDiscoverMedia.disabled = true;
        androidMediaInventoryStatus.className = 'operation-status running';
        androidMediaInventoryStatus.textContent = 'Consultando almacenamiento compartido; no se copiaran archivos.';
        androidMediaInventoryOutput.textContent = 'Ejecutando inventario multimedia...';
        window.electronAPI.send('android-discover-media', {
            serial: androidDeviceSelect.value
        });
    });

    function logToGalleryRpa(message) {
        if (!androidGalleryRpaOutput) return;
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        androidGalleryRpaOutput.appendChild(line);
        androidGalleryRpaOutput.scrollTop = androidGalleryRpaOutput.scrollHeight;
    }

    btnAndroidGalleryRpa?.addEventListener('click', () => {
        if (!connectionReady || !androidDeviceSelect.value || galleryRpaRunning) return;
        galleryRpaRunning = true;
        androidGalleryRpaOutput?.replaceChildren();
        androidGalleryRpaStatus.className = 'operation-status running';
        androidGalleryRpaStatus.textContent = 'Ejecutando tap semantico y un scroll; las capturas se guardaran en el expediente.';
        logToGalleryRpa('[Sistema] RPA acotado: esperando Galeria en primer plano...');
        logToGalleryRpa('[Sistema] Abre el mirroring para observar el dispositivo en tiempo real.');
        updateAndroidButtons(false);
        window.electronAPI.send('android-gallery-rpa', {
            serial: androidDeviceSelect.value
        });
    });

    function updateMobileActionFields() {
        const type = androidActionType.value;
        androidTapFields.classList.toggle('hidden', type !== 'tap');
        androidSwipeFields.classList.toggle('hidden', type !== 'swipe');
        androidActionDurationGroup.classList.toggle('hidden', !['swipe', 'wait'].includes(type));
        androidActionLabelGroup.classList.toggle('hidden', type !== 'screenshot');
    }

    androidActionType.addEventListener('change', updateMobileActionFields);
    updateMobileActionFields();

    btnAndroidActionRun.addEventListener('click', () => {
        const type = androidActionType.value;
        const action = { type };
        if (type === 'tap') {
            action.x = Number(document.getElementById('android-action-x').value);
            action.y = Number(document.getElementById('android-action-y').value);
        } else if (type === 'swipe') {
            action.x1 = Number(document.getElementById('android-action-x1').value);
            action.y1 = Number(document.getElementById('android-action-y1').value);
            action.x2 = Number(document.getElementById('android-action-x2').value);
            action.y2 = Number(document.getElementById('android-action-y2').value);
            action.duration = Number(document.getElementById('android-action-duration').value);
        } else if (type === 'wait') {
            action.milliseconds = Number(document.getElementById('android-action-duration').value);
        } else if (type === 'screenshot') {
            action.label = document.getElementById('android-action-label').value.trim();
        }

        androidActionStatus.className = 'operation-status running';
        androidActionStatus.textContent = 'Ejecutando accion sobre el dispositivo...';
        window.electronAPI.send('android-mobile-action', {
            serial: androidDeviceSelect.value,
            action
        });
    });

    btnAndroidObservedSession.addEventListener('click', () => {
        const recordMirror = androidSessionRecord.checked;
        const backup = androidSessionBackup.checked;
        if (!recordMirror && !backup) {
            androidObservedSessionStatus.className = 'operation-status error';
            androidObservedSessionStatus.textContent = 'Activa la grabacion o el respaldo antes de iniciar.';
            return;
        }

        observedSessionRunning = true;
        androidObservedSessionOutput.replaceChildren();
        androidObservedSessionStatus.className = 'operation-status running';
        androidObservedSessionStatus.textContent = 'Preparando la sesion observada...';
        logToObservedSession('[Sistema] Preparando sesion observada...');
        updateAndroidButtons(false);
        window.electronAPI.send('android-start-observed-session', {
            serial: androidDeviceSelect.value,
            testMode: document.getElementById('adb-test-mode').checked,
            includeThumbnails: document.getElementById('adb-include-thumbnails').checked,
            includeTrash: document.getElementById('adb-include-trash').checked,
            recordMirror,
            stayAwake: androidSessionStayAwake.checked,
            backup,
            captureScreenshots: androidSessionScreenshots.checked
        });
    });

    btnAndroidStopObservedSession.addEventListener('click', () => {
        androidObservedSessionStatus.className = 'operation-status running';
        androidObservedSessionStatus.textContent = 'Solicitando cancelacion...';
        window.electronAPI.send('android-stop-observed-session');
    });

    btnAndroidRefresh.addEventListener('click', () => {
        connectionReady = false;
        setConnectionStatus('idle', 'Consultando dispositivos; todavia no se ha validado una conexion para operar.');
        androidConnectionOutput?.replaceChildren();
        androidStatus.textContent = 'Consultando ADB...';
        window.electronAPI.send('android-list-devices');
    });

    btnAndroidConnect.addEventListener('click', () => {
        const method = adbMethodSelect.value;
        const serial = androidDeviceSelect.value;
        if (method === 'usb' && !serial) {
            setConnectionStatus('error', 'Consulta ADB y selecciona el dispositivo USB autorizado antes de continuar.');
            return;
        }
        connectionReady = false;
        androidConnectionOutput?.replaceChildren();
        setConnectionStatus('running', 'Validando transporte y autorizacion...');
        logToConnection(`[Sistema] Preparando conexion por ${method}.`);
        btnAndroidConnect.disabled = true;
        window.electronAPI.send('android-connect-device', {
            method,
            serial: serial || undefined,
            connectIpPort: method === 'wifi-paired' && serial.includes(':')
                ? serial
                : document.getElementById('adb-ip')?.value.trim(),
            pairIpPort: document.getElementById('adb-pair-ip')?.value.trim(),
            pinCode: document.getElementById('adb-pair-code')?.value.trim()
        });
    });

    androidDeviceSelect.addEventListener('change', () => {
        syncPairedWifiEndpoint();
        connectionReady = false;
        setConnectionStatus('idle', 'Selecciona Preparar conexion para validar este dispositivo.');
        updateAndroidButtons(false);
    });

    btnAndroidMirror.addEventListener('click', () => {
        window.electronAPI.send('android-start-mirror', {
            serial: androidDeviceSelect.value,
            recordMirror: androidMirrorRecord.checked,
            stayAwake: androidMirrorStayAwake.checked
        });
        androidStatus.textContent = 'Iniciando scrcpy...';
    });

    btnAndroidStop.addEventListener('click', () => {
        window.electronAPI.send('android-stop-mirror');
        androidStatus.textContent = 'Deteniendo mirroring...';
    });

    // WhatsApp Logic
    const waTerminalOutput = document.getElementById('wa-terminal-output');
    function logToWaTerminal(message) {
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        waTerminalOutput.appendChild(line);
        waTerminalOutput.scrollTop = waTerminalOutput.scrollHeight;
        if (waDiscoveryOutput) {
            const discoveryLine = document.createElement('div');
            discoveryLine.textContent = String(message ?? '')
                .replace(/[🚀✅⚠️❌🎯🎉💾🧾📄🔐⏳]/gu, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            waDiscoveryOutput.appendChild(discoveryLine);
            waDiscoveryOutput.scrollTop = waDiscoveryOutput.scrollHeight;
        }
        updateWhatsAppProgressFromLog(message);
    }

    const btnGetContacts = document.getElementById('btn-get-contacts');
    const btnStartWa = document.getElementById('btn-start-wa');
    const contactsContainer = document.getElementById('contacts-container');
    const contactsTable = document.getElementById('contacts-table');
    const btnWaOpenSession = document.getElementById('btn-wa-open-session');
    const btnWaCheckSession = document.getElementById('btn-wa-check-session');
    const btnWaCloseSession = document.getElementById('btn-wa-close-session');
    const waSessionBadge = document.getElementById('wa-session-badge');
    const waSessionStatus = document.getElementById('wa-session-status');
    const waSessionProfile = document.getElementById('wa-session-profile');
    const waProgressPanel = document.getElementById('wa-progress-panel');
    const waProgressTitle = document.getElementById('wa-progress-title');
    const waProgressMessage = document.getElementById('wa-progress-message');
    const waProgressPhase = document.getElementById('wa-progress-phase');
    const waProgressBar = document.getElementById('wa-progress-bar');
    const waProgressCount = document.getElementById('wa-progress-count');
    const waProgressPercent = document.getElementById('wa-progress-percent');
    const waStatMessages = document.getElementById('wa-stat-messages');
    const waStatMedia = document.getElementById('wa-stat-media');
    const waStatCurrent = document.getElementById('wa-stat-current');
    const waLiveMessageList = document.getElementById('wa-live-message-list');
    const waFlowSteps = document.querySelectorAll('[data-wa-stage]');
    const waResultsPanel = document.getElementById('wa-results-panel');
    const waResultsMessage = document.getElementById('wa-results-message');
    const waSessionCard = document.querySelector('#whatsapp .wa-session-card');
    const waOperationCard = document.querySelector('#whatsapp .operation-card');
    const waResultChatList = document.getElementById('wa-result-chat-list');
    const waResultChatHeading = document.getElementById('wa-result-chat-heading');
    const waResultMessageList = document.getElementById('wa-result-message-list');
    const waContactStreamCard = document.getElementById('wa-contact-stream-card');
    const waContactStreamList = document.getElementById('wa-contact-stream-list');
    const waDiscoveryOutput = document.getElementById('wa-discovery-output');
    const waTechnicalLog = document.querySelector('#whatsapp .technical-log');
    const waExtractionAction = document.getElementById('wa-extraction-action');
    const waActionButtonSlot = document.getElementById('wa-action-button-slot');
    const waActionStatus = document.getElementById('wa-action-status');
    const waActionTitle = document.getElementById('wa-action-title');
    const btnWaGoExtraction = document.getElementById('btn-wa-go-extraction');
    const waOptionsCard = document.getElementById('wa-options-card');
    const waOptionsSlot = document.getElementById('wa-options-slot');
    const waRightExtractionAction = document.getElementById('wa-right-extraction-action');
    let waCatalogComplete = false;
    if (waActionButtonSlot && btnStartWa) waActionButtonSlot.appendChild(btnStartWa);
    if (btnStartWa) btnStartWa.textContent = 'Iniciar extracción';
    if (waOptionsSlot && waOptionsCard) waOptionsSlot.appendChild(waOptionsCard);
    if (waProgressPanel?.parentElement && waExtractionAction) {
        waProgressPanel.parentElement.insertBefore(waExtractionAction, waProgressPanel);
    }
    if (waContactStreamList) waContactStreamList.remove();
    if (waContactStreamCard) {
        const supportTitle = waContactStreamCard?.querySelector('h3');
        const supportDescription = waContactStreamCard?.querySelector('.card-heading p');
        const supportIndicator = waContactStreamCard?.querySelector('.wa-live-indicator');
        const supportEyebrow = waContactStreamCard?.querySelector('.card-heading .eyebrow');
        if (supportEyebrow) supportEyebrow.textContent = 'Terminal';
        if (supportTitle) supportTitle.textContent = 'Terminal de apoyo';
        if (supportDescription) supportDescription.textContent = 'Registro visual del escaneo y estado de la sesión.';
        if (supportIndicator) supportIndicator.textContent = 'SOPORTE';
    }
    if (waRightExtractionAction && btnWaGoExtraction) waRightExtractionAction.appendChild(btnWaGoExtraction);
    if (btnStartWa) btnStartWa.disabled = true;

    function updateSelectedContactsState() {
        if (!contactsTable) return;
        const checkboxes = Array.from(contactsTable.querySelectorAll('.contact-checkbox'));
        const selected = checkboxes.filter(checkbox => checkbox.checked).length;
        const selectAll = contactsTable.querySelector('#wa-select-all');
        if (selectAll) {
            selectAll.checked = checkboxes.length > 0 && selected === checkboxes.length;
            selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
        }
        if (btnWaGoExtraction) btnWaGoExtraction.disabled = selected === 0;
        if (btnStartWa) btnStartWa.disabled = selected === 0;
        if (waActionStatus) waActionStatus.textContent = selected > 0
            ? `${selected} conversación(es) listas para extraer.`
            : 'Selecciona al menos una conversación para continuar.';
    }

    contactsTable?.addEventListener('change', event => {
        const target = event.target;
        if (target?.id === 'wa-select-all') {
            contactsTable.querySelectorAll('.contact-checkbox').forEach(checkbox => {
                checkbox.checked = target.checked;
            });
        }
        if (target?.id === 'wa-select-all' || target?.classList.contains('contact-checkbox')) {
            updateSelectedContactsState();
        }
    });
    document.querySelector('#whatsapp .technical-log')?.removeAttribute('open');
    let whatsappSessionReady = false;
    let currentWaStage = 'connection';
    const visitedWaStages = new Set(['connection']);
    let whatsappExtractionComplete = false;
    let whatsappExtractionStarted = false;
    let whatsappExtractionState = { selected: 0, current: 0, messages: 0, media: 0 };
    const liveMessages = new Map();
    const liveContacts = new Map();
    const workspaceChats = new Map();
    const liveMessageQueue = [];
    const completedLiveChats = [];
    let liveSequence = 0;
    let liveChatName = '';
    let liveReceivingChat = '';
    let livePresentingChat = '';
    let liveQueueTimer = null;
    let liveFinishPending = false;

    function setWhatsAppStage(stage) {
        const stages = ['connection', 'conversations', 'extraction'];
        const activeIndex = Math.max(0, stages.indexOf(stage));
        currentWaStage = stages[activeIndex];
        const showingWorkspace = currentWaStage === 'extraction'
            && (whatsappExtractionStarted || whatsappExtractionComplete);
        const showingFinalResults = currentWaStage === 'extraction' && whatsappExtractionComplete;
        visitedWaStages.add(currentWaStage);
        waFlowSteps.forEach(step => {
            const index = stages.indexOf(step.dataset.waStage);
            step.classList.toggle('active', index === activeIndex);
            step.classList.toggle('complete', index !== activeIndex && visitedWaStages.has(step.dataset.waStage));
            step.setAttribute('aria-current', index === activeIndex ? 'step' : 'false');
        });
        if (waSessionCard) waSessionCard.classList.toggle('hidden', currentWaStage !== 'connection');
        if (waOperationCard) waOperationCard.classList.toggle('hidden', currentWaStage !== 'conversations');
        if (waContactStreamCard) waContactStreamCard.classList.toggle('hidden', currentWaStage !== 'conversations');
        if (waExtractionAction) waExtractionAction.classList.toggle('hidden', currentWaStage !== 'extraction' || showingFinalResults);
        if (waRightExtractionAction) waRightExtractionAction.classList.toggle('hidden', currentWaStage !== 'conversations' || !waCatalogComplete);
        if (btnWaGoExtraction) btnWaGoExtraction.classList.toggle('hidden', currentWaStage !== 'conversations');
        if (btnStartWa) btnStartWa.classList.toggle('hidden', currentWaStage !== 'extraction' || showingFinalResults);
        if (waOptionsCard) waOptionsCard.classList.toggle('hidden', currentWaStage !== 'extraction' || showingFinalResults);
        if (waActionTitle) waActionTitle.textContent = currentWaStage === 'extraction'
            ? 'Configurar y comenzar'
            : 'Seleccionar conversaciones';
        if (waProgressPanel) {
            waProgressPanel.classList.toggle('hidden', currentWaStage !== 'extraction');
            waProgressPanel.classList.toggle('compact', showingWorkspace);
        }
        if (waResultsPanel) waResultsPanel.classList.toggle('hidden', !showingWorkspace);
        if (waTechnicalLog) waTechnicalLog.classList.toggle('hidden', currentWaStage !== 'extraction');
        if (showingFinalResults && !liveFinishPending) {
            loadLatestWhatsAppResults();
            const eyebrow = waResultsPanel?.querySelector('.wa-results-eyebrow');
            const title = waResultsPanel?.querySelector('h3');
            if (eyebrow) eyebrow.textContent = 'RESULTADO';
            if (title) title.textContent = 'Respaldo completado';
            if (waResultsMessage) waResultsMessage.textContent = 'Los expedientes quedaron organizados por sesión. Revisa cada conversación en modo lectura.';
        } else if (showingWorkspace) {
            const eyebrow = waResultsPanel?.querySelector('.wa-results-eyebrow');
            const title = waResultsPanel?.querySelector('h3');
            if (eyebrow) eyebrow.textContent = 'EXTRACCIÓN EN CURSO';
            if (title) title.textContent = 'Construyendo expediente';
            if (waResultsMessage) waResultsMessage.textContent = 'Los mensajes aparecen aquí en orden mientras cada conversación se procesa.';
        }
    }

    waFlowSteps.forEach(step => {
        step.addEventListener('click', () => {
            // Las etapas son una navegación persistente. Se puede volver a
            // revisar cualquier vista sin repetir una extracción ya hecha.
            setWhatsAppStage(step.dataset.waStage);
        });
    });

    setWhatsAppStage('connection');
    document.getElementById('btn-wa-review-results')?.addEventListener('click', () => {
        const technicalLog = document.querySelector('#whatsapp .technical-log');
        if (!technicalLog) return;
        technicalLog.classList.remove('hidden');
        technicalLog.open = true;
        technicalLog.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function normalizeMessageAuthor(author) {
        return String(author || '').trim().toLocaleLowerCase();
    }

    function getMessageAuthor(message, knownOutgoingAuthors = null) {
        if (isOutgoingMessage(message, knownOutgoingAuthors)) return 'T\u00fa';
        if (message?.autor) return String(message.autor).trim();
        const metadata = String(message?.metadata || '');
        const match = metadata.match(/\]\s*(.*?):\s*$/);
        return match?.[1]?.trim() || 'Contacto';
    }

    function getMessageTime(message) {
        const metadata = String(message?.metadata || '');
        return metadata.match(/(?:\[|\b)(\d{1,2}:\d{2})(?:\]|\b)/)?.[1] || '';
    }

    function getMessageSortTime(message) {
        const metadata = String(message?.metadata || '');
        const match = metadata.match(/\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
        if (!match) return Number.POSITIVE_INFINITY;
        const [, hour, minute, day, month, year] = match;
        return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    }

    function sortMessagesChronologically(messages) {
        return messages
            .map((message, index) => ({ message, index }))
            .sort((a, b) => getMessageSortTime(a.message) - getMessageSortTime(b.message) || a.index - b.index)
            .map(item => item.message);
    }

    function isOutgoingMessage(message, knownOutgoingAuthors = null) {
        const direction = String(message?.direccion || '').toLocaleLowerCase();
        if (direction === 'saliente') return true;
        if (direction === 'entrante') return false;
        const author = String(message?.autor || '');
        const metadata = String(message?.metadata || '');
        return Boolean(knownOutgoingAuthors?.has(normalizeMessageAuthor(author)))
            || /^(?:tu|t\u00fa|you)$/i.test(author.trim())
            || /\]\s*(?:tu|t\u00fa|you)\s*:/i.test(metadata);
    }

    function renderLiveMessageBatchNow(batch) {
        const messageList = waResultMessageList || waLiveMessageList;
        if (!messageList || !batch || !Array.isArray(batch.messages)) return;
        const chat = String(batch.chat || '');
        if (chat && chat !== liveChatName) {
            liveChatName = chat;
            liveMessages.clear();
            liveSequence = 0;
            messageList.replaceChildren();
        }

        messageList.querySelector('.wa-live-empty, .wa-explorer-empty')?.remove();
        const knownOutgoingAuthors = new Set(
            Array.from(liveMessages.values())
                .filter(entry => entry.message?.direccion === 'saliente')
                .map(entry => normalizeMessageAuthor(entry.message?.autor))
                .filter(Boolean)
        );
        batch.messages.forEach(message => {
            if (message?.direccion === 'saliente' && message?.autor) {
                knownOutgoingAuthors.add(normalizeMessageAuthor(message.autor));
            }
        });
        const hadMessages = liveMessages.size > 0;
        batch.messages.forEach((message, index) => {
            const key = String(message.mensaje_id || message.id_unico || `${message.metadata || ''}:${message.texto || ''}:${index}`);
            const outgoing = isOutgoingMessage(message, knownOutgoingAuthors);
            const existing = liveMessages.get(key);
            const article = existing?.article || document.createElement('article');
            article.className = `wa-live-message ${outgoing ? 'outgoing' : 'incoming'}`;
            article.dataset.messageKey = key;
            const bubble = existing?.bubble || document.createElement('div');
            bubble.className = 'wa-live-bubble';
            bubble.replaceChildren();

            const header = document.createElement('div');
            header.className = 'wa-live-meta';
            const author = document.createElement('b');
            author.textContent = getMessageAuthor(message, knownOutgoingAuthors);
            const time = document.createElement('span');
            time.textContent = getMessageTime(message) || 'procesando';
            header.append(author, time);
            bubble.appendChild(header);

            if (message.respuesta) {
                const reply = document.createElement('div');
                reply.className = 'wa-live-reply';
                reply.textContent = `↳ ${message.respuesta.autor || 'Mensaje citado'}: ${message.respuesta.contenido || `[${message.respuesta.tipo_contenido || 'multimedia'}]`}`;
                bubble.appendChild(reply);
            }

            const text = document.createElement('p');
            text.className = 'wa-live-text';
            text.textContent = message.texto || '[Multimedia]';
            bubble.appendChild(text);

            const state = message.estado_visual || {};
            if (state.eliminado || state.editado || state.sticker) {
                const flags = document.createElement('div');
                flags.className = 'wa-live-flags';
                [['eliminado', 'Eliminado'], ['editado', 'Editado'], ['sticker', 'Sticker']].forEach(([keyName, label]) => {
                    if (!state[keyName]) return;
                    const flag = document.createElement('span');
                    flag.textContent = label;
                    flags.appendChild(flag);
                });
                bubble.appendChild(flags);
            }

            if (Array.isArray(message.adjuntos) && message.adjuntos.length > 0) {
                const attachments = document.createElement('div');
                attachments.className = 'wa-live-attachments';
                message.adjuntos.forEach(attachment => {
                    const type = String(attachment.tipo || 'archivo').toLowerCase();
                    if (attachment.url && (type === 'imagen' || type === 'sticker')) {
                        const image = document.createElement('img');
                        image.className = 'wa-live-image';
                        image.src = attachment.url;
                        image.alt = attachment.archivo || type;
                        image.loading = 'lazy';
                        attachments.appendChild(image);
                        return;
                    }
                    if (attachment.url && type === 'video') {
                        const video = document.createElement('video');
                        video.className = 'wa-live-video';
                        video.src = attachment.url;
                        video.controls = true;
                        video.preload = 'metadata';
                        attachments.appendChild(video);
                        return;
                    }
                    if (attachment.url && type === 'audio') {
                        const audio = document.createElement('audio');
                        audio.className = 'wa-live-audio';
                        audio.src = attachment.url;
                        audio.controls = true;
                        audio.preload = 'metadata';
                        attachments.appendChild(audio);
                        return;
                    }
                    const media = document.createElement('small');
                    media.className = 'wa-live-media';
                    media.textContent = `${attachment.tipo || 'archivo'} asociado`;
                    attachments.appendChild(media);
                });
                bubble.appendChild(attachments);
            }

            if (!existing) {
                article.appendChild(bubble);
                liveMessages.set(key, { article, bubble, message, sequence: liveSequence++ });
                requestAnimationFrame(() => article.classList.add('is-new'));
                window.setTimeout(() => article.classList.remove('is-new'), 700);
            } else {
                existing.message = message;
                existing.bubble = bubble;
            }
        });

        const orderedEntries = Array.from(liveMessages.entries())
            .sort(([, a], [, b]) => getMessageSortTime(a.message) - getMessageSortTime(b.message) || a.sequence - b.sequence);
        while (orderedEntries.length > 80) {
            const [oldestKey, oldest] = orderedEntries.shift();
            oldest.article.remove();
            liveMessages.delete(oldestKey);
        }
        orderedEntries.forEach(([, entry]) => messageList.appendChild(entry.article));

        if (batch.totalMessages) {
            setWhatsAppProgress({
                chat: chat || whatsappExtractionState.chat,
                messages: Math.max(Number(batch.totalMessages), Number(whatsappExtractionState.messages || 0)),
                message: `Encontrados ${batch.totalMessages} mensajes; mostrando actividad en vivo.`
            });
        }
        if (!hadMessages) messageList.scrollTop = messageList.scrollHeight;
    }

    function getLiveMessageKey(message, index = 0) {
        return String(message?.mensaje_id || message?.id_unico || `${message?.metadata || ''}:${message?.texto || ''}:${index}`);
    }

    function getWorkspaceChatKey(name) {
        return String(name || '').trim().toLocaleLowerCase();
    }

    function updateWorkspaceChatStatus(name, status, totalMessages = null) {
        const key = getWorkspaceChatKey(name);
        const entry = workspaceChats.get(key);
        if (!entry) return;
        entry.status = status;
        if (totalMessages !== null) entry.totalMessages = Number(totalMessages) || entry.totalMessages || 0;
        const button = waResultChatList?.querySelector(`[data-workspace-chat="${CSS.escape(key)}"]`);
        if (!button) return;
        button.classList.toggle('active', key === getWorkspaceChatKey(liveChatName));
        const statusNode = button.querySelector('small');
        if (statusNode) statusNode.textContent = entry.totalMessages > 0
            ? `${entry.totalMessages} mensajes · ${entry.status}`
            : entry.status;
    }

    function renderWorkspaceChatQueue(selectedContacts) {
        if (!waResultChatList) return;
        workspaceChats.clear();
        waResultChatList.replaceChildren();
        selectedContacts.forEach((conversation, index) => {
            const name = String(conversation?.name || conversation?.title || conversation || `Conversación ${index + 1}`).trim();
            const key = getWorkspaceChatKey(name);
            workspaceChats.set(key, {
                name,
                status: 'En espera',
                totalMessages: 0
            });
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'wa-result-chat wa-result-chat-live';
            button.dataset.workspaceChat = key;
            const title = document.createElement('strong');
            title.textContent = name;
            const status = document.createElement('small');
            status.textContent = 'En espera';
            button.append(title, status);
            waResultChatList.appendChild(button);
        });
    }

    function prepareLiveWorkspaceChat(chat) {
        const name = String(chat || '').trim();
        if (!name || name === liveChatName) {
            if (name) updateWorkspaceChatStatus(name, 'Procesando');
            return;
        }
        if (liveChatName) updateWorkspaceChatStatus(liveChatName, 'Completado');
        liveMessageQueue.length = 0;
        liveChatName = name;
        liveMessages.clear();
        liveSequence = 0;
        const messageList = waResultMessageList || waLiveMessageList;
        if (messageList) {
            messageList.replaceChildren();
            const empty = document.createElement('div');
            empty.className = 'wa-explorer-empty';
            empty.textContent = 'Preparando la conversación...';
            messageList.appendChild(empty);
        }
        const headingTitle = waResultChatHeading?.querySelector('h4');
        const headingSubtitle = waResultChatHeading?.querySelector('small');
        if (headingTitle) headingTitle.textContent = name;
        if (headingSubtitle) headingSubtitle.textContent = 'Procesando mensajes · lectura local';
        updateWorkspaceChatStatus(name, 'Procesando');
    }

    function drainLiveMessageQueue() {
        liveQueueTimer = null;
        const next = liveMessageQueue.shift();
        if (!next) {
            if (livePresentingChat) {
                updateWorkspaceChatStatus(livePresentingChat, 'Completado');
                livePresentingChat = '';
            }
            advanceLiveChatPresentation();
            return;
        }
        renderLiveMessageBatchNow(next);
        if (liveMessageQueue.length > 0) {
            liveQueueTimer = window.setTimeout(drainLiveMessageQueue, 260);
        }
    }

    function renderLiveMessageBatch(batch) {
        if (!batch || !Array.isArray(batch.messages)) return;
        const chat = String(batch.chat || '').trim();
        if (!chat) return;
        liveReceivingChat = chat;
        if (!liveChatName) prepareLiveWorkspaceChat(chat);
        updateWorkspaceChatStatus(chat, 'Procesando', batch.totalMessages);
        const block = {
            chat,
            messages: sortMessagesChronologically(batch.messages),
            totalMessages: batch.totalMessages
        };
        if (chat === liveChatName && (!livePresentingChat || livePresentingChat === chat)) {
            queueLiveMessageBatch(block);
        } else {
            completedLiveChats.push(block);
            advanceLiveChatPresentation();
        }
    }

    function queueLiveMessageBatch(batch) {
        if (!batch || !Array.isArray(batch.messages)) return;
        const chat = String(batch.chat || '').trim();
        if (!chat) return;
        if (chat !== liveChatName) prepareLiveWorkspaceChat(chat);
        const messages = sortMessagesChronologically(batch.messages);
        messages.forEach((message, index) => {
            const key = getLiveMessageKey(message, index);
            const queued = liveMessageQueue.find(item => getLiveMessageKey(item.messages?.[0]) === key);
            if (queued) queued.messages[0] = message;
            else liveMessageQueue.push({ ...batch, messages: [message] });
        });
        if (!liveQueueTimer) liveQueueTimer = window.setTimeout(drainLiveMessageQueue, 100);
    }

    function startLiveChatPresentation(chatData) {
        if (!chatData) return;
        const chat = String(chatData.chat || '').trim();
        const messages = sortMessagesChronologically(Array.isArray(chatData.messages) ? chatData.messages : []);
        if (!chat) return;
        if (chat !== liveChatName) prepareLiveWorkspaceChat(chat);
        livePresentingChat = chat;
        updateWorkspaceChatStatus(chat, 'Mostrando', messages.length);
        if (messages.length === 0) {
            updateWorkspaceChatStatus(chat, 'Completado');
            livePresentingChat = '';
            const followingChat = completedLiveChats.shift();
            if (followingChat) startLiveChatPresentation(followingChat);
            else maybeFinalizeLiveWorkspace();
            return;
        }
        queueLiveMessageBatch({
            chat,
            messages,
            totalMessages: messages.length
        });
    }

    function advanceLiveChatPresentation() {
        if (liveQueueTimer || liveMessageQueue.length > 0) return;
        const followingBlock = completedLiveChats.shift();
        if (followingBlock) startLiveChatPresentation(followingBlock);
        else maybeFinalizeLiveWorkspace();
    }

    function completeLiveChat(batch) {
        const chat = String(batch?.chat || '').trim();
        if (!chat) return;
        updateWorkspaceChatStatus(chat, 'Completado', Number(batch.totalMessages) || null);
        advanceLiveChatPresentation();
    }

    function maybeFinalizeLiveWorkspace() {
        if (!liveFinishPending || liveQueueTimer || liveMessageQueue.length > 0 || completedLiveChats.length > 0) return;
        liveFinishPending = false;
        loadLatestWhatsAppResults();
    }

    function renderEvidenceMessages(chat) {
        if (!waResultMessageList) return;
        waResultMessageList.replaceChildren();
        const messages = Array.isArray(chat?.messages) ? chat.messages : [];
        // El extractor descubre primero lo visible y después carga mensajes
        // anteriores; el expediente usa la fecha como orden canónico.
        const visibleMessages = sortMessagesChronologically(messages).slice(0, 600);
        const knownOutgoingAuthors = new Set(
            messages
                .filter(message => message?.direccion === 'saliente' && message?.autor)
                .map(message => normalizeMessageAuthor(message.autor))
                .filter(Boolean)
        );
        if (visibleMessages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wa-explorer-empty';
            empty.textContent = 'Esta conversación no contiene mensajes legibles.';
            waResultMessageList.appendChild(empty);
            return;
        }

        visibleMessages.forEach(message => {
            const article = document.createElement('article');
            article.className = 'wa-evidence-message';
            const isOutgoing = isOutgoingMessage(message, knownOutgoingAuthors);
            article.classList.add(isOutgoing ? 'outgoing' : 'incoming');

            const header = document.createElement('div');
            header.className = 'wa-evidence-meta';
            const author = document.createElement('b');
            author.className = 'wa-evidence-author';
            author.textContent = getMessageAuthor(message, knownOutgoingAuthors);
            header.appendChild(author);
            const metadata = document.createElement('span');
            metadata.textContent = String(message.metadata || 'Sin metadata visible')
                .replace(/wds-ic-read/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            header.appendChild(metadata);
            if (isOutgoing) article.classList.add('outgoing');

            const state = message.estado_visual || {};
            [['eliminado', 'Eliminado'], ['editado', 'Editado'], ['sticker', 'Sticker']].forEach(([key, label]) => {
                if (!state[key]) return;
                const badge = document.createElement('b');
                badge.className = `evidence-badge ${key}`;
                badge.textContent = label;
                header.appendChild(badge);
            });
            article.appendChild(header);

            const text = document.createElement('p');
            text.className = 'wa-evidence-text';
            const attachmentTypes = Array.isArray(message.adjuntos)
                ? message.adjuntos.map(attachment => String(attachment.tipo || '').toLowerCase())
                : [];
            let displayText = message.texto || '[Multimedia]';
            if (displayText === '[Multimedia/Sticker]' && attachmentTypes.includes('audio')) displayText = '[Nota de voz]';
            if (displayText === '[Multimedia/Sticker]' && attachmentTypes.includes('imagen')) displayText = '[Imagen]';
            if (displayText === '[Multimedia/Sticker]' && attachmentTypes.includes('video')) displayText = '[Video]';
            text.textContent = displayText;
            article.appendChild(text);

            if (message.respuesta) {
                const reply = document.createElement('div');
                reply.className = 'wa-evidence-reply';
                reply.textContent = `Respuesta a ${message.respuesta.autor || 'mensaje citado'}: ${message.respuesta.contenido || `[${message.respuesta.tipo_contenido || 'multimedia'}]`}`;
                article.appendChild(reply);
            }

            if (Array.isArray(message.adjuntos) && message.adjuntos.length > 0) {
                const attachments = document.createElement('div');
                attachments.className = 'wa-evidence-attachments';
                message.adjuntos.forEach(attachment => {
                    const type = String(attachment.tipo || 'archivo').toLowerCase();
                    if (attachment.url && (type === 'imagen' || type === 'sticker')) {
                        const image = document.createElement('img');
                        image.className = 'wa-evidence-image';
                        image.src = attachment.url;
                        image.alt = attachment.archivo || 'Imagen extraída';
                        image.loading = 'lazy';
                        attachments.appendChild(image);
                        return;
                    }
                    if (attachment.url && type === 'video') {
                        const video = document.createElement('video');
                        video.className = 'wa-evidence-video';
                        video.src = attachment.url;
                        video.controls = true;
                        video.preload = 'metadata';
                        attachments.appendChild(video);
                        return;
                    }
                    if (attachment.url && type === 'audio') {
                        const audio = document.createElement('audio');
                        audio.className = 'wa-evidence-audio';
                        audio.src = attachment.url;
                        audio.controls = true;
                        audio.preload = 'metadata';
                        attachments.appendChild(audio);
                        return;
                    }
                    const chip = document.createElement('span');
                    chip.textContent = `${attachment.tipo || 'archivo'} · ${attachment.archivo || 'adjunto'}`;
                    attachments.appendChild(chip);
                });
                article.appendChild(attachments);
            }
            waResultMessageList.appendChild(article);
        });

        if (messages.length > visibleMessages.length) {
            const note = document.createElement('div');
            note.className = 'wa-explorer-note';
            note.textContent = `Mostrando ${visibleMessages.length} de ${messages.length} mensajes. El JSON conserva el historial completo.`;
            waResultMessageList.appendChild(note);
        }
    }

    function renderLatestResults(result) {
        if (!waResultChatList) return;
        waResultChatList.replaceChildren();
        if (!result?.ok || !Array.isArray(result.chats) || result.chats.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wa-explorer-empty';
            empty.textContent = result?.error || 'No se encontraron expedientes locales.';
            waResultChatList.appendChild(empty);
            return;
        }

        const selectChat = (chat, button) => {
            waResultChatList.querySelectorAll('.wa-result-chat').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            const title = waResultChatHeading?.querySelector('h4');
            const subtitle = waResultChatHeading?.querySelector('small');
            if (title) title.textContent = chat.name;
            if (subtitle) subtitle.textContent = `${chat.totalMessages} mensajes · lectura local · sin edición`;
            renderEvidenceMessages(chat);
        };

        result.chats.forEach((chat, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'wa-result-chat';
            const name = document.createElement('strong');
            name.textContent = chat.name;
            const count = document.createElement('small');
            count.textContent = `${chat.totalMessages} mensajes`;
            button.append(name, count);
            button.addEventListener('click', () => selectChat(chat, button));
            waResultChatList.appendChild(button);
            if (index === 0) selectChat(chat, button);
        });
    }

    function loadLatestWhatsAppResults() {
        window.electronAPI.send('whatsapp-load-latest-results');
    }

    function renderConversationBatch(batch) {
        if (!waContactStreamList || !batch || !Array.isArray(batch.conversations)) return;
        waContactStreamList.querySelector('.wa-live-empty')?.remove();
        batch.conversations.forEach(conversation => {
            const key = String(conversation.id || (conversation.source + ':' + conversation.name)).toLowerCase();
            if (liveContacts.has(key)) return;
            const row = document.createElement('div');
            row.className = 'wa-contact-stream-row is-new';
            const name = document.createElement('strong');
            name.textContent = conversation.name || 'Conversación sin nombre';
            const detail = document.createElement('small');
            detail.textContent = conversation.kind === 'group' ? 'Grupo' : conversation.source === 'archived' ? 'Archivado' : 'Reciente';
            row.append(name, detail);
            waContactStreamList.appendChild(row);
            liveContacts.set(key, row);
            window.setTimeout(() => row.classList.remove('is-new'), 700);
        });
        waContactStreamList.scrollTop = waContactStreamList.scrollHeight;
    }

    function ensureContactSelectAllRow() {
        if (!contactsTable || contactsTable.querySelector('#wa-select-all')) return;
        const body = contactsTable.tBodies[0] || contactsTable.createTBody();
        const row = document.createElement('tr');
        row.className = 'contact-select-all-row';
        const checkCell = document.createElement('td');
        checkCell.className = 'contact-check-cell';
        const selectAll = document.createElement('input');
        selectAll.type = 'checkbox';
        selectAll.id = 'wa-select-all';
        checkCell.appendChild(selectAll);
        const labelCell = document.createElement('td');
        labelCell.className = 'contact-label-cell';
        const label = document.createElement('label');
        label.htmlFor = 'wa-select-all';
        label.className = 'contact-label contact-select-all-label';
        const name = document.createElement('strong');
        name.textContent = 'Seleccionar todos los chats';
        label.appendChild(name);
        labelCell.appendChild(label);
        row.append(checkCell, labelCell);
        body.appendChild(row);
    }

    function appendConversationRows(conversations) {
        if (!contactsTable || !Array.isArray(conversations)) return;
        ensureContactSelectAllRow();
        const body = contactsTable.tBodies[0] || contactsTable;
        conversations.forEach(contact => {
            const conversation = typeof contact === 'string'
                ? { name: contact, source: 'legacy', kind: 'conversation' }
                : contact;
            const key = String(conversation.id || `${conversation.source || 'recent'}:${conversation.name || conversation.title || ''}`).toLowerCase();
            if (liveContacts.has(key)) return;
            const displayName = conversation.name || conversation.title || 'Conversación sin nombre';
            const row = document.createElement('tr');
            row.className = 'contact-row is-new';
            row.dataset.contactKey = key;
            const checkboxCell = document.createElement('td');
            checkboxCell.className = 'contact-check-cell';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'contact-checkbox';
            checkbox.value = JSON.stringify(conversation);
            checkbox.id = `contact-${liveContacts.size}`;
            checkboxCell.appendChild(checkbox);
            const labelCell = document.createElement('td');
            labelCell.className = 'contact-label-cell';
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.className = 'contact-label';
            const name = document.createElement('strong');
            name.textContent = displayName;
            const badge = document.createElement('span');
            badge.className = `contact-badge ${conversation.kind === 'group' ? 'group' : conversation.source === 'archived' ? 'archived' : 'recent'}`;
            badge.textContent = conversation.kind === 'group' ? 'Grupo' : conversation.source === 'archived' ? 'Archivado' : 'Reciente';
            label.append(name, badge);
            labelCell.appendChild(label);
            row.append(checkboxCell, labelCell);
            body.appendChild(row);
            liveContacts.set(key, { row, conversation });
            window.setTimeout(() => row.classList.remove('is-new'), 700);
        });
        contactsContainer?.classList.remove('hidden');
        updateSelectedContactsState();
    }

    function renderConversationBatch(batch) {
        if (!batch || !Array.isArray(batch.conversations)) return;
        appendConversationRows(batch.conversations);
    }

    function setWhatsAppProgress(values = {}) {
        whatsappExtractionState = { ...whatsappExtractionState, ...values };
        const { selected, current, messages, media, chat, title, message, phase } = whatsappExtractionState;
        const percent = selected > 0 ? Math.min(100, Math.round((current / selected) * 100)) : 0;
        if (waProgressTitle && title) waProgressTitle.textContent = title;
        if (waProgressMessage && message) waProgressMessage.textContent = message;
        if (waProgressPhase && phase) {
            waProgressPhase.textContent = phase;
            waProgressPhase.className = `state-badge ${phase === 'COMPLETADO' ? 'success' : phase === 'ERROR' ? 'warning' : 'neutral'}`;
        }
        if (waProgressBar) waProgressBar.style.width = `${percent}%`;
        if (waProgressCount) waProgressCount.textContent = `Conversación ${Math.min(current, selected)} de ${selected}`;
        if (waProgressPercent) waProgressPercent.textContent = `${percent}%`;
        if (waStatMessages) waStatMessages.textContent = String(messages);
        if (waStatMedia) waStatMedia.textContent = String(media);
        if (waStatCurrent) waStatCurrent.textContent = chat || '—';
    }

    function updateWhatsAppProgressFromLog(message) {
        const line = String(message ?? '');
        const chatMatch = line.match(/AUDITANDO\s*\[(\d+)\/(\d+)\]:\s*(.+)/i);
        const messagesMatch = line.match(/Total msgs:\s*(\d+)/i);
        const videoMatch = line.match(/(\d+) segmento\(s\) de video/i);
        if (chatMatch) {
            updateWorkspaceChatStatus(chatMatch[3].trim(), 'Procesando');
            setWhatsAppProgress({
                current: Number(chatMatch[1]),
                selected: Number(chatMatch[2]),
                chat: chatMatch[3].trim(),
                title: `Respaldando ${chatMatch[3].trim()}`,
                message: 'Recorriendo mensajes y multimedia visibles.',
                phase: 'EN CURSO'
            });
        } else if (messagesMatch) {
            setWhatsAppProgress({ messages: Number(messagesMatch[1]), message: 'Mensajes encontrados; revisando contenido visible.' });
        } else if (videoMatch) {
            setWhatsAppProgress({ media: Number(videoMatch[1]), message: 'Multimedia asociada y lista para el expediente.' });
        } else if (/PROCESO COMPLETADO|finalizada correctamente/i.test(line)) {
            setWhatsAppProgress({
                current: whatsappExtractionState.selected,
                title: 'Respaldo completado',
                message: 'Los expedientes quedaron organizados por sesión.',
                phase: 'COMPLETADO'
            });
            whatsappExtractionComplete = true;
            liveFinishPending = true;
            workspaceChats.forEach((entry, key) => {
                entry.status = 'Completado';
                const button = waResultChatList?.querySelector(`[data-workspace-chat="${CSS.escape(key)}"]`);
                const statusNode = button?.querySelector('small');
                if (statusNode) statusNode.textContent = entry.totalMessages > 0
                    ? `${entry.totalMessages} mensajes · Completado`
                    : 'Completado';
            });
            setWhatsAppStage('extraction');
            maybeFinalizeLiveWorkspace();
            if (waResultsMessage) {
                waResultsMessage.textContent = `${whatsappExtractionState.selected} conversación(es) procesada(s). Revisa los expedientes generados.`;
            }
        } else if (/\[Error\]|ERROR|fatal/i.test(line)) {
            setWhatsAppProgress({ title: 'La extracción necesita atención', message: line.replace(/^\[Error\]\s*/i, ''), phase: 'ERROR' });
        }
    }

    function setWhatsAppSessionState(status, message) {
        whatsappSessionReady = status === 'ready';
        if (status === 'ready') setWhatsAppStage('conversations');
        if (status === 'closed' || status === 'error') setWhatsAppStage('connection');
        if (waSessionStatus) {
            const visualState = status === 'ready' ? 'success'
                : ['opening', 'open'].includes(status) ? 'running'
                    : status === 'error' ? 'error' : 'idle';
            waSessionStatus.className = `operation-status ${visualState}`;
            waSessionStatus.textContent = message || 'Sin informacion de la sesion.';
        }
        if (waSessionBadge) {
            const badgeState = status === 'ready' ? 'success'
                : status === 'error' ? 'warning' : 'neutral';
            waSessionBadge.className = `state-badge ${badgeState}`;
            waSessionBadge.textContent = status === 'ready' ? 'CONECTADA'
                : status === 'open' || status === 'opening' ? 'ABIERTA'
                    : status === 'closed' ? 'CERRADA' : 'SIN SESION';
        }
        if (btnWaOpenSession) btnWaOpenSession.disabled = status === 'opening';
        if (btnWaCheckSession) btnWaCheckSession.disabled = !['open', 'ready'].includes(status);
        if (btnWaCloseSession) btnWaCloseSession.disabled = !['open', 'ready', 'opening'].includes(status);
        if (btnGetContacts) btnGetContacts.disabled = !whatsappSessionReady;
        if (!whatsappSessionReady && btnStartWa) btnStartWa.disabled = true;
    }

    setWhatsAppSessionState('closed', 'Abre el navegador para iniciar la sesion.');

    btnWaOpenSession?.addEventListener('click', () => {
        setWhatsAppSessionState('opening', 'Abriendo navegador y perfil persistente...');
        logToWaTerminal('[Sistema] Abriendo WhatsApp Web para preparar la sesion...');
        window.electronAPI.send('whatsapp-open-session');
    });

    btnWaCheckSession?.addEventListener('click', () => {
        setWhatsAppSessionState('opening', 'Comprobando si la lista de chats ya esta disponible...');
        window.electronAPI.send('whatsapp-check-session');
    });

    btnWaCloseSession?.addEventListener('click', () => {
        setWhatsAppSessionState('opening', 'Cerrando navegador...');
        window.electronAPI.send('whatsapp-close-session');
    });

    if (btnGetContacts) {
        btnGetContacts.addEventListener('click', () => {
            if (!whatsappSessionReady) {
                logToWaTerminal('[Error] Confirma primero la sesion de WhatsApp Web.');
                return;
            }
            waTerminalOutput.replaceChildren();
            logToWaTerminal('>> Solicitando lista de chats recientes...');
            btnGetContacts.disabled = true;
            btnGetContacts.classList.add('is-loading');
            btnGetContacts.setAttribute('aria-busy', 'true');
            btnGetContacts.textContent = "ESCANEANDO...";
            liveContacts.clear();
            workspaceChats.clear();
            whatsappExtractionStarted = false;
            whatsappExtractionComplete = false;
            waCatalogComplete = false;
            contactsTable?.replaceChildren();
            if (waRightExtractionAction) waRightExtractionAction.classList.add('hidden');
            if (waContactStreamList) {
                waContactStreamList.replaceChildren();
                const empty = document.createElement('div');
                empty.className = 'wa-live-empty';
                empty.textContent = 'Esperando la lista visible...';
                waContactStreamList.appendChild(empty);
            }
            window.electronAPI.send('get-wa-contacts');
        });
    }

    btnWaGoExtraction?.addEventListener('click', () => {
        const selectedCount = document.querySelectorAll('.contact-checkbox:checked').length;
        if (selectedCount === 0) {
            logToWaTerminal('[WARN] Selecciona al menos una conversación antes de continuar.');
            return;
        }
        whatsappExtractionComplete = false;
        whatsappExtractionStarted = false;
        setWhatsAppStage('extraction');
        setWhatsAppProgress({
            title: 'Configura la extracción',
            message: `${selectedCount} conversación(es) seleccionada(s). Revisa el alcance y comienza cuando estés listo.`,
            phase: 'LISTA'
        });
    });

    if (btnStartWa) {
        btnStartWa.addEventListener('click', () => {
            if (!whatsappSessionReady) {
                logToWaTerminal('[Error] Confirma primero la sesion de WhatsApp Web.');
                return;
            }
            const testMode = document.getElementById('wa-test-mode').checked;
            const contentOptions = {
                includeText: document.getElementById('wa-include-text')?.checked !== false,
                includeImages: document.getElementById('wa-include-images')?.checked !== false,
                includeVideos: document.getElementById('wa-include-videos')?.checked !== false,
                includeAudio: document.getElementById('wa-include-audio')?.checked !== false,
                includeStickers: document.getElementById('wa-include-stickers')?.checked !== false
            };
            const recordVisual = document.getElementById('wa-record-visual')?.checked !== false;
            if (!Object.values(contentOptions).some(Boolean)) {
                logToWaTerminal('[WARN] Selecciona al menos un tipo de contenido para continuar.');
                return;
            }
            
            // Recopilar contactos seleccionados
            const checkboxes = document.querySelectorAll('.contact-checkbox:checked');
            const selectedContacts = Array.from(checkboxes).map(cb => {
                try {
                    return JSON.parse(cb.value);
                } catch (_) {
                    return cb.value;
                }
            });

            if (selectedContacts.length === 0) {
                logToWaTerminal('⚠️ Selecciona al menos un chat para extraer.');
                return;
            }

            waTerminalOutput.replaceChildren();
            whatsappExtractionComplete = false;
            whatsappExtractionStarted = true;
            logToWaTerminal(`>> Iniciando extracción de ${selectedContacts.length} chats...`);
            btnStartWa.disabled = true;
            liveMessages.clear();
            liveMessageQueue.length = 0;
            completedLiveChats.length = 0;
            if (liveQueueTimer) window.clearTimeout(liveQueueTimer);
            liveQueueTimer = null;
            liveSequence = 0;
            liveChatName = '';
            liveReceivingChat = '';
            livePresentingChat = '';
            liveFinishPending = false;
            renderWorkspaceChatQueue(selectedContacts);
            if (waLiveMessageList || waResultMessageList) {
                const messageList = waResultMessageList || waLiveMessageList;
                messageList.replaceChildren();
                const empty = document.createElement('div');
                empty.className = 'wa-explorer-empty';
                empty.textContent = 'Esperando los primeros mensajes...';
                messageList.appendChild(empty);
            }
            whatsappExtractionState = { selected: selectedContacts.length, current: 0, messages: 0, media: 0, chat: '' };
            setWhatsAppProgress({
                title: 'Preparando respaldo',
                message: 'La sesión está lista. Iniciando recorrido visual.',
                phase: 'PREPARANDO'
            });
            setWhatsAppStage('extraction');
            
            window.electronAPI.send('start-whatsapp', { 
                testMode,
                contactos: selectedContacts,
                contentOptions,
                recordVisual
            });
        });
    }

    // Listen from Main Process
    window.electronAPI.on('terminal-log', (message) => {
        logToTerminal(message);
        logToAdbExtraction(message);
    });

    window.electronAPI.on('adb-extraction-state', (state) => {
        const status = state?.status || 'idle';
        const message = state?.message || 'Sin información de la operación.';
        setAdbExtractionStatus(status, message);
        if (status === 'success') logToAdbExtraction(`[OK] ${message}`);
        if (status === 'error') logToAdbExtraction(`[ERROR] ${message}`);
        if (status !== 'running') {
            btnStartAdb.disabled = false;
            syncBackupModeLabel();
            updateAndroidButtons(false);
        }
    });

    window.electronAPI.on('android-terminal-log', (message) => {
        logToTerminal(message);
        const text = String(message ?? '');
        if (text.startsWith('[Error]')) androidStatus.textContent = text;
    });

    window.electronAPI.on('android-devices-result', (devices) => {
        if (!Array.isArray(devices)) {
            availableAndroidDevices = [];
            androidDeviceSelect.replaceChildren();
            const error = devices?.error || 'ADB no devolvió una lista de dispositivos.';
            androidDeviceSelect.appendChild(new Option('Error al consultar ADB', ''));
            androidStatus.textContent = error;
            connectionReady = false;
            setConnectionStatus('error', error);
            if (deviceBannerTitle) deviceBannerTitle.textContent = 'No se pudo consultar el dispositivo';
            return;
        }
        availableAndroidDevices = devices;
        const visibleDevices = renderAndroidDevices();
        if (visibleDevices.length === 0) {
            const transportLabel = adbMethodSelect.value === 'usb' ? 'USB' : 'Wi-Fi';
            androidDeviceSelect.replaceChildren(new Option(`No hay dispositivos ${transportLabel} detectados`, ''));
            androidStatus.textContent = `No hay dispositivos ${transportLabel} detectados.`;
            connectionReady = false;
            setConnectionStatus('idle', `No hay dispositivos ${transportLabel}. Revisa el transporte seleccionado.`);
            if (deviceBannerTitle) deviceBannerTitle.textContent = 'No hay dispositivos autorizados';
            updateAndroidButtons(false);
            return;
        }

        androidStatus.textContent = `${visibleDevices.length} dispositivo(s) ${adbMethodSelect.value === 'usb' ? 'USB' : 'Wi-Fi'} disponible(s).`;
        if (!connectionReady) setConnectionStatus('idle', 'Dispositivo detectado. Pulsa Preparar conexion para habilitar operaciones.');
        if (deviceBannerTitle) {
            const selected = visibleDevices[0];
            const model = selected.details?.match(/model:([^\s]+)/)?.[1] || selected.serial;
            deviceBannerTitle.textContent = `${model} · ${selected.state}`;
        }
        updateAndroidButtons(false);
    });

    window.electronAPI.on('android-connection-log', (message) => {
        logToConnection(message);
        logToTerminal(message);
    });

    window.electronAPI.on('android-connection-result', (result) => {
        const status = result?.status || 'error';
        if (status === 'running') {
            setConnectionStatus('running', result.message || 'Validando conexion...');
            return;
        }
        if (status === 'success') {
            connectionReady = true;
            if (result.result?.serial) androidDeviceSelect.value = result.result.serial;
            androidStatus.textContent = `Conexion ADB lista: ${result.result?.serial || 'dispositivo autorizado'}.`;
            if (deviceBannerTitle) deviceBannerTitle.textContent = `${result.result?.serial || 'Android'} · conectado`;
            setConnectionStatus('success', result.message || 'Conexion ADB lista para respaldos y observacion.');
            logToConnection(`[OK] ${result.message || 'Conexion ADB lista.'}`);
        } else {
            connectionReady = false;
            setConnectionStatus('error', result?.message || 'No se pudo preparar la conexion.');
            logToConnection(`[ERROR] ${result?.message || 'No se pudo preparar la conexion.'}`);
        }
        btnAndroidConnect.disabled = false;
        updateAndroidButtons(false);
    });

    window.electronAPI.on('android-learning-catalog-result', (commands) => {
        adbLearningCommand.replaceChildren();
        commands.forEach((command) => {
            const option = new Option(command.label, command.id);
            option.dataset.description = command.description;
            adbLearningCommand.appendChild(option);
        });
        const first = adbLearningCommand.options[0];
        adbLearningDescription.textContent = first?.dataset.description || '';
        updateAndroidButtons(false);
    });

    window.electronAPI.on('android-learning-result', (result) => {
        if (result.error) {
            adbLearningOutput.textContent = `[Error] ${result.error}`;
            return;
        }
        adbLearningOutput.textContent = `[DISPOSITIVO REAL]\n$ ${result.command}\n\n${result.stdout || result.stderr || '(sin salida)'}`;
    });

    window.electronAPI.on('android-evidence-result', (result) => {
        if (result.error) {
            androidEvidenceOutput.textContent = `[Error]\n${result.error}`;
            return;
        }
        androidEvidenceOutput.textContent = `[DISPOSITIVO REAL]\n${result.title}\n${result.message}\n\n${(result.commands || []).join('\n')}`;
    });

    window.electronAPI.on('android-media-inventory-result', (result) => {
        if (result.status === 'running') {
            androidMediaInventoryStatus.className = 'operation-status running';
            androidMediaInventoryStatus.textContent = result.message;
            return;
        }
        if (result.status === 'success') {
            androidMediaInventoryStatus.className = 'operation-status success';
            androidMediaInventoryStatus.textContent = result.message;
            androidMediaInventoryOutput.textContent = `[DISPOSITIVO REAL]\n$ ${result.inventory?.command || 'find /sdcard -type f'}\n\n${result.output || '(sin carpetas multimedia)'}`;
        } else {
            androidMediaInventoryStatus.className = 'operation-status error';
            androidMediaInventoryStatus.textContent = result.message || 'No se pudo consultar el inventario multimedia.';
            androidMediaInventoryOutput.textContent = `[ERROR]\n${result.message || 'Error desconocido.'}`;
        }
        updateAndroidButtons(false);
    });

    window.electronAPI.on('android-gallery-rpa-log', (message) => {
        logToGalleryRpa(message);
        logToTerminal(message);
    });

    window.electronAPI.on('android-gallery-rpa-result', (result) => {
        if (result?.status === 'running') {
            androidGalleryRpaStatus.className = 'operation-status running';
            androidGalleryRpaStatus.textContent = result.message || 'Preparando RPA de Galeria...';
            return;
        }

        galleryRpaRunning = false;
        if (result?.status === 'success') {
            androidGalleryRpaStatus.className = 'operation-status success';
            androidGalleryRpaStatus.textContent = result.message || 'Checkpoint RPA completado.';
            logToGalleryRpa(`[OK] ${result.message || 'Checkpoint RPA completado.'}`);
            if (result.result?.sessionDirectory) logToGalleryRpa(`Carpeta: ${result.result.sessionDirectory}`);
            if (result.result?.manifestPath) logToGalleryRpa(`Manifiesto: ${result.result.manifestPath}`);
        } else {
            const message = result?.message || 'No se pudo ejecutar el RPA de Galeria.';
            androidGalleryRpaStatus.className = 'operation-status error';
            androidGalleryRpaStatus.textContent = message;
            logToGalleryRpa(`[ERROR] ${message}`);
        }
        updateAndroidButtons(false);
    });

    window.electronAPI.on('android-mirror-state', (state) => {
        updateAndroidButtons(Boolean(state && state.running));
        if (state && state.running) androidStatus.textContent = 'Mirroring activo.';
    });

    window.electronAPI.on('android-mobile-action-log', (message) => {
        const line = String(message ?? '');
        androidActionOutput.textContent += `\n${line}`;
        androidActionOutput.scrollTop = androidActionOutput.scrollHeight;
        logToTerminal(line);
    });

    window.electronAPI.on('android-mobile-action-result', (result) => {
        if (result.error) {
            androidActionStatus.className = 'operation-status error';
            androidActionStatus.textContent = result.error;
            androidActionOutput.textContent = `[ERROR]\n${result.error}`;
            return;
        }
        androidActionStatus.className = 'operation-status success';
        androidActionStatus.textContent = 'Accion ejecutada correctamente.';
        androidActionOutput.textContent = `[OK] ${result.command}\nDuracion: ${result.durationMs} ms`;
        if (result.outputPath) androidActionOutput.textContent += `\nArchivo: ${result.outputPath}\nSHA-256: ${result.sha256}`;
    });

    function logToObservedSession(message) {
        if (!androidObservedSessionOutput) return;
        const line = document.createElement('div');
        line.textContent = String(message ?? '');
        androidObservedSessionOutput.appendChild(line);
        androidObservedSessionOutput.scrollTop = androidObservedSessionOutput.scrollHeight;
    }

    window.electronAPI.on('android-observed-session-log', (message) => {
        logToObservedSession(message);
        logToTerminal(message);
    });

    window.electronAPI.on('android-observed-session-state', (state) => {
        const status = state?.status || 'idle';
        const message = state?.message || 'Sin informacion de la sesion.';
        const active = ['starting', 'running', 'mirroring', 'actions', 'extracting', 'finalizing'].includes(status);
        observedSessionRunning = active;
        androidObservedSessionStatus.className = `operation-status ${status}`;
        androidObservedSessionStatus.textContent = message;
        logToObservedSession(`[${status.toUpperCase()}] ${message}`);
        if (state.sessionDirectory) logToObservedSession(`Carpeta: ${state.sessionDirectory}`);
        if (!active && status === 'success') androidStatus.textContent = 'Sesion observada finalizada.';
        if (!active && status === 'cancelled') androidStatus.textContent = 'Sesion observada cancelada.';
        if (!active && status === 'error') androidStatus.textContent = message;
        updateAndroidButtons(false);
    });

    window.electronAPI.on('wa-terminal-log', (message) => {
        logToWaTerminal(message);
    });

    window.electronAPI.on('wa-live-message-batch', (batch) => {
        if (batch?.type === 'chat-complete') completeLiveChat(batch);
        else renderLiveMessageBatch(batch);
    });

    window.electronAPI.on('wa-live-conversation-batch', (batch) => {
        renderConversationBatch(batch);
    });

    window.electronAPI.on('wa-session-state', (state) => {
        setWhatsAppSessionState(state?.status || 'error', state?.message);
        if (waSessionProfile && state?.userDataDir) {
            waSessionProfile.textContent = `Perfil persistente: ${state.userDataDir}`;
        }
        if (state?.message) logToWaTerminal(`[Sesion] ${state.message}`);
    });

    window.electronAPI.on('whatsapp-latest-results', (result) => {
        renderLatestResults(result);
    });

    window.electronAPI.on('wa-contacts-result', (contacts) => {
        btnGetContacts.disabled = false;
        btnGetContacts.classList.remove('is-loading');
        btnGetContacts.removeAttribute('aria-busy');
        btnGetContacts.textContent = "LEER CONVERSACIONES";

        if (!Array.isArray(contacts)) {
            if (btnStartWa) btnStartWa.disabled = true;
            logToWaTerminal(`[Error] ${contacts?.error || 'No se pudo leer la lista de chats.'}`);
            return;
        }
        
        if (!contacts || contacts.length === 0) {
            logToWaTerminal('❌ No se encontraron chats. Asegúrate de tener sesión iniciada.');
            return;
        }

        // El catálogo puede haber llegado por lotes mientras se escaneaba.
        // Completarlo sin reconstruir la tabla conserva selecciones y evita
        // que el usuario vea un segundo listado o pierda sus checks.
        appendConversationRows(contacts);
        waCatalogComplete = true;
        setWhatsAppStage('conversations');
        if (waRightExtractionAction) waRightExtractionAction.classList.remove('hidden');
        logToWaTerminal(`✅ Se encontraron ${contacts.length} chats. Selecciona los que deseas extraer.`);
        return;

        // Render table (compatibilidad con el flujo anterior)
        contactsTable.replaceChildren();
        const selectAllRow = document.createElement('tr');
        selectAllRow.className = 'contact-select-all-row';
        const selectAllCell = document.createElement('td');
        selectAllCell.className = 'contact-check-cell';
        const selectAll = document.createElement('input');
        selectAll.type = 'checkbox';
        selectAll.id = 'wa-select-all';
        selectAllCell.appendChild(selectAll);
        const selectAllLabelCell = document.createElement('td');
        selectAllLabelCell.className = 'contact-label-cell';
        const selectAllLabel = document.createElement('label');
        selectAllLabel.htmlFor = 'wa-select-all';
        selectAllLabel.className = 'contact-label contact-select-all-label';
        const selectAllName = document.createElement('strong');
        selectAllName.textContent = 'Seleccionar todos los chats';
        selectAllLabel.appendChild(selectAllName);
        selectAllLabelCell.appendChild(selectAllLabel);
        selectAllRow.append(selectAllCell, selectAllLabelCell);
        contactsTable.appendChild(selectAllRow);
        contacts.forEach((contact, index) => {
            const conversation = typeof contact === 'string'
                ? { name: contact, source: 'legacy', kind: 'conversation' }
                : contact;
            const displayName = conversation.name || conversation.title || 'Conversacion sin nombre';
            const tr = document.createElement('tr');
            tr.className = 'contact-row';
            const checkboxCell = document.createElement('td');
            checkboxCell.className = 'contact-check-cell';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'contact-checkbox';
            checkbox.value = JSON.stringify(conversation);
            checkbox.id = `contact-${index}`;
            checkboxCell.appendChild(checkbox);

            const labelCell = document.createElement('td');
            labelCell.className = 'contact-label-cell';
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.className = 'contact-label';
            const name = document.createElement('strong');
            name.textContent = displayName;
            const badge = document.createElement('span');
            badge.className = `contact-badge ${conversation.kind === 'group' ? 'group' : conversation.source === 'archived' ? 'archived' : 'recent'}`;
            badge.textContent = conversation.kind === 'group' ? 'Grupo' : conversation.source === 'archived' ? 'Archivado' : 'Reciente';
            label.append(name, badge);
            labelCell.appendChild(label);

            tr.append(checkboxCell, labelCell);
            contactsTable.appendChild(tr);
        });

        contactsContainer.classList.remove('hidden');
        setWhatsAppStage('conversations');
        updateSelectedContactsState();
        logToWaTerminal(`✅ Se encontraron ${contacts.length} chats. Selecciona los que deseas extraer.`);
    });

    // La lista inicial respeta el transporte seleccionado desde el primer render.
    androidStatus.textContent = 'Consultando ADB...';
    window.electronAPI.send('android-list-devices');
});
