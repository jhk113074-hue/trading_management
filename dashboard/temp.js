
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import {
    getFirestore, collection, doc, getDocs, onSnapshot,
    updateDoc, serverTimestamp, runTransaction, deleteDoc, setDoc
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey:"AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw",
    authDomain:"tradingmanagement-c1cf4.firebaseapp.com",
    projectId:"tradingmanagement-c1cf4",
    storageBucket:"tradingmanagement-c1cf4.firebasestorage.app",
    messagingSenderId:"1033735327012",
    appId:"1:1033735327012:web:b0d235d08ef2f8856cf7b1"
  };
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const COMPANY_ID = "YSACC";

  const customerMap = {};
  const productMap  = {};
  let allPIs = [];
  let currentPIId = null;
  let editPIId = null;
  let sortCol = "piDate";
  let sortDir = "desc";
  const oldItemsCache = {};

  // ?Ä?Ä Í≥†Í∞ùÎß?Î°úÎìú ?Ä?Ä
  async function loadCustomerMap() {
    const snap = await getDocs(collection(doc(db,"companies",COMPANY_ID),"customers"));
    const sel = document.getElementById("filter_customer");
    if (sel) sel.innerHTML = '<option value="">?ÑÏ≤¥ Í≥†Í∞ù</option>';
    snap.docs.forEach(d => { 
      customerMap[d.id] = d.data(); 
      if (sel) {
        const opt = document.createElement("option");
        opt.value = d.id; opt.textContent = d.data().name || d.id;
        sel.appendChild(opt);
      }
    });
  }

  // ?Ä?Ä ?ÅÌíà ÎßàÏä§??Î°úÎìú ?Ä?Ä
  async function loadProductMap() {
    try {
      const snap = await getDocs(collection(doc(db,"companies",COMPANY_ID),"products"));
      snap.docs.forEach(d => { productMap[d.id] = d.data(); });
      console.log("???ÅÌíà ÎßàÏä§??Ï∫êÏã± ?ÑÎ£å:", Object.keys(productMap).length, "Í∞?);
    } catch(e) {
      console.error("???ÅÌíà ÎßàÏä§??Î°úÎìú ?§Ìå®:", e);
    }
  }

  // ?Ä?Ä PI ?§ÏãúÍ∞?Íµ¨ÎèÖ ?Ä?Ä
  function subscribePIs() {
    const piCol = collection(doc(db,"companies",COMPANY_ID),"proforma_invoices");
    onSnapshot(piCol, snap => {
      allPIs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allPIs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      filterPIs();
    });
  }

  window.sortPIs = function(col) {
    if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortCol = col; sortDir = "asc"; }
    filterPIs();
  };

  // ?Ä?Ä Í≤Ä??& ?ÑÌÑ∞ ?Ä?Ä
  window.filterPIs = function() {
    const dStart = document.getElementById("filter_date_start")?.value;
    const dEnd   = document.getElementById("filter_date_end")?.value;
    const cust   = document.getElementById("filter_customer")?.value;
    const piNum  = document.getElementById("filter_pi_num")?.value.toLowerCase();
    const stat   = document.getElementById("filter_status")?.value;

    let filtered = allPIs.filter(p => {
      if (dStart && p.piDate < dStart) return false;
      if (dEnd && p.piDate > dEnd) return false;
      if (cust && p.customerId !== cust) return false;
      if (piNum && !(p.piNumber||"").toLowerCase().includes(piNum)) return false;
      if (stat && p.status !== stat) return false;
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let va = a[sortCol]; let vb = b[sortCol];
      if (sortCol === "customerName") {
        va = (customerMap[a.customerId]?.name || "").toLowerCase();
        vb = (customerMap[b.customerId]?.name || "").toLowerCase();
      } else if (sortCol === "piNumber" || sortCol === "piDate" || sortCol === "currentVersion" || sortCol === "status") {
        va = (va || "").toLowerCase(); vb = (vb || "").toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    // Update sort indicators
    ["piNumber","piDate","customerName","currentVersion","status","totalUsd"].forEach(c => {
      const el = document.getElementById("sort_"+c);
      if (el) el.textContent = sortCol === c ? (sortDir==="asc" ? " ?? : " ??) : "";
    });

    renderTable(filtered);
    document.getElementById("result_count").textContent = `Ï¥?${filtered.length}Í±?;
  };

  // ?Ä?Ä ?åÏù¥Î∏??åÎçîÎß??Ä?Ä
  function renderTable(pis) {
    const tbody = document.getElementById("pi_tbody");
    if (!pis.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">Í≤Ä??Í≤∞Í≥ºÍ∞Ä ?ÜÏäµ?àÎã§</td></tr>`;
      return;
    }
    tbody.innerHTML = pis.map(p => {
      const badge = p.status || "draft";
      const cust  = customerMap[p.customerId]?.name || "-";
      const date  = p.piDate || "-";
      
      let itemsHtml = "Î∂àÎü¨?§Îäî Ï§?..";
      if (p.itemsSummary) {
        itemsHtml = p.itemsSummary.join("<br>");
      } else if (oldItemsCache[p.id]) {
        itemsHtml = oldItemsCache[p.id];
      } else {
        fetchItemsForOldPI(p.id);
      }

      return `<tr class="pi-row" onclick="openModal('${p.id}')">
        <td class="pi-num">${p.piNumber||"-"}</td>
        <td>${date}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${cust}</td>
        <td id="td_items_${p.id}" style="max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-muted);line-height:1.4;">${itemsHtml}</td>
        <td style="text-align:center">${p.currentVersion||"R1"}</td>
        <td style="text-align:center"><span class="badge status-${badge}">${p.status||"draft"}</span></td>
        <td class="amount">$${(p.totalUsd||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td style="white-space:nowrap;text-align:center">
          <button class="action-btn" style="border-color:#2563eb;color:#2563eb" onclick="event.stopPropagation(); window.openTimeline('${p.id}')">??Timeline</button>
          <button class="action-btn" style="border-color:#e74c3c;color:#e74c3c" onclick="event.stopPropagation(); window.openEditModalPI('${p.id}', true)">?ìÑ ÎØ∏Î¶¨Î≥¥Í∏∞</button>
          <button class="action-btn edit-btn" onclick="event.stopPropagation(); window.openEditModalPI('${p.id}')">???òÏ†ï</button>
          <button class="btn-del" onclick="event.stopPropagation(); window.deletePI('${p.id}')">????†ú</button>
        </td>
      </tr>`;
    }).join("");
  }

  async function fetchItemsForOldPI(piId) {
    try {
      const revSnap = await getDocs(collection(doc(db,"companies",COMPANY_ID,"proforma_invoices",piId),"revisions"));
      if (revSnap.empty) { oldItemsCache[piId] = "-"; }
      else {
        const latestRev = revSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
        const liSnap = await getDocs(collection(latestRev.ref,"line_items"));
        if (liSnap.empty) { oldItemsCache[piId] = "-"; }
        else {
          const items = liSnap.docs.map(d => d.data()).sort((a,b) => (a.lineNumber||0)-(b.lineNumber||0));
          const summary = items.slice(0,3).map(i => `${i.description||'-'} (${i.quantity||0}${i.unit||''})`).join("<br>");
          oldItemsCache[piId] = summary + (items.length > 3 ? "<br>..." : "");
        }
      }
    } catch(e) {
      oldItemsCache[piId] = "?§Î•ò Î∞úÏÉù";
    }
    const td = document.getElementById("td_items_" + piId);
    if (td) td.innerHTML = oldItemsCache[piId];
  }

  // ?Ä?Ä Î™®Îã¨ ?¥Í∏∞ ?Ä?Ä
  window.openModal = async function(piId) {
    currentPIId = piId;
    const p = allPIs.find(x => x.id === piId);
    if (!p) return;
    const cust = customerMap[p.customerId] || {};

    // ?§Îçî
    document.getElementById("modal_pi_number").textContent = p.piNumber || "-";
    document.getElementById("modal_pi_sub").textContent =
      `${p.piDate || "-"} ¬∑ ${cust.name || "-"} ¬∑ ${p.destinationPort || "-"}`;
    const sb = document.getElementById("modal_status_badge");
    sb.textContent = p.status || "draft";
    sb.className = `badge status-badge-lg ${p.status||"draft"}`;

    // Line items Î∂àÎü¨?§Í∏∞
    let lineItemsHTML = "<tr><td colspan='6' style='text-align:center;padding:16px;color:var(--text-muted);'>?ºÏù∏ ?ÑÏù¥???ÜÏùå</td></tr>";
    try {
      const revSnap = await getDocs(collection(doc(db,"companies",COMPANY_ID,"proforma_invoices",piId),"revisions"));
      if (!revSnap.empty) {
        const latestRev = revSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
        const liSnap = await getDocs(collection(latestRev.ref,"line_items"));
        if (!liSnap.empty) {
          const items = liSnap.docs.map(d => d.data()).sort((a,b) => (a.lineNumber||0)-(b.lineNumber||0));
          lineItemsHTML = items.map((item,i) => `
            <tr>
              <td>${item.lineNumber||i+1}</td>
              <td>${item.description||"-"}</td>
              <td class="num">${item.quantity||0}</td>
              <td>${item.unit||"-"}</td>
              <td class="num">$${Number(item.salePriceUsd||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td class="num" style="color:var(--green)">$${Number(item.lineTotalUsd||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td>${item.remarks||"-"}</td>
            </tr>`).join("");
        }
      }
    } catch(e) { console.error(e); }

    // Î™®Îã¨ Î∞îÎîî
    document.getElementById("modal_body").innerHTML = `
      <div class="detail-grid">
        <div class="detail-section">
          <h4>?ìã PI ?ïÎ≥¥</h4>
          <div class="detail-row"><span class="detail-label">PI Number</span><span class="detail-value">${p.piNumber||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">PI Date</span><span class="detail-value">${p.piDate||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Valid Until</span><span class="detail-value">${p.validUntilDate||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Revision</span><span class="detail-value">${p.currentVersion||"R1"}</span></div>
          <div class="detail-row"><span class="detail-label">Exchange Rate</span><span class="detail-value">??{(p.exchangeRate||0).toLocaleString()}/USD</span></div>
        </div>
        <div class="detail-section">
          <h4>?ë§ Í≥†Í∞ù ?ïÎ≥¥</h4>
          <div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${cust.name||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Country</span><span class="detail-value">${cust.country||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${cust.contactPerson||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${cust.email||"-"}</span></div>
        </div>
        <div class="detail-section">
          <h4>?ö¢ Í±∞Îûò Ï°∞Í±¥</h4>
          <div class="detail-row"><span class="detail-label">Incoterms</span><span class="detail-value">${p.incoterms||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Destination</span><span class="detail-value">${p.destinationPort||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Payment Terms</span><span class="detail-value">${p.paymentTerms||"-"}</span></div>
          <div class="detail-row"><span class="detail-label">Shipping</span><span class="detail-value">${p.shippingMethod||"-"}</span></div>
        </div>
        <div class="detail-section">
          <h4>?í∞ Í∏àÏï° ?îÏïΩ</h4>
          <div class="detail-row"><span class="detail-label">Subtotal</span><span class="detail-value">$${Number(p.subtotalUsd||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
          <div class="detail-row"><span class="detail-label">Handling</span><span class="detail-value">$${Number(p.handlingCharges||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
          <div class="detail-row"><span class="detail-label">Freight</span><span class="detail-value">$${Number(p.freightCharges||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
          <div class="detail-row"><span class="detail-label">Insurance</span><span class="detail-value">$${Number(p.insuranceCharges||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        </div>
        <div class="detail-section full">
          <h4>?ì¶ ?ÅÌíà ?ºÏù∏ (Line Items ¬∑ ${p.currentVersion||"R1"} Î≤ÑÏ†Ñ)</h4>
          <table class="li-table">
            <thead>
              <tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th><th>Remarks</th></tr>
            </thead>
            <tbody>${lineItemsHTML}</tbody>
          </table>
          <div class="total-highlight">
            <div style="color:var(--text-muted);font-size:12px;">GRAND TOTAL</div>
            <div class="grand">USD $${(p.totalUsd||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
        </div>
        ${p.remarks ? `<div class="detail-section full"><h4>?ìù ÎπÑÍ≥†</h4><div style="font-size:13px;color:var(--text-muted);padding-top:4px;line-height:1.5;">${String(p.remarks).replace(/\\n/g, '<br>')}</div></div>` : ""}
      </div>`;

    document.getElementById("modal_overlay").classList.add("open");
    document.body.style.overflow = "hidden";
  };

  // ?Ä?Ä ?ÅÌÉú ?ÖÎç∞?¥Ìä∏ ?Ä?Ä
  window.updateStatus = async function(newStatus) {
    if (!currentPIId) return;
    try {
      const piRef = doc(db,"companies",COMPANY_ID,"proforma_invoices",currentPIId);
      const updates = { status: newStatus, updatedAt: serverTimestamp() };
      if (newStatus === "confirmed") updates.confirmedAt = serverTimestamp();
      if (newStatus === "sent")      updates.sentAt      = serverTimestamp();
      await updateDoc(piRef, updates);
      closeModal();
      alert(`???ÅÌÉúÍ∞Ä "${newStatus}"?ºÎ°ú Î≥ÄÍ≤ΩÎêò?àÏäµ?àÎã§.`);
    } catch(e) {
      alert("??Î≥ÄÍ≤??§Ìå®: " + e.message);
    }
  };

  // ?Ä?Ä Î™®Îã¨ ?´Í∏∞ ?Ä?Ä
  window.closeModal = function() {
    document.getElementById("modal_overlay").classList.remove("open");
    document.body.style.overflow = "";
    currentPIId = null;
  };
  window.closeModalOnOverlay = function(e) {
    if (e.target === document.getElementById("modal_overlay")) closeModal();
  };

  // ?Ä?Ä ESC ?§Î°ú ?´Í∏∞ ?Ä?Ä
  document.addEventListener("keydown", e => { 
    if (e.key === "Escape") { 
      if (document.getElementById("packer_overlay").style.display === "flex") {
        closePackerModal();
      } else {
        closeModal(); closeNewPI(); 
      }
    } 
  });

  // ?Ä?Ä ?ÅÏû¨ ?ÑÎ°úÍ∑∏Îû® ?∞Îèô Î°úÏßÅ ?Ä?Ä
  window.openPackerModal = function() {
    document.getElementById("packer_overlay").style.display = "flex";
    const iframe = document.getElementById("packer_iframe");
    if (iframe.src === "about:blank" || iframe.src === "") {
      iframe.src = "https://container-packer-1a187.web.app/";
    }
  };
  window.closePackerModal = function() {
    document.getElementById("packer_overlay").style.display = "none";
  };

  // ?Ä?Ä ?ÅÏû¨ ?ÑÎ°úÍ∑∏Îû® ?úÎûòÍ∑??¥Îèô Î°úÏßÅ ?Ä?Ä
  setTimeout(() => {
    const packerWin = document.getElementById("packer_overlay");
    const packerHeader = document.getElementById("packer_header");
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    packerHeader.addEventListener("mousedown", (e) => {
      if (e.target.closest('button')) return; // Î≤ÑÌäº ?¥Î¶≠ ???úÎûòÍ∑?Î¨¥Ïãú
      isDragging = true;
      dragOffsetX = e.clientX - packerWin.getBoundingClientRect().left;
      dragOffsetY = e.clientY - packerWin.getBoundingClientRect().top;
      showIframeShield();
    });

    // ?Ä?Ä ?¨Í∏∞ Ï°∞Ï†à (Resize) Î°úÏßÅ ?Ä?Ä
    let isResizing = false;
    let resizeDir = "";
    let startW = 0, startH = 0, startX = 0, startY = 0, startLeft = 0;

    packerWin.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        if (handle.classList.contains('resize-right')) resizeDir = 'r';
        else if (handle.classList.contains('resize-left')) resizeDir = 'l';
        else if (handle.classList.contains('resize-bottom')) resizeDir = 'b';
        else if (handle.classList.contains('resize-br')) resizeDir = 'br';
        
        const rect = packerWin.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        startLeft = rect.left;
        startX = e.clientX;
        startY = e.clientY;
        showIframeShield();
        e.preventDefault();
        e.stopPropagation();
      });
    });

    function showIframeShield() {
      let shield = document.getElementById("iframe_shield");
      if(!shield) {
        shield = document.createElement("div");
        shield.id = "iframe_shield";
        shield.style.position = "absolute";
        shield.style.top = "0"; shield.style.left = "0"; shield.style.right = "0"; shield.style.bottom = "0";
        shield.style.zIndex = "10001";
        document.getElementById("packer_iframe_container").appendChild(shield);
      } else {
        shield.style.display = "block";
      }
    }

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        packerWin.style.left = (e.clientX - dragOffsetX) + "px";
        packerWin.style.top = (e.clientY - dragOffsetY) + "px";
        packerWin.style.margin = "0";
      } else if (isResizing) {
        if (resizeDir === 'r' || resizeDir === 'br') {
          packerWin.style.width = (startW + (e.clientX - startX)) + "px";
        }
        if (resizeDir === 'b' || resizeDir === 'br') {
          packerWin.style.height = (startH + (e.clientY - startY)) + "px";
        }
        if (resizeDir === 'l') {
          const newWidth = startW - (e.clientX - startX);
          if (newWidth > 300) { // ÏµúÏÜå ?àÎπÑ
            packerWin.style.width = newWidth + "px";
            packerWin.style.left = (startLeft + (e.clientX - startX)) + "px";
            packerWin.style.margin = "0";
          }
        }
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      isResizing = false;
      let shield = document.getElementById("iframe_shield");
      if(shield) shield.style.display = "none";
    });
  }, 1000);

  // ?Ä?Ä New PI Î™®Îã¨ ?úÎûòÍ∑?Î∞?Î¶¨ÏÇ¨?¥Ï¶à Î°úÏßÅ ?Ä?Ä
  setTimeout(() => {
    const piWin = document.getElementById("new_pi_modal_box");
    const piHeader = document.getElementById("new_pi_header");
    if (!piWin || !piHeader) return;
    
    let piIsDragging = false, piIsResizing = false, piResizeDir = "";
    let piDragOffsetX = 0, piDragOffsetY = 0;
    let piStartW = 0, piStartH = 0, piStartX = 0, piStartY = 0, piStartLeft = 0;

    piHeader.addEventListener("mousedown", (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      piIsDragging = true;
      piDragOffsetX = e.clientX - piWin.getBoundingClientRect().left;
      piDragOffsetY = e.clientY - piWin.getBoundingClientRect().top;
    });

    document.getElementById("new_pi_overlay").querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        piIsResizing = true;
        if (handle.classList.contains('pi-resize-right')) piResizeDir = 'r';
        else if (handle.classList.contains('pi-resize-left')) piResizeDir = 'l';
        else if (handle.classList.contains('pi-resize-bottom')) piResizeDir = 'b';
        else if (handle.classList.contains('pi-resize-br')) piResizeDir = 'br';
        
        const rect = piWin.getBoundingClientRect();
        piStartW = rect.width;
        piStartH = rect.height;
        piStartLeft = rect.left;
        piStartX = e.clientX;
        piStartY = e.clientY;
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener("mousemove", (e) => {
      if (piIsDragging) {
        piWin.style.left = (e.clientX - piDragOffsetX) + "px";
        piWin.style.top = (e.clientY - piDragOffsetY) + "px";
        piWin.style.margin = "0";
        piWin.style.transform = "none";
      } else if (piIsResizing) {
        piWin.style.transform = "none";
        piWin.style.margin = "0";
        piWin.style.maxWidth = "none";
        piWin.style.maxHeight = "none";
        if (piResizeDir === 'r' || piResizeDir === 'br') {
          piWin.style.width = (piStartW + (e.clientX - piStartX)) + "px";
        }
        if (piResizeDir === 'b' || piResizeDir === 'br') {
          piWin.style.height = (piStartH + (e.clientY - piStartY)) + "px";
        }
        if (piResizeDir === 'l') {
          const newWidth = piStartW - (e.clientX - piStartX);
          if (newWidth > 400) {
            piWin.style.width = newWidth + "px";
            piWin.style.left = (piStartLeft + (e.clientX - piStartX)) + "px";
          }
        }
      }
    });

    document.addEventListener("mouseup", () => {
      piIsDragging = false;
      piIsResizing = false;
    });
  }, 1000);

  window.copyDataForPacker = function() {
    if (!nItems || nItems.length === 0) {
      alert("Î≥µÏÇ¨???ÅÌíà ?ºÏù∏???ÜÏäµ?àÎã§.");
      return;
    }
    let text = "?ÅÌíàÎ™?t?òÎüâ\n";
    nItems.forEach(item => {
      text += `${item.desc}\t${item.qty}\n`;
    });
    navigator.clipboard.writeText(text).then(() => {
      alert("?ÅÏû¨ ?ÑÎ°úÍ∑∏Îû®???∞Ïù¥???ÅÌíàÎ™? ?òÎüâ)Í∞Ä Î≥µÏÇ¨?òÏóà?µÎãà?? ?ÅÏû¨ ?ÑÎ°úÍ∑∏Îû® ?ëÏ? Î∂ôÏó¨?£Í∏∞ Í∏∞Îä• ?±Ïóê ?úÏö©?òÏÑ∏??");
    }).catch(err => {
      console.error(err);
      alert("Î≥µÏÇ¨ ?§Ìå®");
    });
  };

  // ?Ä?Ä New PI Î™®Îã¨ ?¥Í∏∞/?´Í∏∞ ?Ä?Ä
  window.openNewPIModal = function() {
    editPIId = null;
    document.getElementById("n_modal_title").textContent = "New Proforma Invoice";
    document.getElementById("n_modal_sub").textContent = "?†Í∑ú Í≤¨Ï†Å???ëÏÑ± ¬∑ Firebase Firestore ?Ä??- Ï¥àÍ∏∞Î≤ÑÏ†Ñ(Revision ?ÜÏùå)";
    document.getElementById("n_save_btn").textContent = "??Firestore ?Ä??;
    document.getElementById("n_save_draft_btn").style.display = "none";
    document.getElementById("revision_section").style.display = "none";
    document.getElementById("n_rev_reason").value = "";

    // ?§Îäò ?†Ïßú Í∏∞Î≥∏Í∞?
    document.getElementById("n_pi_date").value = new Date().toISOString().split("T")[0];
    nCalcValid();
    // Í≥†Í∞ù Î™©Î°ù Ï±ÑÏö∞Í∏?
    const sel = document.getElementById("n_customer");
    sel.innerHTML = '<option value="">-- ?†ÌÉù --</option>';
    Object.entries(customerMap).forEach(([id, c]) => {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = c.name || id;
      opt.dataset.info = JSON.stringify(c);
      sel.appendChild(opt);
    });
    nItems = []; nCounter = 0;
    document.getElementById("n_li_body").innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">?ÑÎûò Î≤ÑÌäº???åÎü¨ ?ÅÌíà??Ï∂îÍ??òÏÑ∏??/td></tr>';
    
    // Ï∂îÍ?ÎπÑÏö© Ï¥àÍ∏∞??
    document.getElementById("n_handling").value = 0;
    document.getElementById("n_freight").value = 0;
    nFreightItems = []; nRenderFreightRows(); updateFreightTitle();
    document.getElementById("n_insurance").value = 0;
    document.getElementById("n_remarks").value = "";
    document.getElementById("n_departurePort").value = "Busan, Korea";
    document.getElementById("n_packagingSpec").value = "Export Standard Packaging.";
    document.getElementById("n_validityDesc").value = "4 weeks from the offered date";

    nRecalcTotals();
    document.getElementById("new_pi_overlay").classList.add("open");
    document.body.style.overflow = "hidden";
  };

  window.openEditModalPI = function(piId, autoPdf = false) {
    currentPIId = piId;
    openEditModal(autoPdf);
  };

  window.deletePI = async function(id) {
    if(!confirm("??Proforma InvoiceÎ•??ïÎßê ??†ú?òÏãúÍ≤†Ïäµ?àÍπå?")) return;
    try {
      await deleteDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", id));
      alert("??†ú?òÏóà?µÎãà??");
    } catch (e) {
      alert("??†ú ?§Ìå®: " + e.message);
    }
  };

  // ?Ä?Ä Í∏∞Ï°¥ PI ?òÏ†ï Î™®Îã¨ ?¥Í∏∞ ?Ä?Ä
  window.openEditModal = async function(autoPdf = false) {
    if (!currentPIId) return;
    editPIId = currentPIId;
    const p = allPIs.find(x => x.id === editPIId);
    if (!p) return;

    // ?ÅÏÑ∏ Î™®Îã¨ ?´Í∏∞
    closeModal();

    // ?òÏ†ï Î™®Îìú UI Î≥ÄÍ≤?
    document.getElementById("n_modal_title").textContent = "Edit Proforma Invoice";
    document.getElementById("n_modal_sub").innerHTML = `Í∏∞Ï°¥ Í≤¨Ï†Å???òÏ†ï (${p.piNumber}) &nbsp;&nbsp;|&nbsp;&nbsp; <span style="color:#2563eb;font-weight:bold;">?ÑÏû¨ Î¶¨ÎπÑ?? ${p.currentVersion || "R1"}</span> &nbsp;&nbsp;|&nbsp;&nbsp; <span class="badge status-${p.status||'draft'}">${p.status||'draft'}</span>`;
    document.getElementById("n_save_btn").textContent = "?? ??Î¶¨ÎπÑ??Î∞úÌñâ (+Î≤ÑÏ†Ñ??";
    document.getElementById("n_save_draft_btn").style.display = "inline-block";
    
    // Revision Reason Ï¥àÍ∏∞??Î∞??úÏãú
    document.getElementById("revision_section").style.display = "block";
    document.getElementById("n_rev_reason").value = "";

    // Í≥†Í∞ù Î™©Î°ù Ï±ÑÏö∞Í∏?
    const sel = document.getElementById("n_customer");
    sel.innerHTML = '<option value="">-- ?†ÌÉù --</option>';
    Object.entries(customerMap).forEach(([id, c]) => {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = c.name || id;
      opt.dataset.info = JSON.stringify(c);
      sel.appendChild(opt);
    });

    // Í∏∞Ï°¥ ?∞Ïù¥???ºÏóê Ï±ÑÏö∞Í∏?
    document.getElementById("n_pi_date").value = p.piDate || "";
    document.getElementById("n_validity").value = p.validityDays || 30;
    document.getElementById("n_valid_until").value = p.validUntilDate || "";
    sel.value = p.customerId || "";
    document.getElementById("n_contact").value = customerMap[p.customerId]?.contactPerson || "";
    document.getElementById("n_email").value = customerMap[p.customerId]?.email || "";
    document.getElementById("n_incoterms").value = p.incoterms || "";
    document.getElementById("n_dest").value = p.destinationPort || "";
    document.getElementById("n_payment").value = p.paymentTerms || "";
    document.getElementById("n_shipping").value = p.shippingMethod || "Sea Freight";
    document.getElementById("n_departurePort").value = p.departurePort || "Busan, Korea";
    document.getElementById("n_packagingSpec").value = p.packagingSpec || "Export Standard Packaging.";
    document.getElementById("n_validityDesc").value = p.validityDesc || "4 weeks from the offered date";
    document.getElementById("n_rate").value = p.exchangeRate || 1468.96;
    document.getElementById("n_remarks").value = p.remarks || "";
    document.getElementById("n_handling").value = p.handlingCharges || 0;
    document.getElementById("n_freight").value = p.freightCharges || 0;
    if (p.freightDetails) { nFreightItems = p.freightDetails; } else if (p.freightCharges) { nFreightItems = [{type:"LCL", qty:1, price:p.freightCharges}]; } else { nFreightItems = []; }
    nRenderFreightRows(); updateFreightTitle();
    document.getElementById("n_insurance").value = p.insuranceCharges || 0;

    // Line Items Í∞Ä?∏Ïò§Í∏?
    nItems = []; nCounter = 0;
    document.getElementById("n_li_body").innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-muted);">Î∂àÎü¨?§Îäî Ï§?..</td></tr>';

    try {
      const revSnap = await getDocs(collection(doc(db,"companies",COMPANY_ID,"proforma_invoices",editPIId),"revisions"));
      if (!revSnap.empty) {
        const latestRev = revSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
        const liSnap = await getDocs(collection(latestRev.ref,"line_items"));
        if (!liSnap.empty) {
          const items = liSnap.docs.map(d => d.data()).sort((a,b) => (a.lineNumber||0)-(b.lineNumber||0));
          nItems = items.map((item, i) => {
            let costK = item.costKrw || 0;
            const r     = item.exchangeRate || p.exchangeRate || 1468.96;
            let costU = item.costUsd || 0;
            const margin = item.profitMargin || 0;
            const salePrice = item.salePriceUsd || 0;
            
            // ?íä ?êÍ? ÏπòÏú†(Self-Healing) ?îÏßÑ: ?êÍ? ?∞Ïù¥?∞Í? ????0??ÎπÑÏ†ï???∞Ïù¥??Î≥µÏõê
            if (costK === 0 && costU === 0 && salePrice > 0) {
              const mDiv = margin < 100 ? (1 - margin / 100) : 1;
              costU = +(salePrice * mDiv).toFixed(4);
            }
            
            let baseCurr = "KRW";
            if (costU > 0 && costK === 0) {
              baseCurr = "USD";
              costK = 0;
            } else if (costK > 0 && costU === 0) {
              baseCurr = "KRW";
              costU = 0;
            } else if (costK > 0 && costU > 0) {
              // ?ëÎ∞©??Î™®Îëê ?§Ïñ¥?àÎäî Íµ¨Ìòï ?∞Ïù¥?∞Îäî ?àÏ†Ñ?òÍ≤å ?êÌôî Í∏∞Ï??ºÎ°ú ?ïÎ¶¨
              baseCurr = "KRW";
              costU = 0;
            } else {
              baseCurr = "KRW";
            }
            
            return {
              id: ++nCounter,
              desc: item.description || "",
              qty: item.quantity || 1,
              unit: item.unit || "KG",
              cost: costK,
              rate: r,
              costUsd: costU,
              margin: margin,
              _baseCurrency: baseCurr,
              remarks: item.remarks || ""
            };
          });
        }
      }
    } catch(e) {
      console.error("Line items Î°úÎî© ?§Ìå®:", e);
    }

    nRenderItems(); // ?åÎçîÎß?Î∞?Í∏àÏï° ?©Í≥Ñ Î¶¨Í≥Ñ???§Ìñâ

    // Î™®Îã¨ ?¥Í∏∞ ?êÎäî PDF ?êÎèô ?ùÏÑ±
    if (autoPdf) {
      window.nExportPDF();
    } else {
      document.getElementById("new_pi_overlay").classList.add("open");
      document.body.style.overflow = "hidden";
    }
  };
  window.closeNewPI = function() {
    document.getElementById("new_pi_overlay").classList.remove("open");
    document.body.style.overflow = "";
  };
  window.closeNewPIOnOverlay = function(e) {
    if (e.target === document.getElementById("new_pi_overlay")) closeNewPI();
  };

  // ?Ä?Ä ?†Ìö®Í∏∞Í∞Ñ Í≥ÑÏÇ∞ ?Ä?Ä
  window.nCalcValid = function() {
    const d = document.getElementById("n_pi_date").value;
    const days = parseInt(document.getElementById("n_validity").value)||30;
    if (!d) return;
    const dt = new Date(d); dt.setDate(dt.getDate()+days);
    document.getElementById("n_valid_until").value = dt.toISOString().split("T")[0];
  };

  // ?Ä?Ä Í≥†Í∞ù ?†ÌÉù ?Ä?Ä
  window.nOnCustomer = function() {
    const sel = document.getElementById("n_customer");
    const opt = sel.selectedOptions[0];
    if (!opt?.dataset.info) return;
    const c = JSON.parse(opt.dataset.info);
    document.getElementById("n_contact").value = c.contactPerson||"";
    document.getElementById("n_email").value   = c.contactEmail || c.email || "";
    document.getElementById("n_dest").value    = c.preferredPort||"";
    const iSel = document.getElementById("n_incoterms");
    for (let o of iSel.options) if (o.value===c.preferredIncoterms) { iSel.value=o.value; break; }
    document.getElementById("n_payment").value = c.paymentTerms || "";
  };

  // ?Ä?Ä ?ºÏù∏ ?ÑÏù¥???Ä?Ä
  let nItems=[], nCounter=0;
  window.nAddItem = function() {
    const globalRate = parseFloat(document.getElementById("n_rate").value)||1468.96;
    nItems.push({id:++nCounter,desc:"",qty:1,unit:"KG",cost:0,rate:globalRate,costUsd:0,margin:10,_baseCurrency:"KRW",remarks:""});
    nRenderItems();
  };
  function nCalcItem(item) {
    const globalRate = parseFloat(document.getElementById("n_rate").value)||1468.96;
    const r = item.rate || globalRate;
    const mDiv = item.margin<100 ? (1 - item.margin/100) : 1;
    
    let sp = 0;
    if (item._baseCurrency === "USD") {
      sp = (item.costUsd || 0) / mDiv;
    } else {
      sp = ((item.cost || 0) / r) / mDiv;
    }
    item._sale = +(sp.toFixed(2)); item._total = +(item._sale * item.qty).toFixed(2);
  }
  function nRenderItems() {
    const tbody = document.getElementById("n_li_body");
    if (!nItems.length) { tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--text-muted);">?ÑÎûò Î≤ÑÌäº???åÎü¨ ?ÅÌíà??Ï∂îÍ??òÏÑ∏??/td></tr>'; nRecalcTotals(); return; }
    
    // ?ÅÌíà ÎßàÏä§??Datalist ?µÏÖò ÎπåÎìú
    const productOptions = Object.entries(productMap).map(([id, p]) => {
      return `<option value="[${id}] ${p.nameKo} (${p.nameEn || ''})">`;
    }).join("");

    const formatVal = (v, decimals) => {
      if (!v && v !== 0) return '';
      let str = Number(v).toFixed(decimals || 0);
      if (decimals) str = str.replace(/\.?0+$/, ''); // remove trailing zeros
      const parts = str.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join('.');
    };

    tbody.innerHTML = nItems.map((item,i) => {
      nCalcItem(item);
      const units = ["KG","BOX","M","M2","M3","BL","SET","EA"].map(u=>`<option${item.unit===u?" selected":""}>${u}</option>`).join("");
      return `<tr>
        <td>${i+1}</td>
        <td>
          <input type="text" value="${item.desc}" placeholder="[ÏΩîÎìú] ?ÖÎ†• ?êÎäî ÏßÅÏ†ë?ÖÎ†•" onchange="nUpdateItem(${item.id},'desc',this.value)" list="products_preset_${item.id}" style="width:100%;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)">
          <datalist id="products_preset_${item.id}">${productOptions}</datalist>
        </td>
        <td><input type="text" value="${formatVal(item.qty, 2)}" style="text-align:right;width:70px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'qty',this.value)" onfocus="this.value=this.value.replace(/,/g,'')" onblur="this.value=''+this.value"></td>
        <td><select style="width:75px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'unit',this.value)">${units}</select></td>
        <td><input type="text" value="${formatVal(item.cost, 2)}" style="text-align:right;width:90px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'cost',this.value)" onfocus="this.value=this.value.replace(/,/g,'')" onblur="this.value=''+this.value"></td>
        <td><input type="text" value="${formatVal(item.rate, 2)}" style="text-align:right;width:85px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'rate',this.value)" onfocus="this.value=this.value.replace(/,/g,'')" onblur="this.value=''+this.value"></td>
        <td><input type="text" value="${item.costUsd ? formatVal(item.costUsd, 4) : ''}" style="text-align:right;width:95px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'costUsd',this.value)" onfocus="this.value=this.value.replace(/,/g,'')" onblur="this.value=''+this.value"></td>
        <td><input type="number" value="${item.margin}" min="0" max="99" step="0.1" style="width:60px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'margin',this.value)"></td>
        <td class="calc-cell">${Number(item._sale||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td class="calc-cell">${Number(item._total||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td><input type="text" value="${item.remarks || ''}" placeholder="ÎπÑÍ≥†" style="width:110px;padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)" onchange="nUpdateItem(${item.id},'remarks',this.value)"></td>
        <td><button style="background:rgba(255,82,82,.15);color:#ff5252;border:none;border-radius:5px;padding:3px 9px;cursor:pointer;font-size:11px" onclick="nDeleteItem(${item.id})">??/button></td>
      </tr>`;
    }).join("");
    nRecalcTotals();
  }
  window.nUpdateItem = function(id,field,val) {
    const item = nItems.find(i=>i.id===id); if(!item) return;
    const globalRate = parseFloat(document.getElementById("n_rate").value)||1468.96;
    if (typeof val === 'string') val = val.replace(/,/g, '');
    const currentVal = parseFloat(val)||0;
    
    if (field === "rate") {
      item.rate = currentVal || globalRate;
    } else if (field === "cost") {
      item.cost = currentVal;
      item.costUsd = 0; // ?¨Îü¨ ?êÍ? Î¶¨ÏÖã (Î∞∞Ì???Í≤©Î¶¨)
      item._baseCurrency = "KRW";
    } else if (field === "costUsd") {
      item.costUsd = currentVal;
      item.cost = 0; // ?êÌôî ?êÍ? Î¶¨ÏÖã (Î∞∞Ì???Í≤©Î¶¨)
      item._baseCurrency = "USD";
    } else if (field === "desc") {
      item.desc = val;
      const match = val.match(/\[(PROD-[^\]]+)\]/);
      if (match) {
        const productCode = match[1];
        const prod = productMap[productCode];
        if (prod) {
          item.desc = `[${prod.productCode}] ${prod.nameEn || prod.nameKo}`;
          item.unit = prod.unit || "KG";
          if (prod.currency === "USD") {
            item.costUsd = prod.purchasePrice || 0;
            item.cost = 0;
            item._baseCurrency = "USD";
          } else {
            item.cost = prod.purchasePrice || 0;
            item.costUsd = 0;
            item._baseCurrency = "KRW";
          }
        }
      }
    } else {
      item[field] = (field==="desc"||field==="unit"||field==="remarks") ? val : (parseFloat(val)||0);
    }
    nRenderItems();
  };
  window.nDeleteItem = function(id) { nItems=nItems.filter(i=>i.id!==id); nRenderItems(); };
  window.nRecalc    = function() {
    const rate = parseFloat(document.getElementById("n_rate").value)||1468.96;
    nItems.forEach(item => {
      item.rate = rate;
    });
    nRenderItems();
  };
  function nRecalcTotals() {
    const sub  = nItems.reduce((s,i)=>s+(i._total||0),0);
    const hand = parseFloat(document.getElementById("n_handling").value)||0;
    const frt  = parseFloat(document.getElementById("n_freight").value)||0;
    const ins  = parseFloat(document.getElementById("n_insurance").value)||0;
    const grand= sub+hand+frt+ins;
    const rate = parseFloat(document.getElementById("n_rate").value)||1468.96;
    document.getElementById("n_sub").textContent    = sub.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById("n_extras").textContent = (hand+frt+ins).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById("n_grand").textContent  = "USD "+grand.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById("n_krw").value          = "??"+(grand*rate).toLocaleString();
  }
  // ?Ä?Ä Freight ?§Ï§ë ?ÖÎ†• Î°úÏßÅ ?Ä?Ä
  let nFreightItems = [];
  window.updateFreightTitle = function() {
    const val = document.getElementById("n_incoterms").value;
    const title = document.getElementById("lbl_freight_title");
    if (title) {
      if (val) title.textContent = val + " Charges (USD)";
      else title.textContent = "Freight Charges (USD)";
    }
  };
  window.nAddFreightRow = function(type="LCL", qty=1, price=0, remarks="") {
    nFreightItems.push({ type, qty, price, remarks });
    nRenderFreightRows();
  };
  window.nRemoveFreightRow = function(idx) {
    nFreightItems.splice(idx, 1);
    nRenderFreightRows();
  };
  window.nUpdateFreightRow = function(idx, field, val) {
    if (field === 'qty' || field === 'price') val = parseFloat(val)||0;
    nFreightItems[idx][field] = val;
    nRenderFreightRows();
  };
  window.nRenderFreightRows = function() {
    const container = document.getElementById("freight_rows");
    if (!container) return;
    if (nFreightItems.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:5px;">?¥ÏÜ°Îπ??¥Ïó≠???ÜÏäµ?àÎã§. (Total: $0.00)</div>';
      document.getElementById("freight_total_display").textContent = "0.00";
      document.getElementById("n_freight").value = 0;
      nRecalcTotals();
      return;
    }
    let ht = "";
    let total = 0;
    nFreightItems.forEach((f, i) => {
      const rowTotal = f.qty * f.price;
      total += rowTotal;
      ht += `<div style="display:flex; gap:8px; align-items:center;">
        <select style="flex:1.5; padding:6px; border:1px solid #cbd5e1; border-radius:4px;" onchange="nUpdateFreightRow(${i}, 'type', this.value)">
          <option value="LCL" ${f.type==="LCL"?"selected":""}>LCL</option>
          <option value="20FT GP" ${f.type==="20FT GP"?"selected":""}>20FT GP</option>
          <option value="20FT DG" ${f.type==="20FT DG"?"selected":""}>20FT DG</option>
          <option value="40FT GP" ${f.type==="40FT GP"?"selected":""}>40FT GP</option>
          <option value="40HQ" ${f.type==="40HQ"?"selected":""}>40HQ</option>
          <option value="40 DG" ${f.type==="40 DG"?"selected":""}>40 DG</option>
        </select>
        <input type="number" style="flex:0.8; padding:6px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="Qty" value="${f.qty}" onchange="nUpdateFreightRow(${i}, 'qty', this.value)">
        <input type="number" style="flex:1.2; padding:6px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="Unit Price" value="${f.price}" step="0.01" onchange="nUpdateFreightRow(${i}, 'price', this.value)">
        <input type="text" style="flex:2; padding:6px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="Remarks" value="${f.remarks||''}" onchange="nUpdateFreightRow(${i}, 'remarks', this.value)">
        <div style="flex:1.2; text-align:right; font-size:13px; font-weight:600; color:#0f172a;">$` + rowTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + `</div>
        <button type="button" class="btn-del" style="padding:4px 8px; font-size:12px;" onclick="nRemoveFreightRow(${i})">??/button>
      </div>`;
    });
    container.innerHTML = ht;
    document.getElementById("freight_total_display").textContent = total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById("n_freight").value = total;
    nRecalcTotals();
  };

  window.nRecalcTotals = nRecalcTotals;

  // ?Ä?Ä PI ?Ä???òÏ†ï ?Ä?Ä
  window.nSavePI = async function(isNewRevision = false) {
    const btn = document.getElementById(isNewRevision ? "n_save_btn" : "n_save_draft_btn");
    const customerId = document.getElementById("n_customer").value;
    const piDate     = document.getElementById("n_pi_date").value;
    const rate       = parseFloat(document.getElementById("n_rate").value)||1468.96;
    if (!customerId) { alert("Í≥†Í∞ù???†ÌÉù??Ï£ºÏÑ∏??"); return; }
    if (!piDate)     { alert("?†ÏßúÎ•??ÖÎ†•??Ï£ºÏÑ∏??"); return; }
    if (!nItems.length) { alert("?ÅÌíà??1Í∞??¥ÏÉÅ Ï∂îÍ???Ï£ºÏÑ∏??"); return; }
    btn.disabled=true; btn.textContent="?Ä??Ï§?..";
    try {
      // Í∏àÏï° Í≥ÑÏÇ∞
      let subtotal=0;
      const processedItems = nItems.map((item,i)=>{
        nCalcItem(item);
        subtotal+=item._total||0;
        const itemRate = item.rate || rate;
        return {lineNumber:i+1,description:item.desc,costKrw:item.cost,quantity:item.qty,unit:item.unit,
                exchangeRate:itemRate,profitMargin:item.margin,
                costUsd:+(item.costUsd||0).toFixed(4),salePriceUsd:+(item._sale||0).toFixed(2),lineTotalUsd:+(item._total||0).toFixed(2),
                remarks:item.remarks||""};
      });
      const hand    = parseFloat(document.getElementById("n_handling").value)||0;
      const frt     = parseFloat(document.getElementById("n_freight").value)||0;
      const ins     = parseFloat(document.getElementById("n_insurance").value)||0;
      const grand   = subtotal+hand+frt+ins;
      const validUntil = document.getElementById("n_valid_until").value;
      const itemsSummary = processedItems.slice(0,3).map(i => `${i.description||'-'} (${i.quantity||0}${i.unit||''})`);

      // ?? ?†Í∑ú ?ÅÌíà ?êÎèô DB ?±Î°ù
      for (const item of processedItems) {
        if (!item.description || item.description.trim() === "") continue;
        const match = item.description.match(/\[([^\]]+)\]/);
        if (match) continue; // ?¥Î? ?ÅÌíà ÏΩîÎìúÍ∞Ä ÏßÄ?ïÎêú ??™©?Ä ?®Ïä§
        
        const existing = Object.values(productMap).find(p => p.nameKo === item.description || p.nameEn === item.description || p.productCode === item.description);
        if (existing) continue; // ?¥Î¶Ñ???ôÏùº???ÅÌíà???¥Î? Ï°¥Ïû¨?òÎ©¥ ?®Ïä§

        // ?†Í∑ú ?ÅÌíàÏΩîÎìú ?ùÏÑ± (P0001 ~ P9999 ?¨Îß∑) Î∞?DB ?±Î°ù
        let maxNum = 0;
        Object.keys(productMap).forEach(code => {
          if (/^P\d{4}$/.test(code)) {
            const num = parseInt(code.substring(1), 10);
            if (num > maxNum) maxNum = num;
          }
        });
        const newCode = `P${String(maxNum + 1).padStart(4, '0')}`;
        
        const baseCurr = item.costUsd > 0 && item.costKrw === 0 ? "USD" : "KRW";
        const purchasePrice = baseCurr === "USD" ? item.costUsd : item.costKrw;

        const newProd = {
          productCode: newCode,
          nameKo: item.description,
          nameEn: item.description,
          unit: item.unit || "KG",
          currency: baseCurr,
          purchasePrice: purchasePrice,
          categoryLarge: "Auto-Generated",
          createdAt: serverTimestamp()
        };
        await setDoc(doc(db, "companies", COMPANY_ID, "products", newCode), newProd);
        productMap[newCode] = newProd; // Î°úÏª¨ Ï∫êÏãú Ï¶âÏãú ?ÖÎç∞?¥Ìä∏
        item.description = `[${newCode}] ${item.description}`; // PI ?Ä?????†Í∑ú Î∞úÎ≤à??ÏΩîÎìú Îß§Ìïë
      }

      if (editPIId) {
        // Í∏∞Ï°¥ PI ?òÏ†ï Î∞???Î≤ÑÏ†Ñ Î∞úÌñâ
        
        // 1. ?¥Ï†Ñ Î¶¨ÎπÑ??Ï°∞Ìöå (Diff Í≥ÑÏÇ∞??
        const revsSnap = await getDocs(collection(db, "companies", COMPANY_ID, "proforma_invoices", editPIId, "revisions"));
        let latestRevDoc = null;
        let oldItems = [];
        let oldData = {};
        if (!revsSnap.empty) {
          latestRevDoc = revsSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
          oldData = latestRevDoc.data();
          const itemsSnap = await getDocs(collection(latestRevDoc.ref, "line_items"));
          oldItems = itemsSnap.docs.map(d => d.data());
        }

        const incotermsVal = document.getElementById("n_incoterms").value;
        const destVal = document.getElementById("n_dest").value;
        const paymentVal = document.getElementById("n_payment").value;
        const shippingVal = document.getElementById("n_shipping").value;
        const validityDaysVal = parseInt(document.getElementById("n_validity").value)||30;
        const remarksVal = document.getElementById("n_remarks").value;
        const revReasonVal = document.getElementById("n_rev_reason").value;
        if (!revReasonVal.trim()) { alert("Revision Reason (Î≥ÄÍ≤??¨Ïú†)Î•??ÖÎ†•??Ï£ºÏÑ∏??"); btn.disabled=false; btn.textContent="???òÏ†ï?¨Ìï≠ ?Ä??Î∞???Î¶¨ÎπÑ??Î∞úÌñâ"; return; }

        // Diff Í≥ÑÏÇ∞ Î°úÏßÅ (Change Log & changeType ?ÑÏ∂ú)
        const changeLogs = [];
        let mainChangeType = "condition_change";
        
        if (oldData.incoterms !== incotermsVal) changeLogs.push({ fieldName: 'incoterms', oldValue: oldData.incoterms||"-", newValue: incotermsVal, changeDescription: `Incoterms changed: ${oldData.incoterms||"-"} ??${incotermsVal}` });
        if (oldData.destinationPort !== destVal) changeLogs.push({ fieldName: 'destinationPort', oldValue: oldData.destinationPort||"-", newValue: destVal, changeDescription: `Destination changed: ${oldData.destinationPort||"-"} ??${destVal}` });
        if (oldData.paymentTerms !== paymentVal) changeLogs.push({ fieldName: 'paymentTerms', oldValue: oldData.paymentTerms||"-", newValue: paymentVal, changeDescription: `Payment terms changed: ${oldData.paymentTerms||"-"} ??${paymentVal}` });
        if (oldData.shippingMethod !== shippingVal) changeLogs.push({ fieldName: 'shippingMethod', oldValue: oldData.shippingMethod||"-", newValue: shippingVal, changeDescription: `Shipping method changed: ${oldData.shippingMethod||"-"} ??${shippingVal}` });

        processedItems.forEach(newItem => {
           const oldItem = oldItems.find(i => i.description === newItem.description);
           if (!oldItem) {
             newItem.isAddedInThisRevision = true;
             newItem.isModifiedInThisRevision = false;
             mainChangeType = "item_added";
             changeLogs.push({ fieldName: 'item_added', oldValue: "NULL", newValue: newItem.description, changeDescription: `Added new item: ${newItem.description} (${newItem.quantity} ${newItem.unit} @ $${newItem.salePriceUsd})` });
           } else {
             newItem.isAddedInThisRevision = false;
             let isMod = false;
             if (oldItem.salePriceUsd !== newItem.salePriceUsd) {
               isMod = true;
               mainChangeType = "price_change";
               const oldP = oldItem.salePriceUsd;
               const newP = newItem.salePriceUsd;
               const pct = oldP ? ((newP - oldP)/oldP*100).toFixed(2) : 0;
               newItem.previousPriceUsd = oldP;
               newItem.priceChangePercent = parseFloat(pct);
               changeLogs.push({ fieldName: 'salePriceUsd', oldValue: String(oldP), newValue: String(newP), changeDescription: `${newItem.description}: $${oldP} ??$${newP} (${pct>0?'+':''}${pct}%)` });
             }
             if (oldItem.quantity !== newItem.quantity) {
               isMod = true;
               if(mainChangeType !== "price_change") mainChangeType = "quantity_change";
               newItem.previousQuantity = oldItem.quantity;
               const pct = oldItem.quantity ? ((newItem.quantity - oldItem.quantity)/oldItem.quantity*100).toFixed(2) : 0;
               newItem.quantityChangePercent = parseFloat(pct);
               changeLogs.push({ fieldName: 'quantity', oldValue: String(oldItem.quantity), newValue: String(newItem.quantity), changeDescription: `${newItem.description} Qty: ${oldItem.quantity} ??${newItem.quantity}` });
             }
             newItem.isModifiedInThisRevision = isMod;
           }
        });

        oldItems.forEach(oldItem => {
           if (!processedItems.find(i => i.description === oldItem.description)) {
             mainChangeType = "item_removed";
             changeLogs.push({ fieldName: 'item_removed', oldValue: oldItem.description, newValue: "NULL", changeDescription: `Removed item: ${oldItem.description}` });
           }
        });

        if (!isNewRevision) {
          // ?®Ïàú ?Ä??(Î≤ÑÏ†Ñ ?†Ï?)
          await runTransaction(db, async tx => {
            const piRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", editPIId);
            const piSnap = await tx.get(piRef);
            if (!piSnap.exists()) throw new Error("PIÍ∞Ä Ï°¥Ïû¨?òÏ? ?äÏäµ?àÎã§.");

            tx.update(piRef, {
              piDate, customerId,
              incoterms: incotermsVal,
              destinationPort: destVal,
              paymentTerms: paymentVal,
              shippingMethod: shippingVal,
              exchangeRate: rate, validityDays: validityDaysVal,
              validUntilDate: validUntil, remarks: remarksVal,
              handlingCharges: hand, freightCharges: frt, insuranceCharges: ins,
              subtotalUsd: +subtotal.toFixed(4), totalUsd: +grand.toFixed(4),
              itemsSummary, updatedAt: serverTimestamp()
            });

            if (latestRevDoc) {
              const revRef = latestRevDoc.ref;
              tx.update(revRef, {
                incoterms: incotermsVal, destinationPort: destVal, paymentTerms: paymentVal, shippingMethod: shippingVal, exchangeRate: rate,
                subtotalUsd: +subtotal.toFixed(4), totalUsd: +grand.toFixed(4)
              });

              // Í∏∞Ï°¥ line_items ??†ú
              const itemsSnap = await getDocs(collection(revRef, "line_items"));
              itemsSnap.docs.forEach(d => tx.delete(d.ref));
              // ??line_items Ï∂îÍ?
              processedItems.forEach(item => {
                tx.set(doc(collection(revRef, "line_items")), item);
              });
            }
          });
          closeNewPI();
          alert("???òÏ†ï ?ÑÎ£å! (Î≤ÑÏ†Ñ ?†Ï?)");
        } else {
          // ??Î¶¨ÎπÑ??Î∞úÌñâ
          await runTransaction(db, async tx => {
            const piRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", editPIId);
            const piSnap = await tx.get(piRef);
            if (!piSnap.exists()) throw new Error("PIÍ∞Ä Ï°¥Ïû¨?òÏ? ?äÏäµ?àÎã§.");

            const data = piSnap.data();
            const curVer = data.currentVersion || "R1";
            let num = 1;
            if (curVer.startsWith("R")) {
               num = parseInt(curVer.substring(1)) || 1;
            } else if (curVer.length === 1 && curVer >= "A" && curVer <= "Z") {
               num = curVer.charCodeAt(0) - 64;
            }
            const nextVer = "R" + (num + 1);
            const nextRevNum = num + 1;

            // 1. Í∏∞Ï°¥ PI ?ïÎ≥¥ ?ÖÎç∞?¥Ìä∏ (Î≤ÑÏ†Ñ ?ÅÏäπ ?¨Ìï®)
            tx.update(piRef, {
              piDate, customerId,
              incoterms: incotermsVal,
              destinationPort: destVal,
              paymentTerms: paymentVal,
              shippingMethod: shippingVal,
              exchangeRate: rate, validityDays: validityDaysVal,
              validUntilDate: validUntil, remarks: remarksVal,
              handlingCharges: hand, freightCharges: frt, insuranceCharges: ins,
              subtotalUsd: +subtotal.toFixed(4), totalUsd: +grand.toFixed(4),
              currentVersion: nextVer, itemsSummary, updatedAt: serverTimestamp()
            });

            // 2. ??Revision Î¨∏ÏÑú ?±Î°ù
            const revRef = doc(collection(piRef, "revisions"));
            tx.set(revRef, {
              version: nextVer, revisionNumber: nextRevNum, status: data.status || "draft",
              incoterms: incotermsVal, destinationPort: destVal, paymentTerms: paymentVal, shippingMethod: shippingVal, exchangeRate: rate,
              revisionReason: revReasonVal, changeType: mainChangeType,
              subtotalUsd: +subtotal.toFixed(4), totalUsd: +grand.toFixed(4), createdAt: serverTimestamp()
            });

            // 3. ??Revision ?òÏúÑ Line items ?±Î°ù
            processedItems.forEach(item => {
              tx.set(doc(collection(revRef, "line_items")), item);
            });

            // 4. Change Log ?±Î°ù
            changeLogs.forEach(cl => {
              tx.set(doc(collection(revRef, "change_logs")), {
                 fieldName: cl.fieldName,
                 oldValue: cl.oldValue,
                 newValue: cl.newValue,
                 changeDescription: cl.changeDescription,
                 createdAt: serverTimestamp()
              });
            });
          });

          closeNewPI();
          const curPIObj = allPIs.find(x => x.id === editPIId);
          const curVerStr = curPIObj ? curPIObj.currentVersion || "R1" : "R1";
          let nextVerStrNum = 1;
          if (curVerStr.startsWith("R")) {
             nextVerStrNum = parseInt(curVerStr.substring(1)) || 1;
          } else if (curVerStr.length === 1 && curVerStr >= "A" && curVerStr <= "Z") {
             nextVerStrNum = curVerStr.charCodeAt(0) - 64;
          }
          const nextVerStr = "R" + (nextVerStrNum + 1);
          alert(`???òÏ†ï ?ÑÎ£å!\n??Î¶¨ÎπÑ??${nextVerStr})??Î∞úÌñâ?òÏóà?µÎãà??`);
        }
      } else {
        // ?†Í∑ú PI Î≤àÌò∏ Î∞úÎ≤à ?∏Îûú??Öò
        const year    = new Date(piDate).getFullYear();
        const metaRef = doc(db,"companies",COMPANY_ID,"meta","pi_counter");
        let num;
        await runTransaction(db, async tx => {
          const snap = await tx.get(metaRef);
          const cur  = snap.exists()?(snap.data()[`count_${year}`]||0):0;
          num = cur+1;
          tx.set(metaRef,{[`count_${year}`]:num},{merge:true});
        });
        const piNumber = `PI-${COMPANY_ID}-${year}-${String(num).padStart(2,"0")}`;

        // ?†Í∑ú Firestore ?∏Îûú??Öò ?Ä??
        await runTransaction(db, async tx=>{
          const piRef  = doc(collection(doc(db,"companies",COMPANY_ID),"proforma_invoices"));
          const revRef = doc(collection(piRef,"revisions"));
          tx.set(piRef,{piNumber,piDate,customerId,
            incoterms:document.getElementById("n_incoterms").value,
            destinationPort:document.getElementById("n_dest").value,
            paymentTerms:document.getElementById("n_payment").value,
            shippingMethod:document.getElementById("n_shipping").value,
            exchangeRate:rate,validityDays:parseInt(document.getElementById("n_validity").value)||30,
            validUntilDate:validUntil,remarks:document.getElementById("n_remarks").value,
            handlingCharges:hand,freightCharges:frt,freightDetails:data.freightDetails,insuranceCharges:ins,
            subtotalUsd:+subtotal.toFixed(4),totalUsd:+grand.toFixed(4),
            currentVersion:"R1",status:"draft",itemsSummary,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
          tx.set(revRef,{version:"R1",revisionNumber:1,status:"draft",
            subtotalUsd:+subtotal.toFixed(4),totalUsd:+grand.toFixed(4),createdAt:serverTimestamp()});
          processedItems.forEach(item=>{ tx.set(doc(collection(revRef,"line_items")),item); });
        });

        closeNewPI();
        alert(`???Ä???ÑÎ£å!\nPI Number: ${piNumber}\nGrand Total: USD ${grand.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
      }
    } catch(e) {
      alert("???Ä???§Ìå®: "+e.message); console.error(e);
    } finally { btn.disabled=false; btn.textContent=editPIId ? "???òÏ†ï?¨Ìï≠ ?Ä?? : "??Firestore ?Ä??; }
  };

  // ?Ä?Ä Ï¥àÍ∏∞???Ä?Ä
  window.addEventListener("DOMContentLoaded", async () => {
    await loadCustomerMap();
    await loadProductMap();
    subscribePIs();
  });

  // ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê
  // ?¨Ìçº: ?ºÏóê???ÑÏû¨ ?∞Ïù¥???òÏßë
  // ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê
  function nGetFormData() {
    const rate       = parseFloat(document.getElementById("n_rate").value)||1468.96;
    const customerId = document.getElementById("n_customer").value;
    const custOpt    = document.getElementById("n_customer").selectedOptions[0];
    const custName   = custOpt?.textContent || "-";
    const piDate     = document.getElementById("n_pi_date").value || new Date().toISOString().split("T")[0];
    const year       = new Date(piDate).getFullYear();
    // PI number preview (not yet saved)
    let piNum = `PI-YSACC-${year}-DRAFT`;
    let currentVersion = "";
    if (editPIId) {
      const p = allPIs.find(x => x.id === editPIId);
      if (p) {
        piNum = p.piNumber || piNum;
        currentVersion = p.currentVersion || "";
      }
    }
    const items = nItems.map((item, i) => {
      const cu = item.cost / rate;
      const sp = item.margin < 100 ? cu / (1 - item.margin / 100) : cu;
      const tot = sp * item.qty;
      return {
        no: i + 1, desc: item.desc || "-", qty: item.qty, unit: item.unit,
        costKrw: item.cost, margin: item.margin,
        saleUsd: +(sp.toFixed(2)), totalUsd: +(+(sp.toFixed(2)) * item.qty).toFixed(2),
        remarks: item.remarks || ""
      };
    });
    const subtotal  = items.reduce((s, i) => s + i.totalUsd, 0);
    const handling  = parseFloat(document.getElementById("n_handling").value)||0;
    const freight   = parseFloat(document.getElementById("n_freight").value)||0;
    const insurance = parseFloat(document.getElementById("n_insurance").value)||0;
    const grand     = subtotal + handling + freight + insurance;
    return {
      piNum, piDate, currentVersion,
      validUntil:   document.getElementById("n_valid_until").value,
      customer:     custName,
      contact:      document.getElementById("n_contact").value,
      email:        document.getElementById("n_email").value,
      incoterms:    document.getElementById("n_incoterms").value,
      destination:  document.getElementById("n_dest").value,
      payment:      document.getElementById("n_payment").value,
      shipping:     document.getElementById("n_shipping").value,
      departurePort: document.getElementById("n_departurePort").value,
      packagingSpec: document.getElementById("n_packagingSpec").value,
      validityDesc: document.getElementById("n_validityDesc").value,
      rate, remarks: document.getElementById("n_remarks").value,
      items, subtotal, handling, freight, freightDetails: nFreightItems, insurance, grand
    };
  }

  // ================================================
  // Excel (ExcelJS) - ?úÌîåÎ¶??∞Îèô Î∞©Ïãù
  // ================================================
  window.nExportExcel = async function() {
    if (!window.ExcelJS) { alert("Excel ?ºÏù¥Î∏åÎü¨Î¶?Î°úÎî© Ï§?.."); return; }
    var d = nGetFormData();
    if (!d.items.length) { alert("?ÅÌíà??1Í∞??¥ÏÉÅ Ï∂îÍ???Ï£ºÏÑ∏??"); return; }

    var btn = document.querySelector("button[onclick='nExportExcel()']");
    if(btn) { btn.disabled = true; btn.innerHTML = "???ëÏ? ?ùÏÑ± Ï§?.."; }

    try {
      // 1. ?úÌîåÎ¶??åÏùº Î°úÎìú
      const response = await fetch('/TEMPLATE.xlsx');
      if (!response.ok) throw new Error("?úÌîåÎ¶??åÏùº??Ï∞æÏùÑ ???ÜÏäµ?àÎã§.");
      const arrayBuffer = await response.arrayBuffer();

      // 2. ?åÌÅ¨Î∂??¥Í∏∞
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.worksheets[0]; // Ï≤?Î≤àÏß∏ ?úÌä∏ (?àÏ†Ñ??Î∞©Ïãù)

      // 3. Í∏∞Î≥∏ ?ïÎ≥¥ ?ÖÎ†• (Í≥†Ï†ï ?Ä Ï¢åÌëú)
      ws.getCell('G3').value = d.piDate;
      const fullPiNum = (d.piNum || "") + (d.currentVersion || "");
      ws.getCell('G5').value = fullPiNum;
      ws.getCell('G5').alignment = { horizontal: 'right', vertical: 'middle' };    
      const custId = document.getElementById("n_customer").value;
      const custInfo = customerMap[custId] || {};
      const custAddr = custInfo.address || custInfo.addressEn || "";
      
      ws.getCell('A12').value = "Messers : " + d.customer;
      ws.getCell('A13').value = "    " + custAddr;

      ws.getCell('C16').value = d.departurePort;
      ws.getCell('G16').value = d.incoterms;
      ws.getCell('C17').value = d.packagingSpec;
      ws.getCell('G17').value = d.destination;
      ws.getCell('C18').value = d.validityDesc;
      ws.getCell('G18').value = "KOREA";
      ws.getCell('C19').value = d.payment;

      // 4. ?ÅÌíà ?ºÏù∏ ?ÖÎ†• (28?âÎ???34?âÍπåÏßÄ)
      let currentRow = 28;
      let grandTotal = 0;
      d.items.forEach(function(item, index) {
        if (currentRow > 34) return; // ?úÌîåÎ¶??úÍ≥Ñ Ï¥àÍ≥º ??Î¨¥Ïãú

        var sp = item.saleUsd || 0;
        var qty = item.qty || 0;
        var lineTotal = Math.round(sp * qty * 100) / 100;
        grandTotal += lineTotal;

        ws.getCell('A'+currentRow).value = index + 1;
        ws.getCell('B'+currentRow).value = item.desc || "-";
        ws.getCell('C'+currentRow).value = item.spec || "";
        ws.getCell('D'+currentRow).value = sp;
        ws.getCell('E'+currentRow).value = qty;
        ws.getCell('F'+currentRow).value = lineTotal;
        ws.getCell('G'+currentRow).value = item.remarks || "";
        currentRow++;
      });

      // Í∏∞Ï°¥ ?úÌîåÎ¶øÏóê ?®ÏïÑ?àÎäî ??ÏßÄ?∞Í∏∞ (?ÅÌíà??7Í∞?ÎØ∏Îßå??Í≤ΩÏö∞)
      for (let i = currentRow; i <= 34; i++) {
        ws.getCell('A'+i).value = "";
        ws.getCell('B'+i).value = "";
        ws.getCell('C'+i).value = "";
        ws.getCell('D'+i).value = "";
        ws.getCell('E'+i).value = "";
        ws.getCell('F'+i).value = "";
        ws.getCell('G'+i).value = "";
      }

      // 5. Ï∂îÍ? ÎπÑÏö© ?ÖÎ†• (35??
      var extraCharges = (d.handling||0) + (d.freight||0) + (d.insurance||0);
      if (extraCharges > 0) {
        grandTotal += extraCharges;
        ws.getCell('E35').value = 1; // qty
        ws.getCell('F35').value = extraCharges; // price & total
      } else {
        // Ï∂îÍ?ÎπÑÏö© ?ÜÏúºÎ©?ÎπÑÏö∞Í∏?
        ws.getCell('A35').value = "";
        ws.getCell('E35').value = "";
        ws.getCell('F35').value = "";
        ws.getCell('G35').value = "";
      }

      // 6. ?©Í≥Ñ ?ÖÎ†• (36??F??
      // ?úÌîåÎ¶øÏùò ?òÏãù????ñ¥?????àÎèÑÎ°?Í∞íÏùÑ ÏßÅÏ†ë ?ÖÎ†•?©Îãà??
      ws.getCell('F36').value = grandTotal;

      // ?åÏùº ?§Ïö¥Î°úÎìú
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const fullPiNumFile = (d.piNum || "PI-YSACC") + (d.currentVersion || "");
      const fileName = (fullPiNumFile.replace(/[^a-zA-Z0-9-]/g,"_"))+"_"+d.piDate+".xlsx";
      saveAs(blob, fileName);

    } catch (e) {
      alert("?ëÏ? ?Ä??Ï§??§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§: " + e.message);
      console.error(e);
    } finally {
      if(btn) { btn.disabled = false; btn.innerHTML = "?ìä Excel ?Ä??; }
    }
  };

  // ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê
  // ?ìÑ PDF ?Ä??(jsPDF + AutoTable)
  // ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê
  window.nExportPDF = function() {
    if (!window.jspdf) { alert("PDF ?ºÏù¥Î∏åÎü¨Î¶?Î°úÎî© Ï§?.."); return; }
    const d = nGetFormData();
    if (!d.items.length) { alert("?ÅÌíà??1Í∞??¥ÏÉÅ Ï∂îÍ???Ï£ºÏÑ∏??"); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    const PAGE_W = 210;
    const PAGE_H = 297;
    const M = 15; // margin

    // Î∞∞Í≤Ω???òÏ??âÏúºÎ°?Ïπ†ÌïòÍ∏?(jsPDF Í∏∞Î≥∏Í∞íÏù¥ ?∞ÏÉâ?¥Ï?Îß??πÏãú Î™∞Îùº Î™ÖÏãú)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    // ?Ä?Ä 1. Letterhead ?¥Î?ÏßÄ ?ΩÏûÖ ?Ä?Ä
    var img = new Image();
    img.src = "letterhead.png"; // ?†Ï≤®?¥Ï£º???àÌÑ∞?§Îìú ?åÏùº ?¥Î¶Ñ
    img.crossOrigin = "Anonymous";
    
    img.onload = function() {
      // ?àÌÑ∞?§Îìú??A4 ??210mm)??ÍΩ?Ï±ÑÏö∞?ÑÎ°ù ?§Ï†ï
      const imgRatio = img.height / img.width;
      const lhWidth = PAGE_W;
      const lhHeight = lhWidth * imgRatio;
      
      doc.addImage(img, 'PNG', 0, 0, lhWidth, lhHeight);
      drawPdfContent(lhHeight + 10);
    };
    img.onerror = function() {
      // ?¥Î?ÏßÄÍ∞Ä ?ÜÏùÑ Í≤ΩÏö∞ ?ÄÏ≤??çÏä§??
      doc.setFontSize(22); doc.setTextColor(0, 0, 0); doc.setFont("helvetica","bold");
      doc.text("YSACC CO., LTD.", M, 20);
      drawPdfContent(35);
    };

    function drawPdfContent(startY) {
      let y = startY;

      // ?Ä?Ä ?Ä?¥Ì? Î∞??†Ïßú ?Ä?Ä
      doc.setFontSize(16); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
      doc.text("PROFORMA INVOICE", PAGE_W - M, y, {align:"right"});
      y += 6;
      doc.text(`Date: ${d.piDate||"-"}`, PAGE_W - M, y, {align:"right"});
      y += 5;
      doc.text(`Valid Until: ${d.validUntil}`, PAGE_W - M, y, {align:"right"});
      y += 10;

      // ?Ä?Ä PI Î≤àÌò∏ ?Ä?Ä
      doc.setFillColor(245, 245, 245);
      doc.rect(M, y, PAGE_W - M*2, 10, "F");
      doc.setFontSize(11); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
      const fullPiNum = (d.piNum || "") + (d.currentVersion || "");
      doc.text(`PI No: ${fullPiNum}`, M+3, y+7);
      y += 15;

      // ?Ä?Ä Bill To & Shipment Info ?Ä?Ä
      const colW = (PAGE_W - M*2 - 5) / 2;
      const boxH = 38;

      // Bill To Box
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(255, 255, 255);
      doc.rect(M, y, colW, boxH, "DF");
      doc.setFontSize(9); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
      doc.text("BILL TO", M+3, y+6);
      doc.setFont("helvetica","normal");
      doc.text(d.customer, M+3, y+12, {maxWidth: colW-6});
      doc.setTextColor(80,80,80);
      if (d.contact) doc.text(`Contact: ${d.contact}`, M+3, y+20);
      if (d.email)   doc.text(`Email: ${d.email}`, M+3, y+26);

      // Shipment Info Box
      const rx = M + colW + 5;
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(255, 255, 255);
      doc.rect(rx, y, colW, boxH, "DF");
      doc.setFontSize(9); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
      doc.text("SHIPMENT INFO", rx+3, y+6);
      doc.setFont("helvetica","normal");
      
      const si = [
        ["Departure",   d.departurePort],
        ["Packaging",   d.packagingSpec.length > 25 ? d.packagingSpec.substring(0,25)+"..." : d.packagingSpec],
        ["Validity",    d.validityDesc.length > 25 ? d.validityDesc.substring(0,25)+"..." : d.validityDesc],
        ["Incoterms",   d.incoterms + " " + d.destination],
        ["Destination", d.destination],
        ["Payment",     d.payment.length > 25 ? d.payment.substring(0,25)+"..." : d.payment],
        ["Shipping",    d.shipping],
      ];
      si.forEach((row, i) => {
        doc.setTextColor(100,100,100);
        doc.text(row[0]+":", rx+3, y+11+i*4);
        doc.setTextColor(0,0,0);
        doc.text(row[1]||"-", rx+22, y+11+i*4);
      });
      y += boxH + 8;

      // ?Ä?Ä ?åÏù¥Î∏??Ä?Ä
      // Spec ??Îπ†Ïßê?ÜÏù¥ ?¨Ìï®
      doc.autoTable({
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' },
        styles: { fontSize: 8, textColor: [33, 33, 33] },
        columnStyles: {
          5: { halign: 'right' },
          6: { halign: 'right' }
        },
        head: [["#","Description","Spec","Qty","Unit","Unit Price","Total (USD)","Remarks"]],
        body: d.items.map(i => [
          i.no, 
          i.desc, 
          i.spec || "-",
          i.qty, 
          i.unit, 
          "$" + Number(i.saleUsd||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), 
          "$" + (Number(i.saleUsd||0)*Number(i.qty||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
          i.remarks || ""
        ]),
        margin: { left: M, right: M }
      });

      y = doc.lastAutoTable.finalY + 8;

      // ?Ä?Ä ?îÏïΩ Î∞ïÏä§ (?∞Ï∏° ?òÎã®) ?Ä?Ä
      const sumW = 85;
      const sumX = PAGE_W - M - sumW;
      
      let frtDetailsH = 0;
      if (d.freightDetails && d.freightDetails.length > 0) {
        frtDetailsH = d.freightDetails.length * 5;
      }
      const sumBoxH = 35 + frtDetailsH;

      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(200, 200, 200);
      doc.rect(sumX, y, sumW, sumBoxH, "DF");

      doc.setFontSize(9); doc.setTextColor(80,80,80);
      let curY = y + 8;
      doc.text("Handling Charges:", sumX+5, curY);
      doc.text("$" + Number(d.handling||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), sumX+sumW-5, curY, {align:"right"});
      curY += 7;
      
      doc.text((d.incoterms||"Freight") + " Charges:", sumX+5, curY);
      doc.text("$" + Number(d.freight||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), sumX+sumW-5, curY, {align:"right"});
      
      if (d.freightDetails && d.freightDetails.length > 0) {
        doc.setFontSize(7); doc.setTextColor(120,120,120);
        d.freightDetails.forEach(f => {
          curY += 5;
          let remarkStr = f.remarks ? ` (${f.remarks})` : "";
          let text = `- ${f.type} x ${f.qty}${remarkStr}`;
          if (text.length > 45) text = text.substring(0, 43) + "...";
          doc.text(text, sumX+5, curY);
          doc.text("$" + (f.qty * f.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), sumX+sumW-5, curY, {align:"right"});
        });
        doc.setFontSize(9); doc.setTextColor(80,80,80);
        curY += 3;
      } else {
        curY += 7;
      }
      
      doc.text("Insurance Charges:", sumX+5, curY);
      doc.text("$" + Number(d.insurance||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), sumX+sumW-5, curY, {align:"right"});
      curY += 8;

      // Grand Total Í≥ÑÏÇ∞
      let itemSum = 0;
      d.items.forEach(i => { itemSum += Number(i.saleUsd||0) * Number(i.qty||0); });
      let gt = itemSum + Number(d.handling||0) + Number(d.freight||0) + Number(d.insurance||0);

      doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont("helvetica","bold");
      doc.text("GRAND TOTAL:", sumX+5, curY);
      doc.setTextColor(0, 100, 0);
      doc.text("USD $" + gt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}), sumX+sumW-5, curY, {align:"right"});

      // ?Ä?Ä Remarks (Ï¢åÏ∏° ?òÎã®) ?Ä?Ä
      if(d.remarks) {
          doc.setFontSize(9); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
          doc.text("Remarks:", M, y+8);
          doc.setFont("helvetica","normal"); doc.setTextColor(80,80,80);
          
          let splitRemarks = doc.splitTextToSize(d.remarks, PAGE_W - M*2 - sumW - 10);
          doc.text(splitRemarks, M, y+14);
      }
      
      y += 45;
      
      // ?Ä?Ä ?Ä???ïÎ≥¥ (?ÑÎûòÎ°?Î∞ÄÎ¶????àÏúºÎØÄÎ°??òÏù¥ÏßÄ ?òÏñ¥Í∞ÄÎ©??àÌéò?¥Ï?)
      if (y > PAGE_H - 40) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont("helvetica","bold");
      doc.text("Bank Information", M, y);
      y += 6;
      doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(80,80,80);
      doc.text("Bank Name : INDUSTRIAL BANK OF KOREA, SEOUL, KOREA", M, y); y += 5;
      doc.text("Account No. : 143-129260-56-00012", M, y); y += 5;
      doc.text("Beneficiary : YSACC Co.,LTD", M, y); y += 5;
      doc.text("Swift Code : IBKOKRSEXXX", M, y); y += 15;

      // ?Ä?Ä ?úÎ™Ö?Ä ?Ä?Ä
      doc.setFontSize(9); doc.setTextColor(0,0,0);
      doc.text("Accepted by :", M, y);
      doc.text("__________________________", M, y+10);
      
      doc.text("Managing Director  JU HAN, KIM", PAGE_W - M, y, {align:"right"});
      doc.text("__________________________", PAGE_W - M, y+10, {align:"right"});
      doc.text("YS ACC", PAGE_W - M - 20, y+5, {align:"right"});

      const fullPiNumFile = (d.piNum || "PI-YSACC") + (d.currentVersion || "");
      const fileName = (fullPiNumFile.replace(/[^a-zA-Z0-9-]/g,"_"))+"_"+d.piDate+".pdf";
      
      window._currentPdfDoc = doc;
      window._currentPdfFileName = fileName;
      
      const blobUrl = doc.output("bloburl");
      document.getElementById("pdf_iframe").src = blobUrl;
      document.getElementById("pdf_preview_overlay").classList.add("open");
      document.body.style.overflow = "hidden";
    }
  };

  window.closePdfPreview = function(e) {
    if (e && e.type === "click" && e.target !== document.getElementById("pdf_preview_overlay")) return;
    document.getElementById("pdf_preview_overlay").classList.remove("open");
    document.getElementById("pdf_iframe").src = "";
    document.body.style.overflow = "";
  };

  window.downloadPdfPreview = function() {
    if (window._currentPdfDoc) window._currentPdfDoc.save(window._currentPdfFileName);
  };

  window.printPdfPreview = function() {
    const iframe = document.getElementById("pdf_iframe");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  // ?Ä?Ä Timeline Î™®Îã¨ ?Ä?Ä
  window.openTimeline = async function(piId) {
    const p = allPIs.find(x => x.id === piId);
    if (!p) return;
    document.getElementById("tl_modal_sub").textContent = p.piNumber || "-";
    document.getElementById("timeline_overlay").classList.add("open");
    document.body.style.overflow = "hidden";
    
    const body = document.getElementById("timeline_body");
    body.innerHTML = "<div style='text-align:center;padding:20px;'>Î∂àÎü¨?§Îäî Ï§?..</div>";

    try {
      const revsSnap = await getDocs(collection(db, "companies", COMPANY_ID, "proforma_invoices", piId, "revisions"));
      const revs = revsSnap.docs.map(d => ({id:d.id, ...d.data()}));
      revs.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));

      if (revs.length === 0) {
        body.innerHTML = "<div style='text-align:center;padding:20px;color:var(--text-muted);'>?¥Ï†Ñ Revision ?∞Ïù¥?∞Í? ?ÜÏäµ?àÎã§. (Ï¥àÍ∏∞ ?ëÏÑ±??PI)</div>";
        return;
      }

      let html = `<div style="margin-bottom:15px; font-weight:600;">Current Version: ${p.currentVersion || "R1"}</div>`;
      html += `<div style="position:relative; padding-left:20px; border-left:2px solid #e2e8f0;">`;

      for (const rev of revs) {
        const dateStr = rev.createdAt?.seconds ? new Date(rev.createdAt.seconds*1000).toLocaleString() : "-";
        let logsHtml = "";
        
        try {
          const logsSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId, "revisions", rev.id), "change_logs"));
          if (!logsSnap.empty) {
            logsHtml += `<div style="margin-top:10px; font-size:12px; background:#fff; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">`;
            logsHtml += `<div style="font-weight:600; margin-bottom:5px; color:#475569;">Î≥ÄÍ≤??¥Ïó≠ (Change Log)</div>`;
            logsSnap.docs.forEach(ld => {
              const log = ld.data();
              logsHtml += `<div style="margin-bottom:3px;">??${log.changeDescription}</div>`;
            });
            logsHtml += `</div>`;
          }
        } catch(e) { console.error(e); }

        const reason = rev.revisionReason ? `<div style="color:#0f172a; font-weight:500; margin-top:5px;">Reason: ${rev.revisionReason}</div>` : "";
        const badgeColor = rev.version === p.currentVersion ? "background:#2563eb;color:#fff;" : "background:#e2e8f0;color:#475569;";

        html += `
          <div style="position:relative; margin-bottom:20px;">
            <div style="position:absolute; left:-27px; top:0; width:12px; height:12px; border-radius:50%; background:#2563eb; border:2px solid #fff;"></div>
            <div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; font-size:15px; display:inline-block; padding:2px 8px; border-radius:4px; ${badgeColor}">Revision ${rev.version}</span>
                <span style="font-size:12px; color:var(--text-muted);">${dateStr}</span>
              </div>
              ${reason}
              <div style="margin-top:5px; font-size:13px; color:var(--text-muted);">
                Total: $${(rev.totalUsd||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
              ${logsHtml}
            </div>
          </div>
        `;
      }
      html += `</div>`;
      body.innerHTML = html;

    } catch(e) {
      body.innerHTML = `<div style="color:red;">Error: ${e.message}</div>`;
    }
  };

  window.closeTimelineModal = function() {
    document.getElementById("timeline_overlay").classList.remove("open");
    document.body.style.overflow = "";
  };
  window.closeTimelineOnOverlay = function(e) {
    if (e.target === document.getElementById("timeline_overlay")) closeTimelineModal();
  };

