document.addEventListener('DOMContentLoaded', () => {
    // --- Login System ---
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');
    const btnLogin = document.getElementById('btn-login');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');

    // 통합 무역관리 프로그램에서는 이미 Firebase 인증이 되어 있으므로
    // 로그인 화면을 무조건 자동 우회합니다.
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainApp) mainApp.classList.remove('hidden');
    sessionStorage.setItem('ysacc_logged_in', 'true');

    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const pwd = loginPassword.value;
            if (pwd === 'admin' || pwd === 'ysacc1234' || pwd === '1234') {
                sessionStorage.setItem('ysacc_logged_in', 'true');
                loginOverlay.style.display = 'none';
                mainApp.classList.remove('hidden');
                loginError.classList.add('hidden');
            } else {
                loginError.classList.remove('hidden');
                loginPassword.focus();
            }
        });

        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnLogin.click();
        });
    }

    // --- State Management ---
    let currentProjectId = null;
    let currentItems = [];
    let currentResults = []; // Changed to array for multiple containers
    let currentResultIndex = 0;
    let savedProjects = [];

    // --- DOM Elements ---
    const customerInput = document.getElementById('customer-name');
    const projectInput = document.getElementById('project-name');
    const dateInput = document.getElementById('project-date');
    const serialInput = document.getElementById('project-serial');
    
    const itemForm = document.getElementById('add-item-form');
    const editItemId = document.getElementById('edit-item-id');
    const btnSubmitItem = document.getElementById('btn-submit-item');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const itemsTbody = document.getElementById('items-tbody');
    
    // Excel Elements
    const btnDownloadTemplate = document.getElementById('btn-download-template');
    const excelUploadInput = document.getElementById('excel-upload');
    const presetExcelUploadInput = document.getElementById('preset-excel-upload');
    const btnDownloadPresetTemplate = document.getElementById('btn-download-preset-template');
    
    // Stats
    const totalQtyEl = document.getElementById('total-qty');
    const totalNetWeightEl = document.getElementById('total-net-weight');
    const totalGrossWeightEl = document.getElementById('total-gross-weight');
    const totalVolumeEl = document.getElementById('total-volume');

    // Modals
    const projectModal = document.getElementById('project-modal');
    const searchInput = document.getElementById('project-search');
    const historyTbody = document.getElementById('project-history-tbody');
    
    // Simulation
    const btnRunSimulation = document.getElementById('btn-run-simulation');
    const simulationResultEl = document.getElementById('simulation-result');
    const unloadedListEl = document.getElementById('unloaded-list');
    
    // PDF & UI Additions
    const multiContainerTabs = document.getElementById('multi-container-tabs');
    const packingListContainer = document.getElementById('packing-list-container');
    const packingListTbody = document.getElementById('packing-list-tbody');
    const btnPrintPreview = document.getElementById('btn-print-preview');
    
    // Visualization
    const vizContainer = document.getElementById('visualization-container');
    const viz2dWrapper = document.getElementById('viz-2d-wrapper');
    const viz3dWrapper = document.getElementById('viz-3d-wrapper');
    const btnMode2d = document.getElementById('btn-mode-2d');
    const btnMode3d = document.getElementById('btn-mode-3d');
    
    // 2D
    const canvas = document.getElementById('viz-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const vizTabs = document.querySelectorAll('.viz-tab');
    let currentVizView = 'top';
    let itemColors = {};
    
    // 3D
    const camButtons = document.querySelectorAll('.viz-toolbar button[data-cam]');

    // Initialize UI
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // --- Core Functions ---
    const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

    // --- Presets Management ---
    const presetSelect = document.getElementById('preset-select');
    const btnDeletePreset = document.getElementById('btn-delete-preset');
    const btnSavePreset = document.getElementById('btn-save-preset');
    let presets = [];

    const renderPresets = () => {
        presetSelect.innerHTML = '<option value="">-- 자주 쓰는 화물 불러오기 --</option>';
        presets.sort((a,b) => {
            if(a.createdAt && b.createdAt) return new Date(b.createdAt) - new Date(a.createdAt);
            return (a.name || '').localeCompare(b.name || '');
        }).forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.w}x${p.d}x${p.h}, Net:${p.netWeight}kg, Gross:${p.grossWeight}kg)`;
            presetSelect.appendChild(opt);
        });
    };

    if (btnSavePreset) {
        btnSavePreset.addEventListener('click', () => {
            const name = document.getElementById('item-name').value.trim();
            const packageType = document.getElementById('item-package-type').value;
            const contentDetails = document.getElementById('item-content-details').value.trim();
            const w = parseFloat(document.getElementById('item-w').value);
            const d = parseFloat(document.getElementById('item-d').value);
            const h = parseFloat(document.getElementById('item-h').value);
            const netWeight = parseFloat(document.getElementById('item-net-weight').value);
            const grossWeight = parseFloat(document.getElementById('item-gross-weight').value);
            const qty = parseInt(document.getElementById('item-qty').value, 10);
            const stackable = document.getElementById('item-stackable').checked;
            const rotation = document.getElementById('item-rotation').checked;

            if (!name || isNaN(w) || isNaN(d) || isNaN(h) || isNaN(netWeight) || isNaN(grossWeight)) {
                alert('자주 쓰는 화물로 저장하려면 모든 화물 정보를 올바르게 입력해주세요.');
                return;
            }

            const preset = { 
                id: generateId(),
                name, packageType, contentDetails, w, d, h, netWeight, grossWeight, 
                qty: isNaN(qty) ? 1 : qty, stackable, rotation,
                createdAt: new Date().toISOString()
            };

            if (window.db) {
                window.db.collection('presets').doc(preset.id).set(preset).then(() => {
                    alert(`'${name}' 화물이 자주 쓰는 화물에 저장되었습니다.`);
                }).catch(e => {
                    console.error("Error saving preset:", e);
                    alert("저장 중 오류가 발생했습니다.");
                });
            } else {
                presets.push(preset);
                renderPresets();
                alert(`'${name}' 화물이 자주 쓰는 화물에 저장되었습니다.`);
            }
        });
    }

    if (btnDeletePreset) {
        btnDeletePreset.addEventListener('click', () => {
            const id = presetSelect.value;
            if (!id) {
                alert('삭제할 화물을 선택해주세요.');
                return;
            }
            if (confirm('선택한 자주 쓰는 화물을 삭제하시겠습니까?')) {
                if (window.db) {
                    window.db.collection('presets').doc(id).delete().then(() => {
                        // success
                    }).catch(e => console.error("Error deleting preset:", e));
                } else {
                    presets = presets.filter(p => p.id !== id);
                    renderPresets();
                }
            }
        });
    }

    if (presetExcelUploadInput) {
        presetExcelUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = evt.target.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (json.length <= 1) {
                        alert('업로드된 엑셀에 데이터가 없습니다.');
                        return;
                    }

                    let addedCount = 0;
                    for (let i = 1; i < json.length; i++) {
                        const row = json[i];
                        if (!row || row.length === 0) continue;
                        
                        const name = row[0] ? String(row[0]).trim() : '';
                        if (!name) continue; 
                        
                        const packageType = row[1] ? String(row[1]).trim() : 'Pallet';
                        const contentDetails = row[2] ? String(row[2]).trim() : '';
                        const w = parseFloat(row[3]);
                        const d = parseFloat(row[4]);
                        const h = parseFloat(row[5]);
                        const netWeight = parseFloat(row[6]) || 0;
                        const grossWeight = parseFloat(row[7]);
                        const qty = parseInt(row[8], 10);
                        const stackable = String(row[9]).toUpperCase().trim() !== 'X';
                        const rotation = String(row[10]).toUpperCase().trim() !== 'X';

                        if (isNaN(w) || isNaN(d) || isNaN(h) || isNaN(grossWeight)) {
                            console.warn('필수 데이터 누락 행 무시:', row);
                            continue;
                        }

                        const preset = {
                            id: generateId(),
                            name, packageType, contentDetails, w, d, h, 
                            netWeight, grossWeight, weight: grossWeight, 
                            qty: isNaN(qty) ? 1 : qty, stackable, rotation,
                            createdAt: new Date().toISOString()
                        };
                        
                        if (window.db) {
                            window.db.collection('presets').doc(preset.id).set(preset);
                        } else {
                            presets.push(preset);
                        }
                        addedCount++;
                    }

                    if (addedCount > 0) {
                        if (!window.db) renderPresets();
                        alert(`성공적으로 ${addedCount}개의 화물을 자주 쓰는 화물 목록에 일괄 추가했습니다.`);
                    } else {
                        alert('유효한 화물 데이터를 찾지 못했습니다. 양식을 확인해주세요.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
                }
                
                presetExcelUploadInput.value = '';
            };
            reader.readAsBinaryString(file);
        });
    }

    if (presetSelect) {
        presetSelect.addEventListener('change', () => {
            const id = presetSelect.value;
            if (!id) return;
            const p = presets.find(item => item.id === id);
            if (!p) return;
            document.getElementById('item-name').value = p.name;
            document.getElementById('item-package-type').value = p.packageType || 'Pallet';
            document.getElementById('item-content-details').value = p.contentDetails || '';
            document.getElementById('item-w').value = p.w;
            document.getElementById('item-d').value = p.d;
            document.getElementById('item-h').value = p.h;
            document.getElementById('item-net-weight').value = p.netWeight || p.weight || 0;
            document.getElementById('item-gross-weight').value = p.grossWeight || p.weight || 0;
            document.getElementById('item-qty').value = p.qty || 1;
            document.getElementById('item-stackable').checked = p.stackable !== undefined ? p.stackable : true;
            document.getElementById('item-rotation').checked = p.rotation !== undefined ? p.rotation : true;
        });
    }

    // Initialize presets
    renderPresets();

    const getSelectedContainers = () => {
        let containers = [];
        document.querySelectorAll('.container-qty-input').forEach(input => {
            const qty = parseInt(input.value, 10) || 0;
            const type = input.dataset.type;
            for (let i = 0; i < qty; i++) {
                containers.push(type);
            }
        });
        return containers;
    };

    const getContainerQuantities = () => {
        let qtys = {};
        document.querySelectorAll('.container-qty-input').forEach(input => {
            qtys[input.dataset.type] = parseInt(input.value, 10) || 0;
        });
        return qtys;
    };

    const getSelectedContainer = () => {
        return getSelectedContainers()[0] || '20GP';
    };

    const setSelectedContainer = (value, qtys = null) => {
        document.querySelectorAll('.container-qty-input').forEach(input => {
            if (qtys) {
                input.value = qtys[input.dataset.type] || 0;
            } else {
                input.value = (input.dataset.type === value) ? 1 : 0;
            }
        });
    };

    // --- Item Management ---
    
    // Excel Upload & Template
    if (btnDownloadTemplate) {
        btnDownloadTemplate.addEventListener('click', () => {
            const ws_data = [
                ['화물명(필수)', '포장형태', '혼적/내용물상세', '가로(mm, 필수)', '세로(mm, 필수)', '높이(mm, 필수)', '순중량(Net, kg)', '총중량(Gross, kg, 필수)', '수량(필수)', '다단적재(O/X)', '회전허용(O/X)'],
                ['예시화물A', 'Pallet', 'A제품 박스 10개 혼적', 1200, 1000, 800, 450, 500, 10, 'O', 'O'],
                ['예시화물B', 'Wooden Box', '기계부품', 1000, 1000, 1000, 300, 320, 5, 'X', 'O']
            ];
            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "화물리스트양식");
            XLSX.writeFile(wb, "적재마스터_화물업로드양식.xlsx");
        });
    }

    if (btnDownloadPresetTemplate) {
        btnDownloadPresetTemplate.addEventListener('click', () => {
            const ws_data = [
                ['화물명(필수)', '포장형태', '혼적/내용물상세', '가로(mm, 필수)', '세로(mm, 필수)', '높이(mm, 필수)', '순중량(Net, kg)', '총중량(Gross, kg, 필수)', '수량(필수)', '다단적재(O/X)', '회전허용(O/X)'],
                ['자주쓰는화물A', 'Pallet', '', 1100, 1100, 1000, 500, 520, 1, 'O', 'O'],
                ['자주쓰는화물B', 'Drum', '케미컬 드럼 4개', 1200, 1000, 800, 300, 310, 1, 'O', 'O']
            ];
            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "즐겨찾기양식");
            XLSX.writeFile(wb, "적재마스터_즐겨찾기업로드양식.xlsx");
        });
    }

    if (excelUploadInput) {
        excelUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = evt.target.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (json.length <= 1) {
                        alert('업로드된 엑셀에 데이터가 없습니다.');
                        return;
                    }

                    let addedCount = 0;
                    for (let i = 1; i < json.length; i++) {
                        const row = json[i];
                        if (!row || row.length === 0) continue;
                        
                        const name = row[0] ? String(row[0]).trim() : '';
                        if (!name) continue; // skip empty name
                        
                        const packageType = row[1] ? String(row[1]).trim() : 'Pallet';
                        const contentDetails = row[2] ? String(row[2]).trim() : '';
                        const w = parseFloat(row[3]);
                        const d = parseFloat(row[4]);
                        const h = parseFloat(row[5]);
                        const netWeight = parseFloat(row[6]) || 0;
                        const grossWeight = parseFloat(row[7]);
                        const qty = parseInt(row[8], 10);
                        const stackable = String(row[9]).toUpperCase().trim() !== 'X'; // default O
                        const rotation = String(row[10]).toUpperCase().trim() !== 'X'; // default O

                        if (isNaN(w) || isNaN(d) || isNaN(h) || isNaN(grossWeight) || isNaN(qty)) {
                            console.warn('필수 데이터 누락 행 무시:', row);
                            continue;
                        }

                        currentItems.push({
                            id: generateId(),
                            name: name,
                            packageType: packageType,
                            contentDetails: contentDetails,
                            w: w,
                            d: d,
                            h: h,
                            netWeight: netWeight,
                            grossWeight: grossWeight,
                            weight: grossWeight,
                            qty: qty,
                            stackable: stackable,
                            rotation: rotation
                        });
                        addedCount++;
                    }

                    if (addedCount > 0) {
                        renderItems();
                        alert(`성공적으로 ${addedCount}개의 화물을 리스트에 추가했습니다.`);
                    } else {
                        alert('유효한 화물 데이터를 찾지 못했습니다. 양식을 확인해주세요.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
                }
                
                excelUploadInput.value = '';
            };
            reader.readAsBinaryString(file);
        });
    }

    itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const netW = parseFloat(document.getElementById('item-net-weight').value);
        const grossW = parseFloat(document.getElementById('item-gross-weight').value);

        const item = {
            id: editItemId.value || generateId(),
            name: document.getElementById('item-name').value,
            packageType: document.getElementById('item-package-type').value,
            contentDetails: document.getElementById('item-content-details').value,
            w: parseFloat(document.getElementById('item-w').value),
            d: parseFloat(document.getElementById('item-d').value),
            h: parseFloat(document.getElementById('item-h').value),
            netWeight: netW,
            grossWeight: grossW,
            weight: grossW, // For packer logic compatibility
            qty: parseInt(document.getElementById('item-qty').value, 10),
            stackable: document.getElementById('item-stackable').checked,
            rotation: document.getElementById('item-rotation').checked
        };

        if (editItemId.value) {
            const idx = currentItems.findIndex(i => i.id === item.id);
            if (idx > -1) currentItems[idx] = item;
            exitEditMode();
        } else {
            currentItems.push(item);
        }
        
        itemForm.reset();
        document.getElementById('item-package-type').value = 'Pallet';
        document.getElementById('item-stackable').checked = true;
        document.getElementById('item-rotation').checked = true;
        presetSelect.value = '';
        
        renderItems();
    });

    btnCancelEdit.addEventListener('click', () => {
        itemForm.reset();
        exitEditMode();
    });

    const exitEditMode = () => {
        editItemId.value = '';
        btnSubmitItem.textContent = '리스트에 추가';
        btnCancelEdit.classList.add('hidden');
    };

    window.editItem = (id) => {
        const item = currentItems.find(i => i.id === id);
        if (!item) return;

        editItemId.value = item.id;
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-package-type').value = item.packageType || 'Pallet';
        document.getElementById('item-content-details').value = item.contentDetails || '';
        document.getElementById('item-w').value = item.w;
        document.getElementById('item-d').value = item.d;
        document.getElementById('item-h').value = item.h;
        document.getElementById('item-net-weight').value = item.netWeight || item.weight;
        document.getElementById('item-gross-weight').value = item.grossWeight || item.weight;
        document.getElementById('item-qty').value = item.qty;
        document.getElementById('item-stackable').checked = item.stackable;
        document.getElementById('item-rotation').checked = item.rotation;

        btnSubmitItem.textContent = '수정 완료';
        btnCancelEdit.classList.remove('hidden');
    };

    window.deleteItem = (id) => {
        if(confirm('선택한 화물을 삭제하시겠습니까?')) {
            currentItems = currentItems.filter(i => i.id !== id);
            renderItems();
            if(editItemId.value === id) exitEditMode();
        }
    };

    window.duplicateItem = (id) => {
        const item = currentItems.find(i => i.id === id);
        if (!item) return;
        
        const newItem = {
            ...JSON.parse(JSON.stringify(item)),
            id: generateId(),
            name: item.name + ' (복사본)'
        };
        
        const index = currentItems.findIndex(i => i.id === id);
        if (index !== -1) {
            currentItems.splice(index + 1, 0, newItem);
        } else {
            currentItems.push(newItem);
        }
        
        renderItems();
        
        if (currentResults && currentResults.length > 0) {
            const btnRunSimulation = document.getElementById('btn-run-simulation');
            if (btnRunSimulation) btnRunSimulation.click();
        }
    };

    const renderItems = () => {
        itemsTbody.innerHTML = '';
        const itemsTfoot = document.getElementById('items-tfoot');
        const checkAllEl = document.getElementById('check-all-items');
        if (checkAllEl) checkAllEl.checked = false;

        if (currentItems.length === 0) {
            itemsTbody.innerHTML = '<tr class="empty-row"><td colspan="9">등록된 화물이 없습니다.</td></tr>';
            if(itemsTfoot) itemsTfoot.classList.add('hidden');
        } else {
            if(itemsTfoot) itemsTfoot.classList.remove('hidden');
            currentItems.forEach(item => {
                const nwUse = item.netWeight !== undefined ? item.netWeight : 0;
                const gwUse = item.grossWeight !== undefined ? item.grossWeight : item.weight;
                
                const netDisp = nwUse ? nwUse.toLocaleString() : '-';
                const grossDisp = gwUse ? gwUse.toLocaleString() : '-';
                const totalNetDisp = nwUse ? (nwUse * item.qty).toLocaleString() : '-';
                const totalGrossDisp = gwUse ? (gwUse * item.qty).toLocaleString() : '-';

                const pkgTypeDisp = item.packageType ? ` <span style="color:var(--text-secondary); font-size:0.85rem;">(${item.packageType})</span>` : '';
                const detailsDisp = item.contentDetails ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; white-space: pre-wrap;">${item.contentDetails}</div>` : '';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align: center;">
                        <input type="checkbox" class="item-checkbox" data-id="${item.id}">
                    </td>
                    <td>
                        <strong>${item.name}</strong>${pkgTypeDisp}
                        ${detailsDisp}
                    </td>
                    <td>${item.w} × ${item.d} × ${item.h}</td>
                    <td>${((item.w * item.d * item.h) / 1000000000).toFixed(3)}</td>
                    <td>${netDisp} / ${grossDisp}</td>
                    <td>${item.qty.toLocaleString()}</td>
                    <td>-</td>
                    <td>
                        <span class="tag ${item.stackable ? 'active' : ''}">${item.stackable ? '다단허용' : '다단불가'}</span>
                        <span class="tag ${item.rotation ? 'active' : ''}">${item.rotation ? '회전허용' : '회전불가'}</span>
                    </td>
                    <td class="actions-cell">
                        <button class="btn btn-icon btn-sm" onclick="duplicateItem('${item.id}')" title="복사"><i data-lucide="copy"></i></button>
                        <button class="btn btn-icon btn-sm" onclick="editItem('${item.id}')" title="수정"><i data-lucide="edit-2"></i></button>
                        <button class="btn btn-icon btn-sm" onclick="deleteItem('${item.id}')" title="삭제"><i data-lucide="trash-2"></i></button>
                    </td>
                `;
                itemsTbody.appendChild(tr);
            });
            lucide.createIcons();
        }
        updateStats();
    };

    const updateStats = () => {
        let qty = 0, netWeight = 0, grossWeight = 0, volume = 0;
        currentItems.forEach(item => {
            qty += item.qty;
            const nwUse = item.netWeight !== undefined ? item.netWeight : 0;
            const gwUse = item.grossWeight !== undefined ? item.grossWeight : item.weight;
            netWeight += (nwUse * item.qty);
            grossWeight += (gwUse * item.qty);
            const itemVol = ((item.w * item.d * item.h) / 1000000000) * item.qty;
            volume += itemVol;
        });

        if (totalQtyEl) totalQtyEl.textContent = qty.toLocaleString();
        if (totalNetWeightEl) totalNetWeightEl.textContent = netWeight.toLocaleString();
        if (totalGrossWeightEl) totalGrossWeightEl.textContent = grossWeight.toLocaleString();
        if (totalVolumeEl) totalVolumeEl.textContent = volume.toFixed(3);
        
        const tableTotalQty = document.getElementById('table-total-qty');
        const tableTotalWeight = document.getElementById('table-total-weight');
        if (tableTotalQty) tableTotalQty.textContent = qty.toLocaleString();
        if (tableTotalWeight) tableTotalWeight.textContent = `${netWeight.toLocaleString()} / ${grossWeight.toLocaleString()}`;
    };

    // --- Project Management ---
    const getProjectData = () => {
        return {
            id: currentProjectId || generateId(),
            customerName: customerInput.value,
            projectName: projectInput.value,
            date: dateInput.value,
            serial: serialInput.value,
            containerType: getSelectedContainer(),
            containerQuantities: getContainerQuantities(),
            items: currentItems,
            results: currentResults,
            updatedAt: new Date().toISOString()
        };
    };

    const saveProject = (isSaveAs = false, silent = false) => {
        if (window.parent !== window) {
            return true; // Skip saving to database when in iframe
        }
        if (!projectInput.value) {
            alert('프로젝트명을 입력해주세요.');
            projectInput.focus();
            return false;
        }

        const data = getProjectData();
        let docId = data.id;

        // Check if a project with same customerName, date, and serial already exists
        const duplicateProject = savedProjects.find(p => 
            p.customerName === data.customerName &&
            p.date === data.date &&
            p.serial === data.serial
        );

        if (isSaveAs) {
            data.id = generateId(); // New ID
            data.createdAt = new Date().toISOString();
            currentProjectId = data.id;
            docId = data.id;
        } else {
            // If duplicate exists or we don't have currentProjectId, enforce generating a new project
            if (duplicateProject || !currentProjectId) {
                // If it's a duplicate of an existing project and we didn't explicitly load this exact ID,
                // we should regenerate ID to prevent overwriting.
                if (duplicateProject && currentProjectId !== duplicateProject.id) {
                    data.id = generateId();
                    data.createdAt = new Date().toISOString();
                    currentProjectId = data.id;
                    docId = data.id;
                } else if (!currentProjectId) {
                    data.id = generateId();
                    data.createdAt = new Date().toISOString();
                    currentProjectId = data.id;
                    docId = data.id;
                } else {
                    // We loaded this exact project ID, so keep updating it
                    const oldProj = savedProjects.find(p => p.id === currentProjectId);
                    if (oldProj) {
                        data.createdAt = oldProj.createdAt || new Date().toISOString();
                    } else {
                        data.createdAt = new Date().toISOString();
                    }
                }
            } else {
                const oldProj = savedProjects.find(p => p.id === currentProjectId);
                if (oldProj) {
                    if (oldProj.projectName !== data.projectName || oldProj.serial !== data.serial) {
                        data.id = generateId();
                        data.createdAt = new Date().toISOString();
                        currentProjectId = data.id;
                        docId = data.id;
                    } else {
                        data.createdAt = oldProj.createdAt; // keep original
                    }
                } else {
                    data.createdAt = new Date().toISOString();
                }
            }
        }

        if (window.db) {
            window.db.collection("projects").doc(docId).set(data).then(() => {
                if (!silent) alert('프로젝트가 저장되었습니다.');
            }).catch(e => {
                console.error("Error saving project:", e);
                if (!silent) alert("저장 중 오류가 발생했습니다.");
            });
        }
        return true;
    };

    window.loadProject = (id) => {
        const proj = savedProjects.find(p => p.id === id);
        if (!proj) return;

        currentProjectId = proj.id;
        customerInput.value = proj.customerName || '';
        projectInput.value = proj.projectName || '';
        dateInput.value = proj.date || '';
        serialInput.value = proj.serial || '';
        setSelectedContainer(proj.containerType || '20GP', proj.containerQuantities);
        currentItems = proj.items || [];
        currentResults = proj.results || (proj.result ? [proj.result] : []);
        currentResultIndex = 0;
        
        exitEditMode();
        renderItems();
        if (typeof renderContainerTabs === 'function') renderContainerTabs();
        renderSimulationResult();
        closeModal();
        
        // 프로젝트 불러온 후 자동으로 시뮬레이션 실행
        if (currentItems.length > 0) {
            document.getElementById('btn-run-simulation').click();
        }
    };

    window.duplicateProject = (id) => {
        const proj = savedProjects.find(p => p.id === id);
        if (!proj) return;
        const newProj = JSON.parse(JSON.stringify(proj));
        newProj.id = generateId();
        newProj.projectName = newProj.projectName + ' (복사본)';
        newProj.createdAt = new Date().toISOString();
        newProj.updatedAt = new Date().toISOString();
        
        if (window.db) {
            window.db.collection("projects").doc(newProj.id).set(newProj).catch(e => console.error(e));
        }
    };

    window.deleteProject = (id) => {
        if(confirm('이 프로젝트를 영구적으로 삭제하시겠습니까?')) {
            if (window.db) {
                window.db.collection("projects").doc(id).delete().then(() => {
                    if(currentProjectId === id) currentProjectId = null;
                }).catch(e => console.error(e));
            }
        }
    };

    document.getElementById('btn-save-project').addEventListener('click', () => saveProject(false));
    document.getElementById('btn-save-as-project').addEventListener('click', () => saveProject(true));

    const btnExportPacking = document.getElementById('btn-export-packing');
    if (window.parent !== window) {
        if (btnExportPacking) btnExportPacking.classList.remove('hidden');
        
        const btnLoad = document.getElementById('btn-load-project');
        const btnSave = document.getElementById('btn-save-project');
        const btnSaveAs = document.getElementById('btn-save-as-project');
        if (btnLoad) btnLoad.style.display = 'none';
        if (btnSave) btnSave.style.display = 'none';
        if (btnSaveAs) btnSaveAs.style.display = 'none';
    }
    if (btnExportPacking) {
        btnExportPacking.addEventListener('click', () => {
            if (!currentResults || currentResults.length === 0) {
                alert('시뮬레이션 실행 결과가 없습니다. 시뮬레이션을 먼저 실행해주세요.');
                return;
            }

            const formattedContainers = currentResults.map((result, idx) => {
                const itemsMap = {};
                result.loaded.forEach(box => {
                    const key = box.name;
                    if (!itemsMap[key]) {
                        itemsMap[key] = {
                            description: box.name,
                            supplier: box.supplier || '',
                            qty: 0,
                            w: box.w,
                            d: box.d,
                            h: box.h,
                            netWeight: box.netWeight || 0,
                            grossWeight: box.grossWeight || box.weight || 0,
                            packageType: box.packageType || 'Pallet'
                        };
                    }
                    itemsMap[key].qty++;
                });

                const items = Object.values(itemsMap).map((g: any, itemIdx) => {
                    const totalQty = g.qty;
                    const cbm = (g.w * g.d * g.h) / 1000000000 * totalQty;
                    return {
                        pkgNo: String(itemIdx + 1),
                        pkg: String(totalQty),
                        description: g.description,
                        supplier: g.supplier,
                        netWeight: String((g.netWeight * totalQty).toFixed(1)),
                        grossWeight: String((g.grossWeight * totalQty).toFixed(1)),
                        cbm: String(cbm.toFixed(3)),
                        packageType: g.packageType,
                        dimensions: `${g.w}x${g.d}x${g.h}`
                    };
                });

                return {
                    containerNo: `CONTAINER-${idx + 1}`,
                    sealNo: '',
                    containerType: result.containerType,
                    items: items
                };
            });

            window.parent.postMessage({
                type: 'EXPORT_PACKING_LIST',
                containers: formattedContainers
            }, '*');
        });
    }

    // --- Modal & History ---
    document.getElementById('btn-load-project').addEventListener('click', () => {
        renderHistory();
        projectModal.classList.remove('hidden');
    });

    const closeModal = () => projectModal.classList.add('hidden');
    document.querySelector('.btn-close-modal').addEventListener('click', closeModal);
    projectModal.addEventListener('click', (e) => {
        if(e.target === projectModal) closeModal();
    });

    const renderHistory = () => {
        const query = searchInput.value.toLowerCase();
        const filtered = savedProjects.filter(p => 
            (p.customerName || '').toLowerCase().includes(query) || 
            (p.projectName || '').toLowerCase().includes(query)
        );

        historyTbody.innerHTML = '';
        if (filtered.length === 0) {
            historyTbody.innerHTML = '<tr><td colspan="4" style="text-align:center">저장된 프로젝트가 없습니다.</td></tr>';
        } else {
            filtered.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(p => {
                const tr = document.createElement('tr');
                const date = new Date(p.updatedAt).toLocaleString('ko-KR');
                tr.innerHTML = `
                    <td><strong>${p.projectName || '이름 없음'}</strong></td>
                    <td>${p.customerName || '-'}</td>
                    <td>${date}</td>
                    <td class="actions-cell">
                        <button class="btn btn-outline btn-sm" onclick="loadProject('${p.id}')">불러오기</button>
                        <button class="btn btn-icon btn-sm" title="복제" onclick="duplicateProject('${p.id}')"><i data-lucide="copy"></i></button>
                        <button class="btn btn-icon btn-sm" title="삭제" onclick="deleteProject('${p.id}')"><i data-lucide="trash-2"></i></button>
                    </td>
                `;
                historyTbody.appendChild(tr);
            });
            lucide.createIcons();
        }
    };

    searchInput.addEventListener('input', renderHistory);

    // --- Simulation ---
    btnRunSimulation.addEventListener('click', () => {
        if (currentItems.length === 0) {
            alert('적재할 화물이 없습니다.');
            return;
        }

        if (!projectInput.value) {
            alert('시뮬레이션을 실행하려면 프로젝트명을 먼저 입력해주세요.');
            projectInput.focus();
            return;
        }
        
        const containers = getSelectedContainers();
        if (containers.length === 0) {
            alert('배치할 컨테이너 수량을 최소 1개 이상 입력해주세요.');
            return;
        }
        
        try {
            // 시뮬레이션 계산 수행
            currentResults = Packer.pack(containers, currentItems);
            currentResultIndex = 0;

            // 계산 결과가 포함된 상태로 프로젝트 자동 저장 (알림창 없이 조용히 저장)
            saveProject(false, true);

            renderContainerTabs();
            renderSimulationResult();
        } catch (e) {
            console.error(e);
            alert('시뮬레이션 중 오류가 발생했습니다.\n' + e.message + '\n' + e.stack);
        }
    });

    const btnAddContainerUnloaded = document.getElementById('btn-add-container-unloaded');
    if (btnAddContainerUnloaded) {
        btnAddContainerUnloaded.addEventListener('click', () => {
            const addType = document.getElementById('unloaded-add-type').value;
            const inputEl = document.querySelector(`.container-qty-input[data-type="${addType}"]`);
            if (inputEl) {
                inputEl.value = (parseInt(inputEl.value, 10) || 0) + 1;
                btnRunSimulation.click();
            }
        });
    }

    const renderContainerTabs = () => {
        if (!currentResults || currentResults.length <= 1) {
            multiContainerTabs.classList.add('hidden');
            return;
        }
        
        multiContainerTabs.classList.remove('hidden');
        multiContainerTabs.innerHTML = '';
        
        currentResults.forEach((res, idx) => {
            const btn = document.createElement('button');
            btn.className = `container-tab ${idx === currentResultIndex ? 'active' : ''}`;
            btn.innerHTML = `[${idx + 1}번] ${res.container}`;
            btn.addEventListener('click', () => {
                currentResultIndex = idx;
                renderContainerTabs();
                renderSimulationResult();
            });
            multiContainerTabs.appendChild(btn);
        });
    };

    const renderPackingList = (loaded) => {
        packingListTbody.innerHTML = '';
        if (!loaded || loaded.length === 0) {
            packingListContainer.classList.add('hidden');
            return;
        }
        
        packingListContainer.classList.remove('hidden');
        loaded.sort((a, b) => a.globalIndex - b.globalIndex).forEach(item => {
            const netDisp = item.netWeight !== undefined ? item.netWeight.toLocaleString() : '-';
            const grossDisp = item.grossWeight !== undefined ? item.grossWeight.toLocaleString() : item.weight.toLocaleString();
            const pkgTypeDisp = item.packageType ? ` <small style="color:var(--text-secondary);">(${item.packageType})</small>` : '';
            const detailsDisp = item.contentDetails ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${item.contentDetails}</div>` : '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.globalIndex}</strong></td>
                <td>${item.name} <small class="text-muted">(${item.itemIndex})</small>${pkgTypeDisp}${detailsDisp}</td>
                <td>${item.w} × ${item.d} × ${item.h}</td>
                <td>${netDisp}</td>
                <td>${grossDisp}</td>
                <td><span style="color: var(--success-color);">적재완료</span></td>
            `;
            packingListTbody.appendChild(tr);
        });
    };

    const renderSimulationResult = () => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        
        if (!currentResult) {
            simulationResultEl.innerHTML = `
                <i data-lucide="cuboid"></i>
                <p>화물을 추가하고 시뮬레이션을 실행하면 여기에 결과가 표시됩니다.</p>
            `;
            unloadedListEl.innerHTML = '<li class="empty-list">시뮬레이션 결과가 없습니다.</li>';
            btnPrintPreview.classList.add('hidden');
            packingListContainer.classList.add('hidden');
            lucide.createIcons();
            return;
        }

        btnPrintPreview.classList.remove('hidden');

        const loadedCount = currentResult.loaded.length;
        // Total unloaded items is generally those in the LAST result's unloaded array
        // We can just show the unloaded items for the CURRENT result to be precise
        const unloadedCount = currentResult.unloaded.length;
        const m = currentResult.metrics;
        
        // Count total used containers
        const containerCounts = {};
        currentResults.forEach(r => {
            containerCounts[r.container] = (containerCounts[r.container] || 0) + 1;
        });
        const containerSummaryStr = Object.entries(containerCounts).map(([type, count]) => `${type} ${count}대`).join(', ');

        simulationResultEl.innerHTML = `
            <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="card" style="padding: 1rem;">
                        <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">용적률 (부피)</h4>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">${m.utilizationRate.toFixed(2)}%</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                            적재됨: ${m.loadedVolume.toFixed(2)} / 총: ${m.totalVolume.toFixed(2)} CBM
                        </div>
                    </div>
                    <div class="card" style="padding: 1rem;">
                        <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">중량 사용률</h4>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">${((m.loadedWeight / m.maxWeight) * 100).toFixed(2)}%</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                            적재됨: ${m.loadedWeight.toLocaleString()} / 총: ${m.maxWeight.toLocaleString()} kg
                        </div>
                    </div>
                </div>

                <div class="card" style="padding: 1rem; background: rgba(255,255,255,0.02);">
                    <h4 style="margin-bottom: 0.5rem; font-size: 0.95rem;">잔여 공간 분석</h4>
                    <p style="font-size: 0.85rem; margin-bottom: 0.25rem;">
                        <span style="color: var(--text-secondary);">이론적 총 잔여 부피:</span> <strong>${m.remainingVolume.toFixed(2)} CBM</strong>
                    </p>
                    <p style="font-size: 0.85rem; margin-bottom: 0.25rem;">
                        <span style="color: var(--text-secondary);">가장 큰 단일 연속 빈 공간:</span> <strong>${m.maxContinuousVolume.toFixed(2)} CBM</strong>
                    </p>
                    <p style="font-size: 0.85rem; margin-bottom: 0.5rem;">
                        <span style="color: var(--text-secondary);">빈 공간 조각 개수:</span> <strong>${m.fragmentedCount}개</strong>
                    </p>
                    <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--primary-color); padding: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                        <strong>참고:</strong> 위 잔여 부피는 빈 공간의 단순 합계입니다. 조각(Fragment)된 형태일 수 있으므로 실제 사용 가능한 빈 공간과 다를 수 있습니다.
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                    <span style="color: var(--primary-color);"><strong>총 사용 컨테이너:</strong> ${containerSummaryStr}</span>
                    <span><strong>현재 컨테이너:</strong> ${currentResult.container}</span>
                    <span><strong>적재된 팔레트:</strong> ${loadedCount}개</span>
                    <span><strong>잔여 허용 중량:</strong> ${m.remainingWeight.toLocaleString()} kg</span>
                </div>
            </div>
        `;
        
        unloadedListEl.innerHTML = '';
        if (currentResultIndex === currentResults.length - 1 && unloadedCount > 0) {
            // Only show unloaded errors on the LAST container's tab
            currentResult.unloaded.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${item.box.name}</strong> <span style="color: var(--danger-color); float:right;">${item.reason}</span>`;
                unloadedListEl.appendChild(li);
            });
        } else if (currentResultIndex === currentResults.length - 1 && unloadedCount === 0) {
            unloadedListEl.innerHTML = '<li class="empty-list" style="color: var(--success-color);">모든 화물이 적재되었습니다!</li>';
        } else {
            unloadedListEl.innerHTML = '<li class="empty-list">다음 컨테이너 탭을 확인하세요.</li>';
        }
        
        lucide.createIcons();
        
        // Setup Visualization
        if (loadedCount > 0) {
            vizContainer.classList.remove('hidden');
            assignColorsToItems(currentResult.loaded);
            
            // Draw 2D
            drawVisualization();
            
            // Update 3D Viewer if available
            if (window.Viewer3D) {
                window.Viewer3D.update(currentResult, itemColors);
            }
            
            // Render Packing List
            renderPackingList(currentResult.loaded);
        } else {
            vizContainer.classList.add('hidden');
            packingListContainer.classList.add('hidden');
        }
    };
    
    // Print Preview Event Listener
    btnPrintPreview.addEventListener('click', () => {
        const printWin = window.open('', '_blank');
        if (!printWin) {
            alert('팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해 주세요.');
            return;
        }

        // Generate canvas images
        const views = [
            { id: 'top', label: '위 (Top View)' },
            { id: 'left_side', label: '왼쪽 옆 (Left Side)' },
            { id: 'right_side', label: '오른쪽 옆 (Right Side)' }
        ];

        // Create an off-screen canvas to draw
        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d');
        
        let containersHtml = '';
        
        currentResults.forEach((res, idx) => {
            // 1. Summary
            const m = res.metrics;
            const summaryHtml = `
                <div style="display:flex; gap:20px; margin-bottom:20px;">
                    <div style="flex:1; background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="color:#64748b; font-size:14px; margin-bottom:5px;">용적률 (부피)</div>
                        <div style="font-size:24px; font-weight:bold; color:#2563eb;">${m.utilizationRate.toFixed(2)}%</div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:5px;">적재됨: ${m.loadedVolume.toFixed(2)} / 총: ${m.totalVolume.toFixed(2)} CBM</div>
                    </div>
                    <div style="flex:1; background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="color:#64748b; font-size:14px; margin-bottom:5px;">중량 사용률</div>
                        <div style="font-size:24px; font-weight:bold; color:#2563eb;">${((m.loadedWeight / m.maxWeight) * 100).toFixed(2)}%</div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:5px;">적재됨: ${m.loadedWeight.toLocaleString()} / 총: ${m.maxWeight.toLocaleString()} kg</div>
                    </div>
                </div>
            `;

            // 2. Canvases
            let canvasesHtml = '';
            views.forEach(v => {
                drawVisualization(offCanvas, offCtx, v.id, 900, res); // Pass 'res' explicitly
                const dataUrl = offCanvas.toDataURL('image/png');
                canvasesHtml += `
                    <div style="margin-bottom: 30px; page-break-inside: avoid;">
                        <h4 style="margin-bottom: 10px; font-size: 16px; color: #334155;">${v.label}</h4>
                        <img src="${dataUrl}" style="max-width: 100%; border: 1px solid #ccc; border-radius: 4px;" />
                    </div>
                `;
            });

            // 3. Packing List
            let tableHtml = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size:14px;">
                    <thead>
                        <tr>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">번호</th>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">화물명(포장형태) 및 내용물</th>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">크기(W×D×H)</th>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">Net Wt.</th>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">Gross Wt.</th>
                            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px;">상태</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            const loadedSorted = [...res.loaded].sort((a, b) => a.globalIndex - b.globalIndex);
            loadedSorted.forEach(item => {
                const pkgTypeDisp = item.packageType ? ` <span style="color:#64748b; font-size:12px;">(${item.packageType})</span>` : '';
                const detailsDisp = item.contentDetails ? `<div style="font-size:12px; color:#64748b; margin-top:4px;">${item.contentDetails}</div>` : '';
                tableHtml += `
                    <tr style="page-break-inside: avoid;">
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">${item.globalIndex}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px;">
                            ${item.name}-${item.itemIndex}${pkgTypeDisp}
                            ${detailsDisp}
                        </td>
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">${item.packedL} × ${item.packedW} × ${item.packedH}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${item.netWeight !== undefined ? item.netWeight.toLocaleString() : '-'}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${item.grossWeight !== undefined ? item.grossWeight.toLocaleString() : item.weight.toLocaleString()}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:center; color:#10b981;">적재됨 ${item.rotated ? '(회전됨)' : ''}</td>
                    </tr>
                `;
            });
            tableHtml += `</tbody></table>`;

            containersHtml += `
                <div class="container-section">
                    <div style="background: #1e293b; color: white; padding: 15px 20px; font-size: 20px; font-weight: bold; border-radius: 6px; margin-bottom: 25px; margin-top: 20px;">
                        컨테이너 #${idx + 1} (${res.container})
                    </div>
                    
                    <div style="margin-bottom: 30px;">
                        <h3 style="font-size: 18px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 10px; color:#0f172a;">요약 정보</h3>
                        ${summaryHtml}
                    </div>
                    
                    <div style="margin-bottom: 30px;">
                        <h3 style="font-size: 18px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 10px; color:#0f172a;">도면 분석</h3>
                        ${canvasesHtml}
                    </div>
                    
                    <div>
                        <h3 style="font-size: 18px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 10px; color:#0f172a;">패킹 리스트</h3>
                        ${tableHtml}
                    </div>
                </div>
            `;
        });

        const printHtml = `
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <meta charset="UTF-8">
                <title>적재 플랜 레포트 미리보기</title>
                <style>
                    body { font-family: 'Inter', sans-serif; background: #e2e8f0; margin: 0; padding: 20px; color: #0f172a; }
                    .print-actions { text-align: center; margin-bottom: 20px; }
                    .btn { padding: 10px 20px; font-size: 16px; border: none; border-radius: 6px; cursor: pointer; margin: 0 5px; font-weight: bold; }
                    .btn-primary { background: #2563eb; color: white; }
                    .btn-outline { background: white; color: #334155; border: 1px solid #cbd5e1; }
                    .paper { background: white; max-width: 1000px; margin: 0 auto; padding: 50px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border-radius: 8px; }
                    .container-section { page-break-inside: auto; }
                    .container-section + .container-section { page-break-before: always; margin-top: 60px; border-top: 2px dashed #cbd5e1; padding-top: 40px; }
                    @media print {
                        body { background: white; padding: 0; }
                        .paper { max-width: 100%; width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
                        .print-actions { display: none; }
                        .container-section + .container-section { margin-top: 0; border-top: none; padding-top: 0; }
                        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="print-actions">
                    <button class="btn btn-primary" onclick="window.print()">인쇄 / PDF로 저장</button>
                    <button class="btn btn-outline" onclick="window.close()">닫기</button>
                </div>
                <div class="paper">
                    <h1 style="text-align:center; margin-bottom: 30px; font-size: 28px;">적재 플랜 레포트</h1>
                    
                    <div style="display:flex; justify-content:space-between; margin-bottom:30px; border-bottom:2px solid #cbd5e1; padding-bottom:15px; font-size: 16px;">
                        <div><strong>프로젝트:</strong> ${projectInput.value || '지정되지 않음'}</div>
                        <div><strong>일자:</strong> ${dateInput.value || '지정되지 않음'}</div>
                    </div>
                    
                    ${containersHtml}
                </div>
            </body>
            </html>
        `;

        printWin.document.open();
        printWin.document.write(printHtml);
        printWin.document.close();
    });

    // --- Visualization Logic ---
    // Mode Toggles
    btnMode2d.addEventListener('click', () => {
        btnMode3d.classList.remove('active');
        btnMode2d.classList.add('active');
        viz3dWrapper.classList.add('hidden');
        viz2dWrapper.classList.remove('hidden');
        drawVisualization(); // Redraw in case size changed
    });

    btnMode3d.addEventListener('click', () => {
        btnMode2d.classList.remove('active');
        btnMode3d.classList.add('active');
        viz2dWrapper.classList.add('hidden');
        viz3dWrapper.classList.remove('hidden');
        // Force resize on 3D viewer when it becomes visible
        if (window.Viewer3D) {
            setTimeout(() => window.Viewer3D.resize(), 50);
        }
    });

    // 3D Camera Controls
    camButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            let targetBtn = e.target;
            if (!targetBtn.dataset.cam) targetBtn = targetBtn.closest('button');
            const cam = targetBtn.dataset.cam;
            if (window.Viewer3D) window.Viewer3D.setCamera(cam);
        });
    });

    const drawVisualization = (targetCanvas = canvas, targetCtx = ctx, targetView = currentVizView, targetWidth = null, targetResult = null) => {
        const currentResult = targetResult || (currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null);
        if (!currentResult || !targetCtx) return;

        const container = currentResult.dimensions; // { l, w, h }
        const view = targetView; 
        
        let worldWidth, worldHeight;
        
        if (view === 'top') {
            worldWidth = container.l;
            worldHeight = container.w;
        } else if (view === 'left_side' || view === 'right_side') {
            worldWidth = container.l;
            worldHeight = container.h;
        }

        // Set canvas dimensions responsively
        const wrapperWidth = targetWidth || (document.querySelector('.canvas-wrapper').clientWidth - 20); 
        const aspectRatio = worldHeight / worldWidth;
        
        targetCanvas.width = wrapperWidth;
        targetCanvas.height = wrapperWidth * aspectRatio;

        const scale = targetCanvas.width / worldWidth;

        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

        // Draw Container Boundary
        targetCtx.strokeStyle = '#334155';
        if (targetWidth) targetCtx.strokeStyle = '#94a3b8'; // Lighter for PDF
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([5, 5]);
        targetCtx.strokeRect(0, 0, targetCanvas.width, targetCanvas.height);
        targetCtx.setLineDash([]); // Reset
        
        // Draw Grid / Empty space indicator
        targetCtx.fillStyle = targetWidth ? '#ffffff' : 'rgba(255, 255, 255, 0.02)';
        targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

        // Sort items by drawing order
        let drawItems = [...currentResult.loaded];
        if (view === 'top') drawItems.sort((a,b) => a.z - b.z);
        if (view === 'left_side') drawItems.sort((a,b) => b.y - a.y); // Furthest from left wall first
        if (view === 'right_side') drawItems.sort((a,b) => a.y - b.y); // Furthest from right wall first

        let maxX = 0, maxY = 0, maxZ = 0;
        drawItems.forEach(item => {
            if (item.x + item.packedL > maxX) maxX = item.x + item.packedL;
            if (item.y + item.packedW > maxY) maxY = item.y + item.packedW;
            if (item.z + item.packedH > maxZ) maxZ = item.z + item.packedH;
            
            let cx, cy, cw, ch;
            
            if (view === 'top') {
                cx = item.x;
                cy = item.y;
                cw = item.packedL;
                ch = item.packedW;
            } else if (view === 'left_side' || view === 'right_side') {
                cx = item.x;
                cy = container.h - (item.z + item.packedH); 
                cw = item.packedL;
                ch = item.packedH;
            }

            const rx = cx * scale;
            const ry = cy * scale;
            const rw = Math.max(1, cw * scale);
            const rh = Math.max(1, ch * scale);

            // Draw Block
            targetCtx.fillStyle = itemColors[item.name] || '#3b82f6';
            targetCtx.fillRect(rx, ry, rw, rh);
            
            // Draw Block Border
            targetCtx.strokeStyle = 'rgba(0,0,0,0.5)';
            targetCtx.lineWidth = 1;
            targetCtx.strokeRect(rx, ry, rw, rh);

            // Text Label
            if (rw > 30 && rh > 15) {
                targetCtx.fillStyle = '#ffffff';
                targetCtx.font = 'bold 10px Inter';
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                
                let label = `[${item.globalIndex}] ${item.name}-${item.itemIndex}`;
                if (rw < 40) label = `[${item.globalIndex}]`;
                
                const maxWidth = Math.max(10, rw - 8);
                let lines = [];
                let words = label.split(' ');
                let currentLine = words[0];

                for (let i = 1; i < words.length; i++) {
                    let word = words[i];
                    if (targetCtx.measureText(currentLine + " " + word).width < maxWidth) {
                        currentLine += " " + word;
                    } else {
                        lines.push(currentLine);
                        currentLine = word;
                    }
                }
                lines.push(currentLine);
                
                let finalLines = [];
                lines.forEach(line => {
                    if (targetCtx.measureText(line).width > maxWidth) {
                        let tempLine = '';
                        for (let c of line) {
                            if (targetCtx.measureText(tempLine + c).width > maxWidth && tempLine.length > 0) {
                                finalLines.push(tempLine);
                                tempLine = c;
                            } else {
                                tempLine += c;
                            }
                        }
                        if (tempLine) finalLines.push(tempLine);
                    } else {
                        finalLines.push(line);
                    }
                });

                targetCtx.save();
                targetCtx.beginPath();
                targetCtx.rect(rx, ry, rw, rh);
                targetCtx.clip();

                targetCtx.shadowColor = 'rgba(0,0,0,0.8)';
                targetCtx.shadowBlur = 2;

                const lineHeight = 12;
                const totalHeight = finalLines.length * lineHeight;
                let startY = ry + rh/2 - totalHeight/2 + lineHeight/2;

                finalLines.forEach(line => {
                    targetCtx.fillText(line.trim(), rx + rw/2, startY);
                    startY += lineHeight;
                });

                targetCtx.shadowBlur = 0;
                targetCtx.restore();
            }
        });

        // Draw Remaining Dimensions
        targetCtx.fillStyle = '#10b981';
        if (targetWidth) targetCtx.fillStyle = '#059669';
        targetCtx.font = 'bold 12px Inter';
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';

        const drawDimText = (txt, x, y) => {
            if (!txt) return;
            const tw = targetCtx.measureText(txt).width + 8;
            
            // Boundary clamp to prevent text clipping
            let safeX = x;
            let safeY = y;
            if (safeX - tw/2 < 0) safeX = tw/2;
            if (safeX + tw/2 > targetCanvas.width) safeX = targetCanvas.width - tw/2;
            if (safeY - 10 < 0) safeY = 10;
            if (safeY + 10 > targetCanvas.height) safeY = targetCanvas.height - 10;

            if (!targetWidth) {
                targetCtx.fillStyle = 'rgba(0,0,0,0.8)';
                targetCtx.fillRect(safeX - tw/2, safeY - 10, tw, 20);
                targetCtx.fillStyle = '#10b981';
            } else {
                targetCtx.fillStyle = '#ffffff';
                targetCtx.fillRect(safeX - tw/2, safeY - 10, tw, 20);
                targetCtx.fillStyle = '#059669';
            }
            targetCtx.fillText(txt, safeX, safeY);
        };

        if (view === 'top') {
            let lastStackMinX = maxX;
            drawItems.forEach(item => {
                if (item.x + item.packedL >= maxX - 1) { 
                    if (item.x < lastStackMinX) lastStackMinX = item.x;
                }
            });
            let lastStackMaxY = 0;
            drawItems.forEach(item => {
                if (item.x >= lastStackMinX && item.x <= maxX) {
                    if (item.y + item.packedW > lastStackMaxY) lastStackMaxY = item.y + item.packedW;
                }
            });

            const hasStep = lastStackMaxY < maxY;

            // 1. Global Side Gap (over main items)
            if (container.w - maxY > 50) {
                const sideL = hasStep ? lastStackMinX : container.l;
                if (sideL > 50) {
                    const txt = `잔여(W×D×H): ${Math.round(container.w - maxY)} × ${Math.round(sideL)} × ${container.h}`;
                    drawDimText(txt, (sideL * scale) / 2, maxY * scale + ((container.w - maxY) * scale) / 2);
                }
            }

            // 2. Space A (Beside last stack)
            if (hasStep && container.w - lastStackMaxY > 50) {
                const spaceA_L = container.l - lastStackMinX;
                const spaceA_W = container.w - lastStackMaxY;
                if (spaceA_L > 50) {
                    const txt = `공간A(W×D×H): ${Math.round(spaceA_W)} × ${Math.round(spaceA_L)} × ${container.h}`;
                    const cx = lastStackMinX + spaceA_L / 2;
                    const cy = lastStackMaxY + spaceA_W / 2;
                    drawDimText(txt, cx * scale, cy * scale);
                }
            }

            // 3. Space B (Behind last stack)
            if (container.l - maxX > 50) {
                const spaceB_L = container.l - maxX;
                const spaceB_W = lastStackMaxY;
                if (spaceB_W > 50) {
                    const txt = hasStep ? `공간B(W×D×H): ${Math.round(spaceB_W)} × ${Math.round(spaceB_L)} × ${container.h}` : `잔여(W×D×H): ${container.w} × ${Math.round(spaceB_L)} × ${container.h}`;
                    const cx = maxX + spaceB_L / 2;
                    const cy = spaceB_W / 2;
                    drawDimText(txt, cx * scale, cy * scale);
                }
            }
        } else if (view === 'left_side' || view === 'right_side') {
            let lastStackMinX = maxX;
            drawItems.forEach(item => {
                if (item.x + item.packedL >= maxX - 1) { 
                    if (item.x < lastStackMinX) lastStackMinX = item.x;
                }
            });
            let lastStackMaxZ = 0;
            drawItems.forEach(item => {
                if (item.x >= lastStackMinX && item.x <= maxX) {
                    if (item.z + item.packedH > lastStackMaxZ) lastStackMaxZ = item.z + item.packedH;
                }
            });

            const hasStep = lastStackMaxZ < maxZ;

            // 1. Global Ceiling (over main items)
            if (container.h - maxZ > 50) {
                const ceilL = hasStep ? lastStackMinX : container.l;
                if (ceilL > 50) {
                    const txt = `잔여(W×D×H): ${container.w} × ${Math.round(ceilL)} × ${Math.round(container.h - maxZ)}`;
                    drawDimText(txt, (ceilL * scale) / 2, (container.h - maxZ) * scale / 2);
                }
            }

            // 2. Space A (Above last stack)
            if (hasStep && container.h - lastStackMaxZ > 50) {
                const spaceA_L = container.l - lastStackMinX;
                const spaceA_H = container.h - lastStackMaxZ;
                if (spaceA_L > 50) {
                    const txt = `공간A(W×D×H): ${container.w} × ${Math.round(spaceA_L)} × ${Math.round(spaceA_H)}`;
                    const cx = lastStackMinX + spaceA_L / 2;
                    const cz = lastStackMaxZ + spaceA_H / 2;
                    drawDimText(txt, cx * scale, (container.h - cz) * scale);
                }
            }

            // 3. Space B (Behind last stack)
            if (container.l - maxX > 50) {
                const spaceB_L = container.l - maxX;
                const spaceB_H = lastStackMaxZ;
                if (spaceB_H > 50) {
                    const txt = hasStep ? `공간B(W×D×H): ${container.w} × ${Math.round(spaceB_L)} × ${Math.round(spaceB_H)}` : `잔여(W×D×H): ${container.w} × ${Math.round(spaceB_L)} × ${container.h}`;
                    const cx = maxX + spaceB_L / 2;
                    const cz = spaceB_H / 2;
                    drawDimText(txt, cx * scale, (container.h - cz) * scale);
                }
            }
        }
    };

    const assignColorsToItems = (loadedItems) => {
        const uniqueNames = [...new Set(loadedItems.map(item => item.name))];
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
        ];
        uniqueNames.forEach((name, idx) => {
            if (!itemColors[name]) {
                itemColors[name] = colors[idx % colors.length];
            }
        });
    };

    // Tab Listeners
    vizTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            vizTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentVizView = e.target.dataset.view;
            drawVisualization();
        });
    });

    // Resize listener for responsive canvas
    window.addEventListener('resize', () => {
        if (currentResult && currentResult.loaded.length > 0) {
            drawVisualization();
        }
    });

    // Firebase Realtime Listener & Migration
    if (window.db) {
        // Migrate existing local presets to Firebase
        const localPresets = JSON.parse(localStorage.getItem('antigravity_presets') || '[]');
        if (localPresets.length > 0) {
            const batch = window.db.batch();
            localPresets.forEach(preset => {
                preset.id = preset.id || generateId();
                preset.createdAt = preset.createdAt || new Date().toISOString();
                const docRef = window.db.collection('presets').doc(preset.id);
                batch.set(docRef, preset);
            });
            batch.commit().then(() => {
                localStorage.removeItem('antigravity_presets');
                console.log('Local presets migrated to Firebase');
            }).catch(e => console.error("Presets migration error:", e));
        }

        window.db.collection("presets").onSnapshot((querySnapshot) => {
            presets = [];
            querySnapshot.forEach((doc) => {
                presets.push(doc.data());
            });
            renderPresets();
        }, (error) => {
            console.error("Firebase presets fetch error:", error);
        });

        // Migrate existing local projects to Firebase
        const localProjects = JSON.parse(localStorage.getItem('loading_projects') || '[]');
        if (localProjects.length > 0) {
            const batch = window.db.batch();
            localProjects.forEach(proj => {
                const docRef = window.db.collection('projects').doc(proj.id);
                batch.set(docRef, proj);
            });
            batch.commit().then(() => {
                localStorage.removeItem('loading_projects');
                alert('이전에 저장했던 데이터를 성공적으로 클라우드에 복원(이동)했습니다!\n[프로젝트 열기]를 눌러 확인해보세요.');
            }).catch(e => console.error("Migration error:", e));
        }

        window.db.collection("projects").onSnapshot((querySnapshot) => {
            savedProjects = [];
            querySnapshot.forEach((doc) => {
                savedProjects.push(doc.data());
            });
            const projectModal = document.getElementById('project-modal');
            if (projectModal && !projectModal.classList.contains('hidden')) {
                renderHistory();
            }
        }, (error) => {
            console.error("Firebase fetch error:", error);
        });
    }

    // --- PostMessage from Parent (Proforma Invoice) ---
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.type === 'LOAD_PI_DATA') {
            console.log("Received PI Data:", data);
            
            // Populate project info
            if (data.customer) customerInput.value = data.customer;
            if (data.piNumber) {
                projectInput.value = data.piNumber;
                const serialInput = document.getElementById('project-serial');
                if (serialInput) serialInput.value = data.piNumber;
            }
            if (data.date) dateInput.value = data.date;
            
            // Populate containers
            if (data.containers) {
                if (document.getElementById('qty-20GP')) document.getElementById('qty-20GP').value = data.containers['20GP'] || 0;
                if (document.getElementById('qty-20RF')) document.getElementById('qty-20RF').value = data.containers['20RF'] || 0;
                if (document.getElementById('qty-40GP')) document.getElementById('qty-40GP').value = data.containers['40GP'] || 0;
                if (document.getElementById('qty-40HC')) document.getElementById('qty-40HC').value = data.containers['40HC'] || 0;
            }
            
            // Populate items
            if (data.items && Array.isArray(data.items)) {
                let addedCount = 0;
                let missingDimensionsCount = 0;
                data.items.forEach(piItem => {
                    if (!piItem.desc || !piItem.qty) return;
                    
                    // Parse dimensions from PI payload
                    const w = parseFloat(piItem.w) || 0;
                    const d = parseFloat(piItem.d) || 0;
                    const h = parseFloat(piItem.h) || 0;
                    const nw = parseFloat(piItem.netWeight) || 0;
                    const gw = parseFloat(piItem.grossWeight) || 0;
                    const qty = Math.ceil(parseFloat(piItem.qty)) || 1;
                    
                    let hasDimensions = (w > 0 && d > 0 && h > 0);
                    
                    currentItems.push({
                        id: generateId(),
                        name: piItem.desc,
                        packageType: piItem.packageType || 'Pallet',
                        contentDetails: piItem.remarks || '',
                        w: w, d: d, h: h,
                        netWeight: nw, grossWeight: gw, weight: gw,
                        qty: qty,
                        stackable: piItem.stackable !== undefined ? piItem.stackable : true,
                        rotation: piItem.rotation !== undefined ? piItem.rotation : true
                    });
                    
                    if (!hasDimensions) {
                        missingDimensionsCount++;
                    }
                    addedCount++;
                });
                
                if (addedCount > 0) {
                    if (missingDimensionsCount > 0) {
                        alert(`견적서에서 ${addedCount}개의 화물을 불러왔습니다.\n\n⚠️ 주의: ${missingDimensionsCount}개의 화물은 규격(가로/세로/높이) 정보가 없습니다. 리스트 우측의 [수정(연필)] 버튼을 눌러 규격을 입력하셔야 시뮬레이션이 가능합니다.`);
                    } else {
                        setTimeout(() => {
                            const runBtn = document.getElementById('btn-run-simulation');
                            if (runBtn) runBtn.click();
                        }, 100);
                    }
                } else {
                    alert('불러올 수 있는 화물이 없습니다.');
                }
                renderItems();
            }
        }
    });

    // --- Pallet Merging & Mixed Loading Wizard Logic ---
    const checkAllItemsEl = document.getElementById('check-all-items');
    if (checkAllItemsEl) {
        checkAllItemsEl.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.item-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
        });
    }

    const mergeModal = document.getElementById('merge-modal');
    const btnMergeSelected = document.getElementById('btn-merge-selected');
    const btnCloseMergeModal = document.getElementById('btn-close-merge-modal');
    const btnCancelMerge = document.getElementById('btn-cancel-merge');
    const mergeItemsTbody = document.getElementById('merge-items-tbody');
    const mergePalletsForm = document.getElementById('merge-pallets-form');
    
    const mergeNameInput = document.getElementById('merge-name');
    const mergePkgTypeInput = document.getElementById('merge-package-type');
    const mergeContentInput = document.getElementById('merge-content-details');
    const mergeWInput = document.getElementById('merge-w');
    const mergeDInput = document.getElementById('merge-d');
    const mergeHInput = document.getElementById('merge-h');
    const mergeNetWeightInput = document.getElementById('merge-net-weight');
    const mergeGrossWeightInput = document.getElementById('merge-gross-weight');
    const mergePalletWeightAddInput = document.getElementById('merge-pallet-weight-add');
    const mergeStackableInput = document.getElementById('merge-stackable');
    const mergeRotationInput = document.getElementById('merge-rotation');

    let selectedMergeItems = []; // Array of { item, qty }

    const openMergeModal = () => {
        const checkedCheckboxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkedCheckboxes.length < 2) {
            alert('병합할 화물을 최소 2개 이상 선택해주세요.');
            return;
        }

        selectedMergeItems = [];
        let maxW = 0, maxD = 0, maxH = 0;

        checkedCheckboxes.forEach(cb => {
            const id = cb.dataset.id;
            const item = currentItems.find(i => i.id === id);
            if (item) {
                selectedMergeItems.push({
                    item: item,
                    qty: item.qty // default to merge all
                });
                if (item.w > maxW) maxW = item.w;
                if (item.d > maxD) maxD = item.d;
                if (item.h > maxH) maxH = item.h;
            }
        });

        // Set default inputs
        const names = selectedMergeItems.map(s => s.item.name);
        mergeNameInput.value = `혼적 [${names.slice(0, 2).join(' + ')}${names.length > 2 ? ' 외 ' + (names.length - 2) + '건' : ''}]`;
        mergePkgTypeInput.value = 'Pallet';
        mergePalletWeightAddInput.checked = true;
        mergeStackableInput.checked = true;
        mergeRotationInput.checked = true;

        // Default dimensions: Standard Pallet size 1100x1100
        mergeWInput.value = maxW > 1100 ? maxW : 1100;
        mergeDInput.value = maxD > 1100 ? maxD : 1100;
        mergeHInput.value = maxH > 1000 ? maxH : 1000;

        // Remove active class from preset buttons
        document.querySelectorAll('.merge-preset-btn').forEach(btn => btn.classList.remove('active'));

        // Render merge item list
        renderMergeItemsList();
        recalculateMergeValues();

        mergeModal.classList.remove('hidden');
    };

    const closeMergeModalFunc = () => {
        mergeModal.classList.add('hidden');
    };

    if (btnMergeSelected) btnMergeSelected.addEventListener('click', openMergeModal);
    if (btnCloseMergeModal) btnCloseMergeModal.addEventListener('click', closeMergeModalFunc);
    if (btnCancelMerge) btnCancelMerge.addEventListener('click', closeMergeModalFunc);
    
    // Preset buttons event
    document.querySelectorAll('.merge-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.merge-preset-btn').forEach(b => b.classList.remove('active'));
            
            if (e.target.id === 'btn-merge-max-preset') {
                let maxW = 0, maxD = 0, maxH = 0;
                selectedMergeItems.forEach(s => {
                    if (s.item.w > maxW) maxW = s.item.w;
                    if (s.item.d > maxD) maxD = s.item.d;
                    if (s.item.h > maxH) maxH = s.item.h;
                });
                mergeWInput.value = maxW;
                mergeDInput.value = maxD;
                mergeHInput.value = maxH;
                e.target.classList.add('active');
                return;
            }

            const w = e.target.dataset.w;
            const d = e.target.dataset.d;
            const h = e.target.dataset.h;
            if (w && d && h) {
                mergeWInput.value = w;
                mergeDInput.value = d;
                mergeHInput.value = h;
                e.target.classList.add('active');
            }
        });
    });

    const inputsToWatch = [mergeWInput, mergeDInput, mergeHInput];
    inputsToWatch.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                document.querySelectorAll('.merge-preset-btn').forEach(b => b.classList.remove('active'));
            });
        }
    });

    const renderMergeItemsList = () => {
        mergeItemsTbody.innerHTML = '';
        selectedMergeItems.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${s.item.name}</strong> <small style="color:var(--text-secondary);">(${s.item.w}×${s.item.d}×${s.item.h})</small>
                </td>
                <td style="text-align: center;">${s.item.qty}</td>
                <td style="text-align: center;">
                    <input type="number" class="merge-item-qty-input" data-index="${idx}" min="1" max="${s.item.qty}" value="${s.qty}" style="width: 80px; text-align: center; padding: 2px 5px;">
                </td>
            `;
            mergeItemsTbody.appendChild(tr);
        });

        // Add event listeners to qty inputs
        document.querySelectorAll('.merge-item-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                let val = parseInt(e.target.value, 10);
                const max = selectedMergeItems[idx].item.qty;
                if (isNaN(val) || val < 1) val = 1;
                if (val > max) val = max;
                e.target.value = val;
                selectedMergeItems[idx].qty = val;
                
                recalculateMergeValues();
            });
        });
    };

    const recalculateMergeValues = () => {
        let totalNet = 0;
        let totalGross = 0;
        let contentParts = [];

        selectedMergeItems.forEach(s => {
            const qty = s.qty;
            const nw = s.item.netWeight || 0;
            const gw = s.item.grossWeight || s.item.weight || 0;
            totalNet += (nw * qty);
            totalGross += (gw * qty);
            contentParts.push(`${s.item.name} ${qty}개`);
        });

        // Add empty pallet weight if checked
        if (mergePalletWeightAddInput && mergePalletWeightAddInput.checked) {
            totalGross += 20; // 20kg standard empty pallet weight
        }

        mergeNetWeightInput.value = totalNet.toFixed(1);
        mergeGrossWeightInput.value = totalGross.toFixed(1);
        
        // Auto-update content details if not customized or empty
        mergeContentInput.value = contentParts.join(' + ') + ' 혼적';
    };

    if (mergePalletWeightAddInput) {
        mergePalletWeightAddInput.addEventListener('change', recalculateMergeValues);
    }

    if (mergePalletsForm) {
        mergePalletsForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Validate merge quantities
            let valid = true;
            selectedMergeItems.forEach(s => {
                if (s.qty < 1 || s.qty > s.item.qty) {
                    valid = false;
                }
            });

            if (!valid) {
                alert('병합할 수량이 유효하지 않습니다. 다시 확인해주세요.');
                return;
            }

            // Create new combined item
            const mergedItem = {
                id: generateId(),
                name: mergeNameInput.value,
                packageType: mergePkgTypeInput.value,
                contentDetails: mergeContentInput.value,
                w: parseFloat(mergeWInput.value),
                d: parseFloat(mergeDInput.value),
                h: parseFloat(mergeHInput.value),
                netWeight: parseFloat(mergeNetWeightInput.value),
                grossWeight: parseFloat(mergeGrossWeightInput.value),
                weight: parseFloat(mergeGrossWeightInput.value), // packer compatibility
                qty: 1, // combined pallet is 1 unit
                stackable: mergeStackableInput.checked,
                rotation: mergeRotationInput.checked
            };

            // Deduct quantities from original items
            selectedMergeItems.forEach(s => {
                const origItem = currentItems.find(i => i.id === s.item.id);
                if (origItem) {
                    origItem.qty -= s.qty;
                }
            });

            // Filter out items with quantity 0
            currentItems = currentItems.filter(i => i.qty > 0);

            // Add the new merged item
            currentItems.push(mergedItem);

            // Close modal and refresh UI
            closeMergeModalFunc();
            renderItems();

            // Trigger simulation
            setTimeout(() => {
                const runSimBtn = document.getElementById('btn-run-simulation');
                if (runSimBtn) runSimBtn.click();
            }, 150);
        });
    }

    // --- Load PI Simulation Data from localStorage (Integration) ---
    const loadPiSimulationData = () => {
        try {
            const rawData = localStorage.getItem('PI_SIMULATION_DATA');
            if (rawData) {
                const data = JSON.parse(rawData);
                if (data && data.type === 'LOAD_PI_DATA') {
                    // Populate project fields
                    if (customerInput) customerInput.value = data.customer || '';
                    if (projectInput) projectInput.value = data.piNumber ? `${data.piNumber} 적재 계획` : '';
                    if (dateInput && data.date) dateInput.value = data.date;
                    if (serialInput) serialInput.value = data.piNumber || '';

                    // Transform and push items
                    if (Array.isArray(data.items)) {
                        currentItems = data.items.map(it => ({
                            id: generateId(),
                            name: it.desc || '무명 화물',
                            packageType: it.packageType || 'Pallet',
                            contentDetails: '',
                            w: parseFloat(it.w) || 0,
                            d: parseFloat(it.d) || 0,
                            h: parseFloat(it.h) || 0,
                            netWeight: parseFloat(it.netWeight) || 0,
                            grossWeight: parseFloat(it.grossWeight) || 0,
                            weight: parseFloat(it.grossWeight) || 0, // compatibility
                            qty: Math.ceil(parseFloat(it.qty)) || 0,
                            stackable: it.stackable !== false,
                            rotation: it.rotation !== false
                        })).filter(it => it.qty > 0 && it.w > 0 && it.d > 0 && it.h > 0);
                    }

                    // Remove item to prevent re-triggering on fresh load
                    localStorage.removeItem('PI_SIMULATION_DATA');
                }
            }
        } catch (e) {
            console.error("Failed to load PI simulation data from localStorage:", e);
        }
    };

    // Load integration data first
    loadPiSimulationData();

    // Initial render
    renderItems();
    renderSimulationResult();

    // Iframe drag dispatcher
    const appHeader = document.querySelector('.app-header');
    if (appHeader) {
        appHeader.style.cursor = 'move';
        let isDraggingFromIframe = false;
        let startX, startY;
        appHeader.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDraggingFromIframe = true;
            startX = e.clientX;
            startY = e.clientY;
            window.parent.postMessage({ type: 'PACKER_DRAG_START' }, '*');
        });
        document.addEventListener('mousemove', (e) => {
            if (isDraggingFromIframe) {
                const movementX = e.clientX - startX;
                const movementY = e.clientY - startY;
                startX = e.clientX;
                startY = e.clientY;
                window.parent.postMessage({ type: 'PACKER_DRAG_MOVE', movementX, movementY }, '*');
            }
        });
        document.addEventListener('mouseup', () => {
            if (isDraggingFromIframe) {
                isDraggingFromIframe = false;
                window.parent.postMessage({ type: 'PACKER_DRAG_END' }, '*');
            }
        });
    }
});
