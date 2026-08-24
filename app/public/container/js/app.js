document.addEventListener('DOMContentLoaded', () => {
    // --- Safe Storage Wrappers to prevent SecurityErrors in iframes ---
    const safeLocalStorage = {
        getItem: (key) => {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        },
        setItem: (key, val) => {
            try { localStorage.setItem(key, val); } catch (e) {}
        },
        removeItem: (key) => {
            try { localStorage.removeItem(key); } catch (e) {}
        }
    };
    const safeSessionStorage = {
        getItem: (key) => {
            try { return sessionStorage.getItem(key); } catch (e) { return null; }
        },
        setItem: (key, val) => {
            try { sessionStorage.setItem(key, val); } catch (e) {}
        },
        removeItem: (key) => {
            try { sessionStorage.removeItem(key); } catch (e) {}
        }
    };

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
    safeSessionStorage.setItem('ysacc_logged_in', 'true');

    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const pwd = loginPassword.value;
            if (pwd === 'admin' || pwd === 'ysacc1234' || pwd === '1234') {
                safeSessionStorage.setItem('ysacc_logged_in', 'true');
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
    let currentResults = [];
    let initialResults = []; // Changed to array for multiple containers
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
    let currentTierFilter = 'all'; // 'all', 'tier1' (z===0), 'tier2' (z>0)
    let itemColors = {};
    
    // 3D
    const camButtons = document.querySelectorAll('.viz-toolbar button[data-cam]');

    // Initialize UI
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // --- Core Functions ---
    const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

    // --- Presets Management ---
    // --- Product & Packing Method DB Management ---
    const productSelect = document.getElementById('product-select');
    const productDisplay = document.getElementById('product-display');
    const packingSelect = document.getElementById('packing-select');
    let dbProducts = [];

    const loadDbProducts = () => {
        if (!window.db) return;
        
        const fetchProducts = () => {
            window.db.collection("companies").doc("YSACC").collection("products")
                .onSnapshot((querySnapshot) => {
                    dbProducts = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        data.id = doc.id;
                        dbProducts.push(data);
                    });
                    dbProducts.sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || ''));
                    renderProductSelect();
                }, (error) => {
                    console.error("Firestore products fetch error:", error);
                });
        };

        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log("Authenticated user inside iframe:", user.uid);
                    fetchProducts();
                } else {
                    console.warn("No authenticated user inside iframe yet. Trying to fetch anyway...");
                    // Try fetching in case rules are lax locally
                    fetchProducts();
                }
            });
        } else {
            fetchProducts();
        }
    };

    const renderProductSelect = () => {
        if (!productSelect) return;
        const currentSelectedId = productSelect.value;
        const productInfoDisplay = document.getElementById('product-info-display');
        const productCodeDisplay = document.getElementById('product-code-display');
        
        if (currentSelectedId && dbProducts.some(p => p.id === currentSelectedId)) {
            const selectedProduct = dbProducts.find(p => p.id === currentSelectedId);
            if (productInfoDisplay) {
                productInfoDisplay.textContent = selectedProduct.nameKo || selectedProduct.nameEn || '';
            }
            if (productCodeDisplay) {
                productCodeDisplay.textContent = `상품코드: ${selectedProduct.productCode || selectedProduct.id}`;
            }
        } else {
            productSelect.value = "";
            if (productInfoDisplay) {
                productInfoDisplay.textContent = "-- 상품을 검색하여 선택해 주세요 --";
            }
            if (productCodeDisplay) {
                productCodeDisplay.textContent = "상품코드: 미지정";
            }
            if (packingSelect) {
                packingSelect.innerHTML = '<option value="">-- 포장방법 선택 --</option>';
            }
        }
        
        if (typeof renderSearchModalTable === 'function') {
            renderSearchModalTable();
        }
    };

    const renderPackingSelect = () => {
        if (!productSelect || !packingSelect) return;
        const productId = productSelect.value;
        packingSelect.innerHTML = '<option value="">-- 포장방법 선택 --</option>';
        if (!productId) return;
        
        const product = dbProducts.find(p => p.id === productId);
        if (!product || !product.packingMethods) return;
        
        product.packingMethods.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const w = m.palletWidth || m.unitWidth || 0;
            const d = m.palletLength || m.unitLength || 0;
            const h = m.palletHeight || m.unitHeight || 0;
            const net = m.palletWeight || m.unitWeight || 0;
            const gross = m.palletGrossWeight || m.unitGrossWeight || 0;
            
            opt.textContent = `${m.name} [${m.packageType}] (${w}x${d}x${h}, Net:${net}kg, Gross:${gross}kg)`;
            packingSelect.appendChild(opt);
        });
    };

    const clearItemInputs = () => {
        document.getElementById('item-name').value = '';
        document.getElementById('item-package-type').value = 'Pallet';
        document.getElementById('item-content-details').value = '';
        document.getElementById('item-w').value = '';
        document.getElementById('item-d').value = '';
        document.getElementById('item-h').value = '';
        document.getElementById('item-net-weight').value = '';
        document.getElementById('item-gross-weight').value = '';
        document.getElementById('item-qty').value = '';
        document.getElementById('item-stackable').checked = true;
        document.getElementById('item-rotation').checked = true;
    };

    // Keep preset variables as dummies to avoid reference errors elsewhere in app.js
    const presetSelect = productSelect;
    let presets = [];
    const renderPresets = () => {};

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

    if (productSelect) {
        productSelect.addEventListener('change', () => {
            console.log("productSelect changed. Current value:", productSelect.value);
            renderPackingSelect();
            const productId = productSelect.value;
            if (productId) {
                const product = dbProducts.find(p => p.id === productId);
                console.log("Found product:", product);
                if (product && product.packingMethods && product.packingMethods.length > 0) {
                    const defaultMethod = product.packingMethods.find(m => m.isDefault) || product.packingMethods[0];
                    if (defaultMethod) {
                        console.log("Auto-selecting method:", defaultMethod.id);
                        packingSelect.value = defaultMethod.id;
                        packingSelect.dispatchEvent(new Event('change'));
                    }
                }
            } else {
                clearItemInputs();
            }
        });
    }

    if (packingSelect) {
        packingSelect.addEventListener('change', () => {
            console.log("packingSelect changed. Current value:", packingSelect.value);
            const productId = productSelect.value;
            const methodId = packingSelect.value;
            console.log("productId:", productId, "methodId:", methodId);
            if (!productId || !methodId) {
                clearItemInputs();
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            console.log("Product for packing select:", product);
            if (!product || !product.packingMethods) return;
            const m = product.packingMethods.find(item => item.id === methodId);
            console.log("Packing method found:", m);
            if (!m) return;

            try {
                const nameInput = document.getElementById('item-name');
                const typeSelect = document.getElementById('item-package-type');
                const detailsTextarea = document.getElementById('item-content-details');
                
                if (nameInput) nameInput.value = `${product.nameKo} (${m.name})`;
                if (typeSelect) typeSelect.value = m.packageType || 'Pallet';
                if (detailsTextarea) detailsTextarea.value = `${product.nameKo} / ${product.productCode || ''}`;
                
                const w = m.palletWidth || m.unitWidth || 0;
                const d = m.palletLength || m.unitLength || 0;
                const h = m.palletHeight || m.unitHeight || 0;
                const net = m.palletWeight || m.unitWeight || 0;
                const gross = m.palletGrossWeight || m.unitGrossWeight || 0;

                const wInput = document.getElementById('item-w');
                const dInput = document.getElementById('item-d');
                const hInput = document.getElementById('item-h');
                const netInput = document.getElementById('item-net-weight');
                const grossInput = document.getElementById('item-gross-weight');
                const qtyInput = document.getElementById('item-qty');
                const stackableCheckbox = document.getElementById('item-stackable');
                const rotationCheckbox = document.getElementById('item-rotation');

                if (wInput) wInput.value = w;
                if (dInput) dInput.value = d;
                if (hInput) hInput.value = h;
                if (netInput) netInput.value = net;
                if (grossInput) grossInput.value = gross;
                if (qtyInput) qtyInput.value = 1;
                if (stackableCheckbox) stackableCheckbox.checked = (m.stackable !== 'N');
                if (rotationCheckbox) rotationCheckbox.checked = (m.rotation !== 'N');
                
                console.log("Successfully populated form fields!");
            } catch (err) {
                console.error("Error populating form fields:", err);
            }
        });
    }

    // Modal Helper functions
    const showModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    };

    const hideModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    };


    // --- Product Search Subwindow Modal ---
    const productSearchModal = document.getElementById('product-search-modal');
    const btnSearchProduct = document.getElementById('btn-search-product');
    const btnCloseProductSearchModal = document.getElementById('btn-close-product-search-modal');
    const dbProductSearchInput = document.getElementById('db-product-search-input');
    const dbProductSearchTbody = document.getElementById('db-product-search-tbody');

    const renderSearchModalTable = () => {
        if (!dbProductSearchTbody) return;
        const query = (dbProductSearchInput ? dbProductSearchInput.value : '').toLowerCase().trim();
        
        const filtered = dbProducts.filter(p => {
            const nameKo = (p.nameKo || '').toLowerCase();
            const nameEn = (p.nameEn || '').toLowerCase();
            const code = (p.productCode || '').toLowerCase();
            return nameKo.includes(query) || nameEn.includes(query) || code.includes(query);
        });

        dbProductSearchTbody.innerHTML = '';
        if (filtered.length === 0) {
            dbProductSearchTbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 15px;">검색 결과가 없습니다.</td>
                </tr>
            `;
            return;
        }

        filtered.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            
            tr.addEventListener('click', () => {
                selectProductFromSearch(p.id);
            });

            tr.innerHTML = `
                <td><strong>${p.productCode || p.id}</strong></td>
                <td>
                    <div style="font-weight: 600;">${p.nameKo}</div>
                    ${p.nameEn ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${p.nameEn}</div>` : ''}
                </td>
                <td>${p.unit || 'KG'}</td>
                <td style="text-align: center;">
                    <button type="button" class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 0.75rem;">선택</button>
                </td>
            `;
            dbProductSearchTbody.appendChild(tr);
        });
    };

    const selectProductFromSearch = (productId) => {
        if (!productSelect) return;
        productSelect.value = productId;
        renderProductSelect();
        productSelect.dispatchEvent(new Event('change'));
        hideModal('product-search-modal');
    };

    if (btnSearchProduct) {
        btnSearchProduct.addEventListener('click', () => {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'REQUEST_PRODUCT_SEARCH' }, '*');
            } else {
                if (dbProductSearchInput) dbProductSearchInput.value = '';
                renderSearchModalTable();
                showModal('product-search-modal');
                if (dbProductSearchInput) dbProductSearchInput.focus();
            }
        });
    }

    if (btnCloseProductSearchModal) {
        btnCloseProductSearchModal.addEventListener('click', () => {
            hideModal('product-search-modal');
        });
    }

    if (dbProductSearchInput) {
        dbProductSearchInput.addEventListener('input', () => {
            renderSearchModalTable();
        });
    }

    const btnSaveAsPacking = document.getElementById('btn-save-as-packing');
    if (btnSaveAsPacking) {
        btnSaveAsPacking.addEventListener('click', () => {
            const productId = productSelect.value;
            if (!productId) {
                alert('포장 방법을 추가할 상품을 먼저 검색/선택해주세요.');
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            if (!product) return;

            const name = prompt('새 포장 방법의 명칭을 입력해주세요 (예: 팰릿 2단 적재):');
            if (name === null) return;
            const trimmedName = name.trim();
            if (!trimmedName) {
                alert('포장 방법 명칭은 필수입니다.');
                return;
            }

            const packageType = document.getElementById('item-package-type').value;
            const w = parseFloat(document.getElementById('item-w').value);
            const d = parseFloat(document.getElementById('item-d').value);
            const h = parseFloat(document.getElementById('item-h').value);
            const net = parseFloat(document.getElementById('item-net-weight').value);
            const gross = parseFloat(document.getElementById('item-gross-weight').value);
            const stackable = document.getElementById('item-stackable').checked ? 'Y' : 'N';
            const rotation = document.getElementById('item-rotation').checked ? 'Y' : 'N';

            if (isNaN(w) || isNaN(d) || isNaN(h) || isNaN(net) || isNaN(gross)) {
                alert('가로, 세로, 높이, 순중량, 총중량 값을 모두 올바르게 입력한 후 저장해주세요.');
                return;
            }

            const newMethod = {
                id: generateId(),
                name: trimmedName,
                packageType,
                unit: product.unit || 'KG',
                isDefault: false,
                stackable,
                rotation,
                palletWidth: w,
                palletLength: d,
                palletHeight: h,
                palletWeight: net,
                palletGrossWeight: gross,
                unitWidth: w,
                unitLength: d,
                unitHeight: h,
                unitWeight: net,
                unitGrossWeight: gross
            };

            const nextMethods = [...(product.packingMethods || [])];
            nextMethods.push(newMethod);

            window.db.collection('companies').doc('YSACC').collection('products').doc(productId).update({
                packingMethods: nextMethods
            }).then(() => {
                alert(`'${trimmedName}' 포장 방법이 상품 DB에 추가되었습니다.`);
                setTimeout(() => {
                    packingSelect.value = newMethod.id;
                    packingSelect.dispatchEvent(new Event('change'));
                }, 500);
            }).catch(err => {
                console.error(err);
                alert('저장 중 오류 발생: ' + err.message);
            });
        });
    }

    // Product Modals & Handlers
    const btnAddProduct = document.getElementById('btn-add-product');
    const btnEditProduct = document.getElementById('btn-edit-product');
    const btnDeleteProduct = document.getElementById('btn-delete-product');
    const dbProductModal = document.getElementById('db-product-modal');
    const dbProductForm = document.getElementById('db-product-form');
    const btnCloseDbProductModal = document.getElementById('btn-close-db-product-modal');
    const btnCancelDbProduct = document.getElementById('btn-cancel-db-product');

    if (btnAddProduct) {
        btnAddProduct.addEventListener('click', () => {
            document.getElementById('db-product-modal-title').innerHTML = '<i data-lucide="plus-circle"></i> 상품 추가';
            dbProductForm.reset();
            document.getElementById('db-product-id').value = '';
            showModal('db-product-modal');
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if (btnEditProduct) {
        btnEditProduct.addEventListener('click', () => {
            const productId = productSelect.value;
            if (!productId) {
                alert('수정할 상품을 선택해주세요.');
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            if (!product) return;

            document.getElementById('db-product-modal-title').innerHTML = '<i data-lucide="edit-3"></i> 상품 수정';
            document.getElementById('db-product-id').value = product.id;
            document.getElementById('db-product-name-ko').value = product.nameKo || '';
            document.getElementById('db-product-name-en').value = product.nameEn || '';
            document.getElementById('db-product-code').value = product.productCode || '';
            document.getElementById('db-product-unit').value = product.unit || 'KG';
            showModal('db-product-modal');
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if (btnDeleteProduct) {
        btnDeleteProduct.addEventListener('click', () => {
            const productId = productSelect.value;
            if (!productId) {
                alert('삭제할 상품을 선택해주세요.');
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            if (!product) return;

            if (confirm(`'${product.nameKo}' 상품을 삭제하시겠습니까? 관련 포장 정보도 함께 제거됩니다.`)) {
                window.db.collection('companies').doc('YSACC').collection('products').doc(productId).delete()
                    .then(() => {
                        alert('상품이 삭제되었습니다.');
                    })
                    .catch(err => {
                        console.error(err);
                        alert('삭제 중 오류가 발생했습니다.');
                    });
            }
        });
    }

    if (btnCloseDbProductModal) btnCloseDbProductModal.addEventListener('click', () => hideModal('db-product-modal'));
    if (btnCancelDbProduct) btnCancelDbProduct.addEventListener('click', () => hideModal('db-product-modal'));

    if (dbProductForm) {
        dbProductForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('db-product-id').value;
            const nameKo = document.getElementById('db-product-name-ko').value.trim();
            const nameEn = document.getElementById('db-product-name-en').value.trim();
            const productCode = document.getElementById('db-product-code').value.trim();
            const unit = document.getElementById('db-product-unit').value.trim();

            if (!nameKo || !productCode) {
                alert('필수 값을 채워주세요.');
                return;
            }

            const ref = window.db.collection('companies').doc('YSACC').collection('products');
            if (id) {
                ref.doc(id).update({
                    nameKo, nameEn, productCode, unit
                }).then(() => {
                    hideModal('db-product-modal');
                }).catch(err => {
                    console.error(err);
                    alert('저장 중 오류 발생: ' + err.message);
                });
            } else {
                ref.doc(productCode).set({
                    nameKo, nameEn, productCode, unit,
                    packingMethods: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    hideModal('db-product-modal');
                    setTimeout(() => {
                        productSelect.value = productCode;
                        productSelect.dispatchEvent(new Event('change'));
                    }, 500);
                }).catch(err => {
                    console.error(err);
                    alert('저장 중 오류 발생: ' + err.message);
                });
            }
        });
    }

    // Packing Method Modals & Handlers
    const btnAddPacking = document.getElementById('btn-add-packing');
    const btnEditPacking = document.getElementById('btn-edit-packing');
    const btnDeletePacking = document.getElementById('btn-delete-packing');
    const dbPackingModal = document.getElementById('db-packing-modal');
    const dbPackingForm = document.getElementById('db-packing-form');
    const btnCloseDbPackingModal = document.getElementById('btn-close-db-packing-modal');
    const btnCancelDbPacking = document.getElementById('btn-cancel-db-packing');

    if (btnAddPacking) {
        btnAddPacking.addEventListener('click', () => {
            const productId = productSelect.value;
            if (!productId) {
                alert('상품을 먼저 선택해주세요.');
                return;
            }
            document.getElementById('db-packing-modal-title').innerHTML = '<i data-lucide="plus-circle"></i> 포장 방법 추가';
            dbPackingForm.reset();
            document.getElementById('db-packing-id').value = '';
            document.getElementById('db-packing-stackable').checked = true;
            document.getElementById('db-packing-rotation').checked = true;
            document.getElementById('db-packing-is-default').checked = false;
            showModal('db-packing-modal');
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if (btnEditPacking) {
        btnEditPacking.addEventListener('click', () => {
            const productId = productSelect.value;
            const methodId = packingSelect.value;
            if (!productId || !methodId) {
                alert('수정할 포장 방법을 선택해주세요.');
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            if (!product || !product.packingMethods) return;
            const m = product.packingMethods.find(item => item.id === methodId);
            if (!m) return;

            document.getElementById('db-packing-modal-title').innerHTML = '<i data-lucide="edit-3"></i> 포장 방법 수정';
            document.getElementById('db-packing-id').value = m.id;
            document.getElementById('db-packing-name').value = m.name || '';
            document.getElementById('db-packing-type').value = m.packageType || 'Pallet';
            document.getElementById('db-packing-is-default').checked = !!m.isDefault;
            
            const w = m.palletWidth || m.unitWidth || '';
            const d = m.palletLength || m.unitLength || '';
            const h = m.palletHeight || m.unitHeight || '';
            const net = m.palletWeight || m.unitWeight || '';
            const gross = m.palletGrossWeight || m.unitGrossWeight || '';

            document.getElementById('db-packing-w').value = w;
            document.getElementById('db-packing-l').value = d;
            document.getElementById('db-packing-h').value = h;
            document.getElementById('db-packing-net').value = net;
            document.getElementById('db-packing-gross').value = gross;
            document.getElementById('db-packing-stackable').checked = (m.stackable !== 'N');
            document.getElementById('db-packing-rotation').checked = (m.rotation !== 'N');
            
            showModal('db-packing-modal');
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if (btnDeletePacking) {
        btnDeletePacking.addEventListener('click', () => {
            const productId = productSelect.value;
            const methodId = packingSelect.value;
            if (!productId || !methodId) {
                alert('삭제할 포장 방법을 선택해주세요.');
                return;
            }
            const product = dbProducts.find(p => p.id === productId);
            if (!product || !product.packingMethods) return;
            const m = product.packingMethods.find(item => item.id === methodId);
            if (!m) return;

            if (confirm(`'${m.name}' 포장 방법을 삭제하시겠습니까?`)) {
                const nextMethods = product.packingMethods.filter(item => item.id !== methodId);
                window.db.collection('companies').doc('YSACC').collection('products').doc(productId).update({
                    packingMethods: nextMethods
                }).then(() => {
                    alert('포장 방법이 삭제되었습니다.');
                }).catch(err => {
                    console.error(err);
                    alert('삭제 중 오류가 발생했습니다.');
                });
            }
        });
    }

    if (btnCloseDbPackingModal) btnCloseDbPackingModal.addEventListener('click', () => hideModal('db-packing-modal'));
    if (btnCancelDbPacking) btnCancelDbPacking.addEventListener('click', () => hideModal('db-packing-modal'));

    if (dbPackingForm) {
        dbPackingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const productId = productSelect.value;
            if (!productId) return;
            const product = dbProducts.find(p => p.id === productId);
            if (!product) return;

            const id = document.getElementById('db-packing-id').value || generateId();
            const name = document.getElementById('db-packing-name').value.trim();
            const packageType = document.getElementById('db-packing-type').value;
            const isDefault = document.getElementById('db-packing-is-default').checked;
            const w = parseFloat(document.getElementById('db-packing-w').value);
            const d = parseFloat(document.getElementById('db-packing-l').value);
            const h = parseFloat(document.getElementById('db-packing-h').value);
            const net = parseFloat(document.getElementById('db-packing-net').value);
            const gross = parseFloat(document.getElementById('db-packing-gross').value);
            const stackable = document.getElementById('db-packing-stackable').checked ? 'Y' : 'N';
            const rotation = document.getElementById('db-packing-rotation').checked ? 'Y' : 'N';

            if (!name || isNaN(w) || isNaN(d) || isNaN(h) || isNaN(net) || isNaN(gross)) {
                alert('필수 값을 모두 올바르게 채워주세요.');
                return;
            }

            const newMethod = {
                id,
                name,
                packageType,
                unit: product.unit || 'KG',
                isDefault,
                stackable,
                rotation,
                palletWidth: w,
                palletLength: d,
                palletHeight: h,
                palletWeight: net,
                palletGrossWeight: gross,
                unitWidth: w,
                unitLength: d,
                unitHeight: h,
                unitWeight: net,
                unitGrossWeight: gross
            };

            let nextMethods = [...(product.packingMethods || [])];
            const existingIndex = nextMethods.findIndex(item => item.id === id);
            
            if (existingIndex > -1) {
                nextMethods[existingIndex] = newMethod;
            } else {
                nextMethods.push(newMethod);
            }

            if (isDefault) {
                nextMethods = nextMethods.map(item => {
                    if (item.id !== id) {
                        return { ...item, isDefault: false };
                    }
                    return item;
                });
            }

            window.db.collection('companies').doc('YSACC').collection('products').doc(productId).update({
                packingMethods: nextMethods
            }).then(() => {
                hideModal('db-packing-modal');
                setTimeout(() => {
                    packingSelect.value = id;
                    packingSelect.dispatchEvent(new Event('change'));
                }, 500);
            }).catch(err => {
                console.error(err);
                alert('저장 중 오류 발생: ' + err.message);
            });
        });
    }

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
        
        hideModal('cargo-form-modal');
        renderItems();
    });

    btnCancelEdit.addEventListener('click', () => {
        itemForm.reset();
        exitEditMode();
    });

    const exitEditMode = () => {
        editItemId.value = '';
        if (btnSubmitItem) btnSubmitItem.textContent = '확용';
        if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
        hideModal('cargo-form-modal');
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

        // Auto-populate visible product displays & packing select in the UI
        let matchedProductId = '';
        const codeMatch = (item.name || '').match(/^\[(.*?)\]/);
        if (codeMatch) {
            const productCode = codeMatch[1];
            const prod = dbProducts.find(p => p.productCode === productCode || p.id === productCode);
            if (prod) {
                matchedProductId = prod.id;
            }
        }
        if (!matchedProductId) {
            const prod = dbProducts.find(p => p.nameKo === item.name || p.nameEn === item.name);
            if (prod) {
                matchedProductId = prod.id;
            }
        }

        if (matchedProductId) {
            const productSelect = document.getElementById('product-select');
            if (productSelect) {
                productSelect.value = matchedProductId;
                renderProductSelect();
                renderPackingSelect();
                
                const product = dbProducts.find(p => p.id === matchedProductId);
                if (product && product.packingMethods) {
                    const method = product.packingMethods.find(m => 
                        (m.palletWidth === item.w && m.palletLength === item.d && m.palletHeight === item.h) ||
                        m.methodName === item.packageType
                    );
                    if (method) {
                        const packingSelect = document.getElementById('packing-select');
                        if (packingSelect) packingSelect.value = method.id || method.methodName || '';
                    }
                }
            }
        } else {
            const productSelect = document.getElementById('product-select');
            if (productSelect) productSelect.value = '';
            renderProductSelect();
        }

        if (btnSubmitItem) btnSubmitItem.textContent = '수정 완료';
        if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');

        // Set editing title & show modal
        const cargoModalTitle = document.getElementById('cargo-modal-title');
        if (cargoModalTitle) cargoModalTitle.innerHTML = '<i data-lucide="edit-3"></i> 화물(팔레트) 수정';
        showModal('cargo-form-modal');
        if (window.lucide) window.lucide.createIcons();
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

    const cargoListCardsContainer = document.getElementById('cargo-list-cards-container');

    const getContainerCapacities = () => {
        const CONTAINERS = {
            'LCL': { l: 5898, w: 2352, h: 2393, maxWeight: 28200 },
            '20GP': { l: 5898, w: 2352, h: 2393, maxWeight: 28200 },
            '20RF': { l: 5444, w: 2290, h: 2276, maxWeight: 27000 },
            '20DG': { l: 5898, w: 2352, h: 2393, maxWeight: 28200 },
            '40GP': { l: 12032, w: 2352, h: 2393, maxWeight: 28800 },
            '40HC': { l: 12032, w: 2352, h: 2698, maxWeight: 28800 },
            '40HQ': { l: 12032, w: 2352, h: 2698, maxWeight: 28800 },
            '40DG': { l: 12032, w: 2352, h: 2393, maxWeight: 28800 }
        };
        let totalVol = 0;
        let totalWeight = 0;
        
        ['LCL', '20GP', '20RF', '20DG', '40GP', '40HC', '40HQ', '40DG'].forEach(type => {
            const qtyInput = document.getElementById(`qty-${type}`);
            const qty = qtyInput ? parseInt(qtyInput.value, 10) || 0 : 0;
            if (qty > 0) {
                const c = CONTAINERS[type];
                const vol = (c.l * c.w * c.h) / 1000000000;
                totalVol += vol * qty;
                totalWeight += c.maxWeight * qty;
            }
        });
        return { volume: totalVol, weight: totalWeight };
    };

    const updateSummaryStatusBadge = () => {
        const summaryStatusBadge = document.getElementById('summary-status-badge');
        if (!summaryStatusBadge) return;

        if (currentResults.length === 0) {
            summaryStatusBadge.innerHTML = `<i data-lucide="help-circle" style="width: 16px; height: 16px; color: #64748b;"></i> 적재 대기중`;
            summaryStatusBadge.style.background = '#f1f5f9';
            summaryStatusBadge.style.borderColor = '#cbd5e1';
            summaryStatusBadge.style.color = '#475569';
        } else {
            const lastResult = currentResults[currentResults.length - 1];
            const hasUnloaded = lastResult && lastResult.unloaded && lastResult.unloaded.length > 0;
            if (hasUnloaded) {
                const count = lastResult.unloaded.length;
                summaryStatusBadge.innerHTML = `<i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #ef4444;"></i> 미적재 ${count}건 발생`;
                summaryStatusBadge.style.background = '#fef2f2';
                summaryStatusBadge.style.borderColor = '#fca5a5';
                summaryStatusBadge.style.color = '#b91c1c';
            } else {
                summaryStatusBadge.innerHTML = `<i data-lucide="check-circle-2" style="width: 16px; height: 16px; color: #10b981;"></i> 전량 적재 완료`;
                summaryStatusBadge.style.background = '#ecfdf5';
                summaryStatusBadge.style.borderColor = '#a7f3d0';
                summaryStatusBadge.style.color = '#047857';
            }
        }
        if (window.lucide) window.lucide.createIcons();
    };

    const renderItems = () => {
        if (!cargoListCardsContainer) return;
        cargoListCardsContainer.innerHTML = '';
        
        const badge = document.getElementById('cargo-list-badge');
        if (badge) badge.textContent = currentItems.length.toLocaleString();

        if (currentItems.length === 0) {
            cargoListCardsContainer.innerHTML = '<div style="text-align: center; padding: 30px 10px; color: #64748b; font-size: 0.85rem;">등록된 화물이 없습니다.</div>';
        } else {
            currentItems.forEach(item => {
                const nwUse = item.netWeight !== undefined ? item.netWeight : 0;
                const gwUse = item.grossWeight !== undefined ? item.grossWeight : item.weight;
                
                const netDisp = nwUse ? nwUse.toLocaleString() : '-';
                const grossDisp = gwUse ? gwUse.toLocaleString() : '-';
                const itemVol = ((item.w * item.d * item.h) / 1000000000) * item.qty;

                const card = document.createElement('div');
                card.className = 'cargo-card';
                card.innerHTML = `
                    <div class="cargo-card-header">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                            <input type="checkbox" class="item-checkbox" data-id="${item.id}" style="width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; margin: 0;">
                            <span class="cargo-card-title" style="flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.name}</span>
                        </div>
                        <div class="cargo-card-actions">
                            <button type="button" class="cargo-card-action-btn" onclick="duplicateItem('${item.id}')" title="복사"><i data-lucide="copy" style="width:14px; height:14px;"></i></button>
                            <button type="button" class="cargo-card-action-btn" onclick="editItem('${item.id}')" title="수정"><i data-lucide="edit-2" style="width:14px; height:14px;"></i></button>
                            <button type="button" class="cargo-card-action-btn delete" onclick="deleteItem('${item.id}')" title="삭제"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                        </div>
                    </div>
                    <div class="cargo-card-meta">
                        <div>포장: ${item.packageType || 'Pallet'}</div>
                        <div>규격: ${item.w} × ${item.d} × ${item.h} mm</div>
                        <div>중량: ${netDisp} / ${grossDisp} kg</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 6px;">
                        <div class="cargo-card-badges">
                            <span class="cargo-card-badge ${item.stackable ? 'success' : 'info'}">${item.stackable ? '다단적재' : '다단불가'}</span>
                            <span class="cargo-card-badge ${item.rotation ? 'success' : 'info'}">${item.rotation ? '회전허용' : '회전불가'}</span>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #2563eb;">${itemVol.toFixed(3)} CBM</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 2px;">
                        <span>수량: <strong>${item.qty}</strong> 개</span>
                    </div>
                `;
                cargoListCardsContainer.appendChild(card);
            });
            if (window.lucide) window.lucide.createIcons();
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

        const caps = getContainerCapacities();
        const volumeRate = caps.volume > 0 ? (volume / caps.volume) * 100 : 0;
        const weightRate = caps.weight > 0 ? (grossWeight / caps.weight) * 100 : 0;

        const summaryVolumeRate = document.getElementById('summary-volume-rate');
        const summaryVolumeProgress = document.getElementById('summary-volume-progress');
        const summaryVolumeUsed = document.getElementById('summary-volume-used');
        const summaryWeightRate = document.getElementById('summary-weight-rate');
        const summaryWeightProgress = document.getElementById('summary-weight-progress');
        const summaryWeightUsed = document.getElementById('summary-weight-used');
        const summaryTotalQty = document.getElementById('summary-total-qty');
        const summaryTotalVolume = document.getElementById('summary-total-volume');
        const summaryTotalWeight = document.getElementById('summary-total-weight');

        if (summaryVolumeRate) summaryVolumeRate.textContent = `${volumeRate.toFixed(2)}%`;
        if (summaryVolumeProgress) summaryVolumeProgress.style.width = `${Math.min(volumeRate, 100)}%`;
        if (summaryVolumeUsed) summaryVolumeUsed.textContent = `${volume.toFixed(2)} / ${caps.volume.toFixed(2)} CBM`;
        if (summaryWeightRate) summaryWeightRate.textContent = `${weightRate.toFixed(2)}%`;
        if (summaryWeightProgress) summaryWeightProgress.style.width = `${Math.min(weightRate, 100)}%`;
        if (summaryWeightUsed) summaryWeightUsed.textContent = `${grossWeight.toLocaleString()} / ${caps.weight.toLocaleString()} kg`;
        
        if (summaryTotalQty) summaryTotalQty.textContent = qty.toLocaleString();
        if (summaryTotalVolume) summaryTotalVolume.textContent = volume.toFixed(3);
        if (summaryTotalWeight) summaryTotalWeight.textContent = grossWeight.toLocaleString();

        updateSummaryStatusBadge();
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
    const btnImportFile = document.getElementById('btn-import-file');
    const inputImportFile = document.getElementById('input-import-file');

    if (window.parent !== window || window.opener) {
        if (btnExportPacking) btnExportPacking.classList.remove('hidden');
        if (btnImportFile) btnImportFile.classList.remove('hidden');
        
        const btnLoad = document.getElementById('btn-load-project');
        const btnSave = document.getElementById('btn-save-project');
        const btnSaveAs = document.getElementById('btn-save-as-project');
        if (btnLoad) btnLoad.style.display = 'none';
        if (btnSave) btnSave.style.display = 'none';
        if (btnSaveAs) btnSaveAs.style.display = 'none';
    }

    // 파일 불러오기 버튼 핸들러
    if (btnImportFile && inputImportFile) {
        btnImportFile.addEventListener('click', () => {
            inputImportFile.click();
        });

        inputImportFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const proj = JSON.parse(event.target.result);
                    if (!proj.items || !proj.containerQuantities) {
                        alert('올바른 적재결과 JSON 파일이 아닙니다.');
                        return;
                    }

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
                    
                    // 파일 불러온 뒤 시뮬레이션 자동 재실행
                    if (currentItems.length > 0) {
                        const btnRunSim = document.getElementById('btn-run-simulation');
                        if (btnRunSim) btnRunSim.click();
                    }
                    alert('적재결과 JSON 파일이 성공적으로 로드되었습니다.');
                } catch (err) {
                    alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
                }
            };
            reader.readAsText(file);
            // Reset value to allow loading same file again
            inputImportFile.value = '';
        });
    }

    if (btnExportPacking) {
        btnExportPacking.addEventListener('click', () => {
            const projectData = getProjectData();
            
            // Capture 3D Canvas
            let screenshotDataUrl = null;
            try {
                const canvas = document.querySelector('#export-area canvas') || document.querySelector('canvas');
                if (canvas) {
                    screenshotDataUrl = canvas.toDataURL('image/png');
                }
            } catch (err) {
                console.error("Canvas screenshot capture failed", err);
            }
            
            const summary = {
                projectData: projectData,
                simulationImageBase64: screenshotDataUrl // Add screenshot data URL
            };
            
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'CONTAINER_SIMULATION_RESULT', data: summary }, '*');
                window.parent.postMessage({ type: 'EXPORT_PACKING_LIST', containers: [], raw3DPlan: projectData }, '*');
                alert('💾 컨테이너 적재 결과가 성공적으로 수주 및 3D 적재 계획 보관함에 보관되었습니다.');
            } else if (window.opener) {
                window.opener.postMessage({ type: 'CONTAINER_SIMULATION_RESULT', data: summary }, '*');
                alert('👍 적재 프로젝트와 3D 캡처 이미지가 견적서 화면으로 자동 연계 전송되었습니다.');
            } else {
                // Fallback file download code
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `${projectData.projectName || 'loading_plan'}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
            }
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
            window.currentResults = currentResults;
            window.currentResultIndex = currentResultIndex;
            window.itemColors = itemColors;
            initialResults = JSON.parse(JSON.stringify(currentResults));
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
            const isSelected = selectedPalletGlobalIndex === item.globalIndex;
            
            const tr = document.createElement('tr');
            tr.id = `packing-row-${item.globalIndex}`;
            tr.style.cursor = 'pointer';
            if (isSelected) {
                tr.style.background = '#eff6ff';
                tr.style.outline = '2px solid #3b82f6';
            }
            tr.onclick = (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    selectPalletForAdjustment(item.globalIndex);
                }
            };
            
            const pkgNoDisplay = item.pkgNo ? item.pkgNo : String(item.globalIndex);
            tr.innerHTML = `
                <td><strong>${item.globalIndex}</strong></td>
                <td style="text-align: center;">
                    <span style="display: inline-block; padding: 3px 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 800; font-size: 0.82rem;">
                        ${pkgNoDisplay}
                    </span>
                </td>
                <td>${item.name} <small class="text-muted">(${item.itemIndex})</small>${pkgTypeDisp}${detailsDisp}</td>
                <td>${item.packedL} × ${item.packedW} × ${item.packedH}</td>
                <td>${netDisp}</td>
                <td>${grossDisp}</td>
                <td style="font-family: monospace; font-size: 0.8rem; color: #0369a1; font-weight: 600;">
                    X: ${item.x} / Y: ${item.y} / Z: ${item.z}
                </td>
                <td><span style="color: var(--success-color); font-weight: 600;">적재완료</span></td>
                <td>
                    <button type="button" class="btn btn-sm" onclick="selectPalletForAdjustment(${item.globalIndex})" style="background: ${isSelected ? '#1d4ed8' : '#3b82f6'}; color: #fff; border: none; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">
                        🛠️ 위치조정
                    </button>
                </td>
            `;
            packingListTbody.appendChild(tr);
        });
    };

    const renderSimulationResult = () => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        
        const sidebarStatsContainer = document.getElementById('sidebar-stats-container');
        
        if (!currentResult) {
            simulationResultEl.classList.remove('hidden');
            vizContainer.classList.add('hidden');
            if (sidebarStatsContainer) sidebarStatsContainer.classList.add('hidden');
            unloadedListEl.innerHTML = '<li class="empty-list">시뮬레이션 결과가 없습니다.</li>';
            btnPrintPreview.classList.add('hidden');
            packingListContainer.classList.add('hidden');
            lucide.createIcons();
            return;
        }

        btnPrintPreview.classList.remove('hidden');
        simulationResultEl.classList.add('hidden');

        const loadedCount = currentResult.loaded.length;
        const unloadedCount = currentResult.unloaded.length;
        const m = currentResult.metrics;
        
        // Count total used containers
        const containerCounts = {};
        currentResults.forEach(r => {
            containerCounts[r.container] = (containerCounts[r.container] || 0) + 1;
        });
        const containerSummaryStr = Object.entries(containerCounts).map(([type, count]) => `${type} ${count}대`).join(', ');

        if (sidebarStatsContainer) {
            sidebarStatsContainer.classList.remove('hidden');
            sidebarStatsContainer.innerHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div class="card" style="padding: 10px; margin-bottom: 0;">
                            <h4 style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">용적률 (부피)</h4>
                            <div style="font-size: 1.25rem; font-weight: bold; color: var(--primary-color);">${m.utilizationRate.toFixed(2)}%</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                                적재됨: ${m.loadedVolume.toFixed(2)} / ${m.totalVolume.toFixed(2)} CBM
                            </div>
                        </div>
                        <div class="card" style="padding: 10px; margin-bottom: 0;">
                            <h4 style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">중량 사용률</h4>
                            <div style="font-size: 1.25rem; font-weight: bold; color: var(--primary-color);">${((m.loadedWeight / m.maxWeight) * 100).toFixed(2)}%</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                                적재됨: ${m.loadedWeight.toLocaleString()} / ${m.maxWeight.toLocaleString()} kg
                            </div>
                        </div>
                    </div>

                    <div class="card" style="padding: 8px; background: rgba(255,255,255,0.02); line-height: 1.4; margin-bottom: 0; border-color: #e2e8f0;">
                        <div style="font-size: 0.75rem; color: #1e293b;">
                            이론적 잔여 부피: <strong>${m.remainingVolume.toFixed(2)} CBM</strong><br/>
                            (연속 공간: ${m.maxContinuousVolume.toFixed(2)} CBM / 조각: ${m.fragmentedCount}개)
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
                            ⚠️ 실제 사용 공간은 조각 형태에 따라 다를 수 있습니다.
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; padding: 8px; border: 1px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; color: #334155; font-weight: 500;">
                        <div style="display:flex; justify-content:space-between;"><span>총 사용 컨테이너:</span><span style="color:var(--primary-color); font-weight:700;">${containerSummaryStr}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>현재 컨테이너:</span><span style="font-weight:700; color:#0f172a;">${currentResult.container}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>적재된 팔레트:</span><span style="font-weight:700; color:#0f172a;">${loadedCount}개</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>잔여 허용 중량:</span><span style="font-weight:700; color:#0f172a;">${m.remainingWeight.toLocaleString()} kg</span></div>
                    </div>
                </div>
            `;
        }
        
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
                setTimeout(() => window.Viewer3D.resize(), 50);
            }
            
            // Render Packing List
            renderPackingList(currentResult.loaded);
        } else {
            vizContainer.classList.add('hidden');
            packingListContainer.classList.add('hidden');
        }
    };
    
    // Reset Layout to Initial Simulation State
    const resetToInitialLayout = () => {
        if (!initialResults || initialResults.length === 0) {
            alert('초기 시뮬레이션 결과가 없습니다.');
            return;
        }
        if (confirm('모든 화물의 위치를 초기 자동 적재(시뮬레이션) 상태로 원상복귀하시겠습니까?')) {
            currentResults = JSON.parse(JSON.stringify(initialResults));
            selectedPalletGlobalIndex = null;
            if (palletAdjustPanel) palletAdjustPanel.classList.add('hidden');
            renderSimulationResult();
            if (window.Viewer3D) {
                window.Viewer3D.clearScene();
                window.Viewer3D.update(currentResults[currentResultIndex], itemColors);
                window.Viewer3D.setCamera('iso');
            }
        }
    };

    document.querySelectorAll('.btn-reset-all-layout').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            resetToInitialLayout();
        });
    });

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
                            <th style="background:#eff6ff; border:1px solid #cbd5e1; padding:8px; color:#1e40af;">PKG NO.</th>
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
                        <td style="border:1px solid #cbd5e1; padding:8px; text-align:center; font-weight:bold; color:#1d4ed8;">${item.pkgNo || item.globalIndex}</td>
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
        // Force resize and camera fit on 3D viewer when it becomes visible
        if (window.Viewer3D) {
            setTimeout(() => {
                window.Viewer3D.resize();
                window.Viewer3D.setCamera('iso');
            }, 60);
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

    // 3D View Mode vs Edit Mode Button Bindings
    const btnMode3DView = document.getElementById('btn-mode-3d-view');
    const btnMode3DEdit = document.getElementById('btn-mode-3d-edit');
    if (btnMode3DView) {
        btnMode3DView.addEventListener('click', () => {
            if (window.Viewer3D) window.Viewer3D.setMode('view');
        });
    }
    if (btnMode3DEdit) {
        btnMode3DEdit.addEventListener('click', () => {
            if (window.Viewer3D) window.Viewer3D.setMode('edit');
        });
    }

    let hoveredPalletGlobalIndex = null;
    let isDragging2D = false;
    let draggedPalletItem = null;
    let dragStartMouseX = 0;
    let dragStartMouseY = 0;
    let dragItemStartX = 0;
    let dragItemStartY = 0;
    let dragItemStartZ = 0;
    let hasMovedDuringDrag = false;

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
        const wrapperEl = document.querySelector('.canvas-wrapper');
        const wrapperWidth = targetWidth || (wrapperEl ? wrapperEl.clientWidth - 20 : 800); 
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

            const isSelected = selectedPalletGlobalIndex === item.globalIndex;
            const isHovered = hoveredPalletGlobalIndex === item.globalIndex && !isDragging2D;
            const isDragged = isDragging2D && draggedPalletItem && draggedPalletItem.globalIndex === item.globalIndex;

            // Draw Block Fill
            targetCtx.fillStyle = itemColors[item.name] || '#3b82f6';
            targetCtx.fillRect(rx, ry, rw, rh);
            
            // Draw Block Border & Selection Highlight
            if (isDragged) {
                targetCtx.strokeStyle = '#f59e0b';
                targetCtx.lineWidth = 3;
                targetCtx.setLineDash([4, 4]);
                targetCtx.strokeRect(rx, ry, rw, rh);
                targetCtx.setLineDash([]);
            } else if (isSelected) {
                targetCtx.strokeStyle = '#eab308'; // Bright yellow
                targetCtx.lineWidth = 3;
                targetCtx.strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);
            } else if (isHovered) {
                targetCtx.strokeStyle = '#38bdf8';
                targetCtx.lineWidth = 2;
                targetCtx.strokeRect(rx, ry, rw, rh);
            } else {
                targetCtx.strokeStyle = 'rgba(0,0,0,0.5)';
                targetCtx.lineWidth = 1;
                targetCtx.strokeRect(rx, ry, rw, rh);
            }

            // Text Label
            if (rw > 25 && rh > 12) {
                targetCtx.fillStyle = '#ffffff';
                targetCtx.font = isSelected ? 'bold 11px Inter, sans-serif' : 'bold 10px Inter, sans-serif';
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                
                let label = `[${item.globalIndex}] ${item.name}-${item.itemIndex}`;
                if (rw < 50) label = `[${item.globalIndex}]`;
                
                const maxWidth = Math.max(10, rw - 6);
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

                targetCtx.shadowColor = 'rgba(0,0,0,0.85)';
                targetCtx.shadowBlur = 3;

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

            // Draw Position Badge if Dragged
            if (isDragged) {
                targetCtx.save();
                const badgeTxt = `X: ${item.x} | Y: ${item.y} | Z: ${item.z}`;
                targetCtx.font = 'bold 11px Inter, sans-serif';
                const bW = targetCtx.measureText(badgeTxt).width + 12;
                targetCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                targetCtx.fillRect(rx + rw/2 - bW/2, ry - 22, bW, 20);
                targetCtx.strokeStyle = '#f59e0b';
                targetCtx.lineWidth = 1;
                targetCtx.strokeRect(rx + rw/2 - bW/2, ry - 22, bW, 20);
                targetCtx.fillStyle = '#fbbf24';
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                targetCtx.fillText(badgeTxt, rx + rw/2, ry - 12);
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

    // =========================================================================
    // --- 2D Canvas Interactive Mouse Drag & Drop Positioning ---
    // =========================================================================
    const get2DItemAtCoords = (mouseX, mouseY) => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        if (!currentResult || !currentResult.loaded || !canvas) return null;

        const container = currentResult.dimensions;
        let worldWidth = container.l;
        const scale = canvas.width / worldWidth;

        const worldX = mouseX / scale;
        const view = currentVizView;

        if (view === 'top') {
            const worldY = mouseY / scale;
            // Find all matching items, select topmost (highest Z) or currently selected
            const matching = currentResult.loaded.filter(item => 
                worldX >= item.x && worldX <= item.x + item.packedL &&
                worldY >= item.y && worldY <= item.y + item.packedW
            );
            if (matching.length === 0) return null;
            if (matching.some(i => i.globalIndex === selectedPalletGlobalIndex)) {
                return matching.find(i => i.globalIndex === selectedPalletGlobalIndex);
            }
            matching.sort((a, b) => b.z - a.z);
            return matching[0];
        } else if (view === 'left_side' || view === 'right_side') {
            const worldZ = (canvas.height - mouseY) / scale;
            const matching = currentResult.loaded.filter(item => 
                worldX >= item.x && worldX <= item.x + item.packedL &&
                worldZ >= item.z && worldZ <= item.z + item.packedH
            );
            if (matching.length === 0) return null;
            if (matching.some(i => i.globalIndex === selectedPalletGlobalIndex)) {
                return matching.find(i => i.globalIndex === selectedPalletGlobalIndex);
            }
            matching.sort((a, b) => (view === 'left_side' ? a.y - b.y : b.y - a.y));
            return matching[0];
        }
        return null;
    };

    const getCanvasMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const mouseX = (clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (clientY - rect.top) * (canvas.height / rect.height);
        return { mouseX, mouseY };
    };

    if (canvas) {
        // 1. Mouse Down (Drag Start / Selection)
        const handleDragStart = (e) => {
            const { mouseX, mouseY } = getCanvasMousePos(e);
            const item = get2DItemAtCoords(mouseX, mouseY);
            if (item) {
                isDragging2D = true;
                hasMovedDuringDrag = false;
                draggedPalletItem = item;
                dragStartMouseX = mouseX;
                dragStartMouseY = mouseY;
                dragItemStartX = item.x;
                dragItemStartY = item.y;
                dragItemStartZ = item.z;

                selectPalletForAdjustment(item.globalIndex);
                canvas.style.cursor = 'grabbing';
                drawVisualization();
            }
        };

        canvas.addEventListener('mousedown', handleDragStart);
        canvas.addEventListener('touchstart', handleDragStart, { passive: true });

        // 2. Mouse Move (Dragging with Smart Snapping & Drag Threshold)
        const handleDragMove = (e) => {
            const { mouseX, mouseY } = getCanvasMousePos(e);

            if (isDragging2D && draggedPalletItem) {
                // Minimum movement threshold (8px) before actually modifying pallet position
                const distMovedPx = Math.hypot(mouseX - dragStartMouseX, mouseY - dragStartMouseY);
                if (!hasMovedDuringDrag && distMovedPx < 8) {
                    return;
                }
                hasMovedDuringDrag = true;

                const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
                if (!currentResult) return;
                const container = currentResult.dimensions;
                const scale = canvas.width / container.l;

                const deltaX = (mouseX - dragStartMouseX) / scale;
                const view = currentVizView;

                if (view === 'top') {
                    const deltaY = (mouseY - dragStartMouseY) / scale;
                    let targetX = dragItemStartX + deltaX;
                    let targetY = dragItemStartY + deltaY;

                    // Smart Magnetic Snapping (100mm tolerance)
                    const snapDist = 100;
                    let snappedX = false;
                    let snappedY = false;

                    // Snap to Container Walls
                    if (Math.abs(targetX) < snapDist) { targetX = 0; snappedX = true; }
                    else if (Math.abs(targetX + draggedPalletItem.packedL - container.l) < snapDist) {
                        targetX = container.l - draggedPalletItem.packedL;
                        snappedX = true;
                    }

                    if (Math.abs(targetY) < snapDist) { targetY = 0; snappedY = true; }
                    else if (Math.abs(targetY + draggedPalletItem.packedW - container.w) < snapDist) {
                        targetY = container.w - draggedPalletItem.packedW;
                        snappedY = true;
                    }
                    else if (Math.abs(targetY - (container.w - draggedPalletItem.packedW) / 2) < snapDist) {
                        targetY = Math.round((container.w - draggedPalletItem.packedW) / 2);
                        snappedY = true;
                    }

                    // Snap to Other Pallets
                    currentResult.loaded.forEach(other => {
                        if (other.globalIndex === draggedPalletItem.globalIndex) return;

                        // X-axis alignment
                        if (!snappedX) {
                            if (Math.abs(targetX - (other.x + other.packedL)) < snapDist) { targetX = other.x + other.packedL; snappedX = true; }
                            else if (Math.abs(targetX + draggedPalletItem.packedL - other.x) < snapDist) { targetX = other.x - draggedPalletItem.packedL; snappedX = true; }
                            else if (Math.abs(targetX - other.x) < snapDist) { targetX = other.x; snappedX = true; }
                        }

                        // Y-axis alignment
                        if (!snappedY) {
                            if (Math.abs(targetY - (other.y + other.packedW)) < snapDist) { targetY = other.y + other.packedW; snappedY = true; }
                            else if (Math.abs(targetY + draggedPalletItem.packedW - other.y) < snapDist) { targetY = other.y - draggedPalletItem.packedW; snappedY = true; }
                            else if (Math.abs(targetY - other.y) < snapDist) { targetY = other.y; snappedY = true; }
                        }
                    });

                    // Grid round (50mm step) if not snapped to an edge
                    if (!snappedX) targetX = Math.round(targetX / 50) * 50;
                    if (!snappedY) targetY = Math.round(targetY / 50) * 50;

                    // Bounds clamp
                    const finalX = Math.max(0, Math.min(container.l - draggedPalletItem.packedL, Math.round(targetX)));
                    const finalY = Math.max(0, Math.min(container.w - draggedPalletItem.packedW, Math.round(targetY)));
                    const shiftX = finalX - draggedPalletItem.x;
                    const shiftY = finalY - draggedPalletItem.y;

                    // If moving 1단 floor pallet, also shift stacked 2단 pallet sitting on top
                    if (draggedPalletItem.z === 0) {
                        currentResult.loaded.forEach(other => {
                            if (other.globalIndex !== draggedPalletItem.globalIndex && other.z > 0) {
                                if (Math.abs(other.x - draggedPalletItem.x) < 300 && Math.abs(other.y - draggedPalletItem.y) < 300) {
                                    other.x = Math.max(0, Math.min(container.l - other.packedL, other.x + shiftX));
                                    other.y = Math.max(0, Math.min(container.w - other.packedW, other.y + shiftY));
                                }
                            }
                        });
                    }

                    draggedPalletItem.x = finalX;
                    draggedPalletItem.y = finalY;
                } else if (view === 'left_side' || view === 'right_side') {
                    const deltaZ = -(mouseY - dragStartMouseY) / scale;
                    let targetX = dragItemStartX + deltaX;
                    let targetZ = dragItemStartZ + deltaZ;

                    const snapDist = 100;
                    let snappedX = false;
                    let snappedZ = false;

                    if (Math.abs(targetX) < snapDist) { targetX = 0; snappedX = true; }
                    else if (Math.abs(targetX + draggedPalletItem.packedL - container.l) < snapDist) {
                        targetX = container.l - draggedPalletItem.packedL;
                        snappedX = true;
                    }

                    if (Math.abs(targetZ) < snapDist) { targetZ = 0; snappedZ = true; }
                    else if (Math.abs(targetZ + draggedPalletItem.packedH - container.h) < snapDist) {
                        targetZ = container.h - draggedPalletItem.packedH;
                        snappedZ = true;
                    }

                    // Snap to top of other pallets
                    currentResult.loaded.forEach(other => {
                        if (other.globalIndex === draggedPalletItem.globalIndex) return;
                        if (!snappedZ && Math.abs(targetZ - (other.z + other.packedH)) < snapDist) {
                            targetZ = other.z + other.packedH;
                            snappedZ = true;
                        }
                    });

                    if (!snappedX) targetX = Math.round(targetX / 50) * 50;
                    if (!snappedZ) targetZ = Math.round(targetZ / 50) * 50;

                    draggedPalletItem.x = Math.max(0, Math.min(container.l - draggedPalletItem.packedL, Math.round(targetX)));
                    draggedPalletItem.z = Math.max(0, Math.min(container.h - draggedPalletItem.packedH, Math.round(targetZ)));
                }

                // Sync with bottom panel
                if (inputPosX) inputPosX.value = draggedPalletItem.x;
                if (inputPosY) inputPosY.value = draggedPalletItem.y;
                if (inputPosZ) inputPosZ.value = draggedPalletItem.z;
                if (dispPosX) dispPosX.textContent = `X: ${draggedPalletItem.x} mm`;
                if (dispPosY) dispPosY.textContent = `Y: ${draggedPalletItem.y} mm`;
                if (dispPosZ) dispPosZ.textContent = `Z: ${draggedPalletItem.z} mm`;

                drawVisualization();
                if (window.Viewer3D) {
                    window.Viewer3D.update(currentResult, itemColors);
                    window.Viewer3D.selectPallet(draggedPalletItem.globalIndex);
                }
            } else {
                // Hover detection
                const item = get2DItemAtCoords(mouseX, mouseY);
                const nextHoverIndex = item ? item.globalIndex : null;
                if (nextHoverIndex !== hoveredPalletGlobalIndex) {
                    hoveredPalletGlobalIndex = nextHoverIndex;
                    canvas.style.cursor = item ? 'grab' : 'default';
                    drawVisualization();
                }
            }
        };

        canvas.addEventListener('mousemove', handleDragMove);
        canvas.addEventListener('touchmove', handleDragMove, { passive: true });

        // 3. Mouse Up / Leave (Drop & Finalize)
        const handleDragEnd = () => {
            if (isDragging2D) {
                isDragging2D = false;
                canvas.style.cursor = 'grab';
                if (draggedPalletItem && hasMovedDuringDrag) {
                    applyPalletPositionChange(draggedPalletItem);
                }
                draggedPalletItem = null;
                hasMovedDuringDrag = false;
                drawVisualization();
            }
        };

        canvas.addEventListener('mouseup', handleDragEnd);
        canvas.addEventListener('mouseleave', handleDragEnd);
        canvas.addEventListener('touchend', handleDragEnd);

        // 4. Double Click (Rotate 90 deg)
        canvas.addEventListener('dblclick', (e) => {
            const { mouseX, mouseY } = getCanvasMousePos(e);
            const item = get2DItemAtCoords(mouseX, mouseY);
            if (item) {
                selectPalletForAdjustment(item.globalIndex);
                const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
                if (!currentResult) return;

                const temp = item.packedL;
                item.packedL = item.packedW;
                item.packedW = temp;
                item.rotated = !item.rotated;

                const container = currentResult.dimensions || { l: 5898, w: 2352, h: 2393 };
                if (item.x + item.packedL > container.l) item.x = Math.max(0, container.l - item.packedL);
                if (item.y + item.packedW > container.w) item.y = Math.max(0, container.w - item.packedW);

                applyPalletPositionChange(item);
            }
        });
    }

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

    // Tier Filter Button Event Listeners
    document.querySelectorAll('.tier-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tier-filter-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = '#475569';
            });
            btn.classList.add('active');
            btn.style.background = '#2563eb';
            btn.style.color = '#fff';
            currentTierFilter = btn.dataset.tier;
            drawVisualization();
        });
    });

    // Quick Tier Shift & Step Movement Handlers
    const btnQuickTierFloor = document.getElementById('btn-quick-tier-floor');
    if (btnQuickTierFloor) {
        btnQuickTierFloor.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.z = 0;
            applyPalletPositionChange(item);
        });
    }

    const btnQuickTierUp = document.getElementById('btn-quick-tier-up');
    if (btnQuickTierUp) {
        btnQuickTierUp.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            // Find underlying floor item or default to pallet height
            const under = currentResult.loaded.find(other => 
                other.globalIndex !== item.globalIndex && 
                other.z === 0 &&
                Math.abs(other.x - item.x) < 500 &&
                Math.abs(other.y - item.y) < 500
            );
            item.z = under ? under.packedH : 1000;
            applyPalletPositionChange(item);
        });
    }

    const btnQuickStepIn = document.getElementById('btn-quick-step-in');
    if (btnQuickStepIn) {
        btnQuickStepIn.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.x = Math.max(0, item.x - item.packedL);
            applyPalletPositionChange(item);
        });
    }

    const btnQuickStepOut = document.getElementById('btn-quick-step-out');
    if (btnQuickStepOut) {
        btnQuickStepOut.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            const container = currentResult.dimensions;
            item.x = Math.min(container.l - item.packedL, item.x + item.packedL);
            applyPalletPositionChange(item);
        });
    }

    const btnQuickAlignLeft = document.getElementById('btn-quick-align-left');
    if (btnQuickAlignLeft) {
        btnQuickAlignLeft.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.y = 0;
            applyPalletPositionChange(item);
        });
    }

    const btnQuickAlignCenter = document.getElementById('btn-quick-align-center');
    if (btnQuickAlignCenter) {
        btnQuickAlignCenter.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            const container = currentResult.dimensions;
            item.y = Math.round((container.w - item.packedW) / 2);
            applyPalletPositionChange(item);
        });
    }

    const btnQuickAlignRight = document.getElementById('btn-quick-align-right');
    if (btnQuickAlignRight) {
        btnQuickAlignRight.addEventListener('click', () => {
            if (!currentResults || selectedPalletGlobalIndex === null) return;
            const currentResult = currentResults[currentResultIndex];
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            const container = currentResult.dimensions;
            item.y = container.w - item.packedW;
            applyPalletPositionChange(item);
        });
    }

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
        loadDbProducts();

        // Migrate existing local projects to Firebase
        const localProjects = JSON.parse(safeLocalStorage.getItem('loading_projects') || '[]');
        if (localProjects.length > 0) {
            const batch = window.db.batch();
            localProjects.forEach(proj => {
                const docRef = window.db.collection('projects').doc(proj.id);
                batch.set(docRef, proj);
            });
            batch.commit().then(() => {
                safeLocalStorage.removeItem('loading_projects');
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
            console.log("Received PI Data via postMessage:", data);
            
            if (data.raw3DPlan) {
                const proj = data.raw3DPlan;
                currentProjectId = proj.id;
                if (customerInput) customerInput.value = proj.customerName || '';
                if (projectInput) projectInput.value = proj.projectName || '';
                const serialInput = document.getElementById('project-serial');
                if (serialInput) serialInput.value = proj.serial || '';
                if (dateInput) dateInput.value = proj.date || '';
                
                setSelectedContainer(proj.containerType || '20GP', proj.containerQuantities);
                currentItems = proj.items || [];
                currentResults = proj.results || (proj.result ? [proj.result] : []);
                currentResultIndex = 0;
                
                exitEditMode();
                renderItems();
                if (typeof renderContainerTabs === 'function') renderContainerTabs();
                renderSimulationResult();
                
                if (currentItems.length > 0) {
                    setTimeout(() => {
                        const runBtn = document.getElementById('btn-run-simulation');
                        if (runBtn) runBtn.click();
                    }, 100);
                }
                return;
            }

            // Populate project info safely
            if (customerInput && data.customer) customerInput.value = data.customer;
            if (projectInput && data.piNumber) {
                projectInput.value = data.piNumber;
                const serialInput = document.getElementById('project-serial');
                if (serialInput) serialInput.value = data.piNumber;
            }
            if (dateInput && data.date) dateInput.value = data.date;
            
            // Populate containers safely
            if (data.containers && typeof data.containers === 'object') {
                const availableTypes = ['20DG', '20GP', '40HQ', '40HC', '40GP', '20RF', '40DG', 'LCL'];
                const primaryType = availableTypes.find(t => (data.containers[t] || 0) > 0) || Object.keys(data.containers)[0] || '20GP';
                if (typeof setSelectedContainer === 'function') {
                    setSelectedContainer(primaryType, data.containers);
                }
            }
            
            // Populate items
            if (data.items && Array.isArray(data.items)) {
                currentItems = []; // Clear to prevent double appending
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
                        pkgNo: piItem.pkgNo || '',
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
        } else if (data && data.type === 'SELECT_PRODUCT_RESPONSE') {
            console.log("Received selected product from parent:", data.product);
            const p = data.product;
            if (p) {
                const exists = dbProducts.find(item => item.id === p.id || item.productCode === p.productCode);
                if (!exists) {
                    dbProducts.push(p);
                }
                if (productSelect) {
                    let opt = productSelect.querySelector(`option[value="${p.id}"]`);
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = p.nameKo || p.nameEn || p.id;
                        productSelect.appendChild(opt);
                    }
                    productSelect.value = p.id;
                    renderProductSelect();
                    productSelect.dispatchEvent(new Event('change'));
                }
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

    const initRestructuredModals = () => {
        const cargoFormModal = document.getElementById('cargo-form-modal');
        const btnOpenCargoModal = document.getElementById('btn-open-cargo-modal');
        const btnCloseCargoModal = document.getElementById('btn-close-cargo-modal');
        const btnCancelEdit = document.getElementById('btn-cancel-edit');
        const cargoModalTitle = document.getElementById('cargo-modal-title');
        
        if (btnOpenCargoModal) {
            btnOpenCargoModal.addEventListener('click', () => {
                if (cargoModalTitle) cargoModalTitle.innerHTML = '<i data-lucide="layers"></i> 화물(팔레트) 추가';
                const addForm = document.getElementById('add-item-form');
                if (addForm) addForm.reset();
                document.getElementById('edit-item-id').value = '';
                
                const infoDisplay = document.getElementById('product-info-display');
                const codeDisplay = document.getElementById('product-code-display');
                if (infoDisplay) infoDisplay.textContent = '-- 상품을 검색하여 선택해 주세요 --';
                if (codeDisplay) codeDisplay.textContent = '상품코드: 미지정';
                if (productSelect) productSelect.value = '';
                if (packingSelect) packingSelect.innerHTML = '<option value="">-- 포장방법 선택 --</option>';
                
                if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
                
                showModal('cargo-form-modal');
                if (window.lucide) window.lucide.createIcons();
            });
        }
        
        if (btnCloseCargoModal) {
            btnCloseCargoModal.addEventListener('click', () => hideModal('cargo-form-modal'));
        }
        if (btnCancelEdit) {
            btnCancelEdit.addEventListener('click', () => hideModal('cargo-form-modal'));
        }

        const projectInfoModal = document.getElementById('project-info-modal');
        const btnEditProjectInfo = document.getElementById('btn-edit-project-info');
        const btnCloseProjectInfoModal = document.getElementById('btn-close-project-info-modal');
        const btnSaveProjectInfo = document.getElementById('btn-save-project-info');
        
        if (btnEditProjectInfo) {
            btnEditProjectInfo.addEventListener('click', () => {
                showModal('project-info-modal');
            });
        }
        if (btnCloseProjectInfoModal) {
            btnCloseProjectInfoModal.addEventListener('click', () => hideModal('project-info-modal'));
        }
        if (btnSaveProjectInfo) {
            btnSaveProjectInfo.addEventListener('click', () => {
                hideModal('project-info-modal');
                saveProject(false, true);
            });
        }

        document.querySelectorAll('.btn-qty-inc').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const input = document.getElementById(`qty-${type}`);
                if (input) {
                    input.value = (parseInt(input.value, 10) || 0) + 1;
                    input.dispatchEvent(new Event('change'));
                }
            });
        });

        document.querySelectorAll('.btn-qty-dec').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const input = document.getElementById(`qty-${type}`);
                if (input && parseInt(input.value, 10) > 0) {
                    input.value = (parseInt(input.value, 10) || 0) - 1;
                    input.dispatchEvent(new Event('change'));
                }
            });
        });
    };

    initRestructuredModals();

    // --- Load PI Simulation Data from localStorage (Integration) ---
    const loadPiSimulationData = () => {
        try {
            const rawData = safeLocalStorage.getItem('PI_SIMULATION_DATA');
            if (rawData) {
                const data = JSON.parse(rawData);
                if (data && data.type === 'LOAD_PI_DATA') {
                    // Populate project fields
                    if (customerInput) customerInput.value = data.customer || '';
                    if (projectInput) projectInput.value = data.piNumber ? `${data.piNumber} 적재 계획` : '';
                    if (dateInput && data.date) dateInput.value = data.date;
                    if (serialInput) serialInput.value = data.piNumber || '';

                    // Populate containers safely
                    if (data.containers && typeof data.containers === 'object') {
                        if (document.getElementById('qty-LCL')) document.getElementById('qty-LCL').value = data.containers['LCL'] || 0;
                        if (document.getElementById('qty-20GP')) document.getElementById('qty-20GP').value = data.containers['20GP'] || 0;
                        if (document.getElementById('qty-20RF')) document.getElementById('qty-20RF').value = data.containers['20RF'] || 0;
                        if (document.getElementById('qty-20DG')) document.getElementById('qty-20DG').value = data.containers['20DG'] || 0;
                        if (document.getElementById('qty-40GP')) document.getElementById('qty-40GP').value = data.containers['40GP'] || 0;
                        if (document.getElementById('qty-40HC')) document.getElementById('qty-40HC').value = (data.containers['40HC'] || data.containers['40HQ']) || 0;
                        if (document.getElementById('qty-40HQ')) document.getElementById('qty-40HQ').value = (data.containers['40HQ'] || data.containers['40HC']) || 0;
                        if (document.getElementById('qty-40DG')) document.getElementById('qty-40DG').value = data.containers['40DG'] || 0;

                        // Find primary container type with qty > 0
                        const availableTypes = ['20DG', '20GP', '40HQ', '40HC', '40GP', '20RF', '40DG', 'LCL'];
                        const primaryType = availableTypes.find(t => (data.containers[t] || 0) > 0) || Object.keys(data.containers)[0] || '20GP';
                        if (typeof setSelectedContainer === 'function') {
                            setSelectedContainer(primaryType, data.containers);
                        }
                    }

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
                    safeLocalStorage.removeItem('PI_SIMULATION_DATA');
                }
            }
        } catch (e) {
            console.error("Failed to load PI simulation data from safeLocalStorage:", e);
        }
    };

        // =========================================================================
    // --- Pallet Position & Rotation Interactive Adjustment System ---
    // =========================================================================
    let selectedPalletGlobalIndex = null;

    const palletAdjustPanel = document.getElementById('pallet-adjust-panel');
    const adjustPanelTitle = document.getElementById('adjust-panel-title');
    const adjustPanelSubtitle = document.getElementById('adjust-panel-subtitle');
    const inputPosX = document.getElementById('input-pos-x');
    const inputPosY = document.getElementById('input-pos-y');
    const inputPosZ = document.getElementById('input-pos-z');
    const dispPosX = document.getElementById('disp-pos-x');
    const dispPosY = document.getElementById('disp-pos-y');
    const dispPosZ = document.getElementById('disp-pos-z');
    const selectSwapTarget = document.getElementById('select-swap-target');

    window.onPalletSelected = (item) => {
        if (!item) return;
        selectPalletForAdjustment(item.globalIndex);
    };

    window.selectPalletForAdjustment = (globalIndex) => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        if (!currentResult || !currentResult.loaded) return;

        const item = currentResult.loaded.find(i => i.globalIndex === globalIndex);
        if (!item) return;

        selectedPalletGlobalIndex = globalIndex;
        if (window.Viewer3D) {
            window.Viewer3D.selectPallet(globalIndex);
        }

        if (palletAdjustPanel) {
            palletAdjustPanel.classList.remove('hidden');
        }

        if (adjustPanelTitle) {
            adjustPanelTitle.innerHTML = `선택된 화물: <span style="color:#2563eb;">[#${item.globalIndex}] ${item.name}</span> <small style="color:#64748b; font-weight:normal;">(${item.packedL} × ${item.packedW} × ${item.packedH} mm)</small>`;
        }
        if (adjustPanelSubtitle) {
            adjustPanelSubtitle.textContent = `현재 위치: X=${item.x}mm (길이), Y=${item.y}mm (폭), Z=${item.z}mm (높이) | 아래 버튼이나 입력창으로 위치를 자유롭게 변경할 수 있습니다.`;
        }

        if (inputPosX) inputPosX.value = item.x;
        if (inputPosY) inputPosY.value = item.y;
        if (inputPosZ) inputPosZ.value = item.z;
        if (dispPosX) dispPosX.textContent = `X: ${item.x} mm`;
        if (dispPosY) dispPosY.textContent = `Y: ${item.y} mm`;
        if (dispPosZ) dispPosZ.textContent = `Z: ${item.z} mm`;

        // Populate swap targets
        if (selectSwapTarget) {
            selectSwapTarget.innerHTML = '<option value="">맞바꿀 대상 화물 선택</option>';
            currentResult.loaded.forEach(other => {
                if (other.globalIndex !== globalIndex) {
                    const opt = document.createElement('option');
                    opt.value = other.globalIndex;
                    opt.textContent = `[#${other.globalIndex}] ${other.name} (X:${other.x}, Y:${other.y}, Z:${other.z})`;
                    selectSwapTarget.appendChild(opt);
                }
            });
        }

        // Highlight table row (without jumping window scroll)
        renderPackingList(currentResult.loaded);
    };

    // Expose globals for 3D Viewer Drag Sync
    window.currentResults = currentResults;
    window.currentResultIndex = currentResultIndex;
    window.itemColors = itemColors;
    window.applyPalletPositionChange = (item) => applyPalletPositionChange(item);

    window.syncPalletPositionFrom3D = (item) => {
        if (inputPosX) inputPosX.value = item.x;
        if (inputPosY) inputPosY.value = item.y;
        if (inputPosZ) inputPosZ.value = item.z;
        if (dispPosX) dispPosX.textContent = `X: ${item.x} mm`;
        if (dispPosY) dispPosY.textContent = `Y: ${item.y} mm`;
        if (dispPosZ) dispPosZ.textContent = `Z: ${item.z} mm`;
        drawVisualization();
    };

    const applyPalletPositionChange = (item) => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        if (!currentResult) return;

        if (item.x < 0) item.x = 0;
        if (item.y < 0) item.y = 0;
        if (item.z < 0) item.z = 0;

        if (inputPosX) inputPosX.value = item.x;
        if (inputPosY) inputPosY.value = item.y;
        if (inputPosZ) inputPosZ.value = item.z;
        if (dispPosX) dispPosX.textContent = `X: ${item.x} mm`;
        if (dispPosY) dispPosY.textContent = `Y: ${item.y} mm`;
        if (dispPosZ) dispPosZ.textContent = `Z: ${item.z} mm`;

        // Update 3D & 2D views
        if (window.Viewer3D) {
            window.Viewer3D.update(currentResult, itemColors);
        }
        drawVisualization();
        renderPackingList(currentResult.loaded);
    };

    window.stepPalletPos = (axis, delta) => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        if (!currentResult || selectedPalletGlobalIndex === null) return;

        const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
        if (!item) return;

        if (axis === 'x') {
            item.x = Math.max(0, Math.round((item.x || 0) + delta));
        } else if (axis === 'y') {
            item.y = Math.max(0, Math.round((item.y || 0) + delta));
        } else if (axis === 'z') {
            item.z = Math.max(0, Math.round((item.z || 0) + delta));
        }

        applyPalletPositionChange(item);
    };

    window.snapPalletPos = (axis, posType) => {
        const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
        if (!currentResult || selectedPalletGlobalIndex === null) return;

        const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
        if (!item) return;
        const container = currentResult.dimensions || { l: 5898, w: 2352, h: 2393 };

        if (axis === 'x') {
            if (posType === 'start') item.x = 0;
            if (posType === 'end') item.x = Math.max(0, container.l - item.packedL);
        } else if (axis === 'y') {
            if (posType === 'start') item.y = 0;
            if (posType === 'center') item.y = Math.max(0, Math.round((container.w - item.packedW) / 2));
            if (posType === 'end') item.y = Math.max(0, container.w - item.packedW);
        } else if (axis === 'z') {
            if (posType === 'start') item.z = 0;
        }

        applyPalletPositionChange(item);
    };

    // Manual input listeners
    if (inputPosX) {
        inputPosX.addEventListener('change', (e) => {
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (!currentResult || selectedPalletGlobalIndex === null) return;
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.x = Math.max(0, parseInt(e.target.value, 10) || 0);
            applyPalletPositionChange(item);
        });
    }
    if (inputPosY) {
        inputPosY.addEventListener('change', (e) => {
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (!currentResult || selectedPalletGlobalIndex === null) return;
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.y = Math.max(0, parseInt(e.target.value, 10) || 0);
            applyPalletPositionChange(item);
        });
    }
    if (inputPosZ) {
        inputPosZ.addEventListener('change', (e) => {
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (!currentResult || selectedPalletGlobalIndex === null) return;
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;
            item.z = Math.max(0, parseInt(e.target.value, 10) || 0);
            applyPalletPositionChange(item);
        });
    }

    // Rotate Pallet (90 deg L <-> W)
    const btnAdjustRotate = document.getElementById('btn-adjust-rotate');
    if (btnAdjustRotate) {
        btnAdjustRotate.addEventListener('click', () => {
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (!currentResult || selectedPalletGlobalIndex === null) return;
            const item = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            if (!item) return;

            const temp = item.packedL;
            item.packedL = item.packedW;
            item.packedW = temp;
            item.rotated = !item.rotated;

            const container = currentResult.dimensions || { l: 5898, w: 2352, h: 2393 };
            if (item.x + item.packedL > container.l) {
                item.x = Math.max(0, container.l - item.packedL);
            }
            if (item.y + item.packedW > container.w) {
                item.y = Math.max(0, container.w - item.packedW);
            }

            applyPalletPositionChange(item);
        });
    }

    // Swap Position with target item
    const btnSwapPosition = document.getElementById('btn-swap-position');
    if (btnSwapPosition) {
        btnSwapPosition.addEventListener('click', () => {
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (!currentResult || selectedPalletGlobalIndex === null || !selectSwapTarget) return;
            const targetIdx = parseInt(selectSwapTarget.value, 10);
            if (!targetIdx) {
                alert('맞바꿀 대상 화물을 선택해주세요.');
                return;
            }

            const itemA = currentResult.loaded.find(i => i.globalIndex === selectedPalletGlobalIndex);
            const itemB = currentResult.loaded.find(i => i.globalIndex === targetIdx);
            if (!itemA || !itemB) return;

            const tempX = itemA.x;
            const tempY = itemA.y;
            const tempZ = itemA.z;

            itemA.x = itemB.x;
            itemA.y = itemB.y;
            itemA.z = itemB.z;

            itemB.x = tempX;
            itemB.y = tempY;
            itemB.z = tempZ;

            applyPalletPositionChange(itemA);
        });
    }

    // Button step bindings
    const bindBtnStep = (id, axis, delta) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => stepPalletPos(axis, delta);
    };
    const bindBtnSnap = (id, axis, type) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => snapPalletPos(axis, type);
    };

    bindBtnStep('btn-x-m100', 'x', -100);
    bindBtnStep('btn-x-m10', 'x', -10);
    bindBtnStep('btn-x-p10', 'x', 10);
    bindBtnStep('btn-x-p100', 'x', 100);
    bindBtnSnap('btn-x-snap-start', 'x', 'start');
    bindBtnSnap('btn-x-snap-end', 'x', 'end');

    bindBtnStep('btn-y-m100', 'y', -100);
    bindBtnStep('btn-y-m10', 'y', -10);
    bindBtnStep('btn-y-p10', 'y', 10);
    bindBtnStep('btn-y-p100', 'y', 100);
    bindBtnSnap('btn-y-snap-start', 'y', 'start');
    bindBtnSnap('btn-y-snap-center', 'y', 'center');
    bindBtnSnap('btn-y-snap-end', 'y', 'end');

    bindBtnStep('btn-z-m100', 'z', -100);
    bindBtnStep('btn-z-m10', 'z', -10);
    bindBtnStep('btn-z-p10', 'z', 10);
    bindBtnStep('btn-z-p100', 'z', 100);
    bindBtnSnap('btn-z-snap-start', 'z', 'start');

    const btnAdjustClose = document.getElementById('btn-adjust-close');
    if (btnAdjustClose) {
        btnAdjustClose.addEventListener('click', () => {
            selectedPalletGlobalIndex = null;
            if (palletAdjustPanel) palletAdjustPanel.classList.add('hidden');
            if (window.Viewer3D) window.Viewer3D.selectPallet(null);
            const currentResult = currentResults && currentResults.length > 0 ? currentResults[currentResultIndex] : null;
            if (currentResult) renderPackingList(currentResult.loaded);
        });
    }


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

        // Notify parent that iframe is ready to receive data
        window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
    }
});
