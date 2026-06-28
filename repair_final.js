const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace(/\r\n/g, '\n');

// 1. Add Imports
const oldImport = "import html2canvas from 'html2canvas';";
const newImport = "import html2canvas from 'html2canvas';\nimport { exportCiPlToExcel } from '../utils/ciPlExcelGenerator';\nimport { CiPlPreviewModal } from '../components/CiPlPreviewModal';";

if (content.indexOf(oldImport) !== -1 && content.indexOf('CiPlPreviewModal') === -1) {
  content = content.replace(oldImport, newImport);
  console.log('✅ Imports added!');
}

// 2. Add State Hooks
const oldState = "const [showPoDetails, setShowPoDetails] = useState(false);";
const newState = "const [activeDocumentTab, setActiveDocumentTab] = useState<'서류업로드' | 'CI_PL작성'>('서류업로드');\n  const [isCiPlPreviewOpen, setIsCiPlPreviewOpen] = useState(false);\n  const [showPoDetails, setShowPoDetails] = useState(false);";

if (content.indexOf(oldState) !== -1 && content.indexOf('isCiPlPreviewOpen') === -1) {
  content = content.replace(oldState, newState);
  console.log('✅ State hooks added!');
}

// 3. Add Preview Button
const btnAnchor = `                        <button
                          type="button"
                          onClick={handleExportExcelLocal}`;

const newBtn = `                        <button
                          type="button"
                          onClick={() => setIsCiPlPreviewOpen(true)}
                          style={{ padding: '6px 14px', background: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          🔍 미리보기
                        </button>
                        <button
                          type="button"
                          onClick={handleExportExcelLocal}`;

if (content.indexOf(btnAnchor) !== -1) {
  content = content.replace(btnAnchor, newBtn);
  console.log('✅ Preview button added!');
}

// 4. Mount Preview Modal at the bottom
const modalMountAnchor = `    </div>
  );
};

const inputStyle = (isEditing: boolean) => ({`;

const modalMountCode = `      {order && (
        <CiPlPreviewModal
          isOpen={isCiPlPreviewOpen}
          onClose={() => setIsCiPlPreviewOpen(false)}
          data={{
            piNumber: basicForm.piNumber,
            invoiceDate: basicForm.poDate || new Date().toISOString().split('T')[0],
            customerName: basicForm.customer,
            customerAddress: basicForm.customerAddress || '',
            issuingCompany: basicForm.issuingCompany,
            lcNo: basicForm.lcNo,
            lcDate: basicForm.lcIssuingDate,
            lcIssuingBank: basicForm.lcIssuingBank,
            notifyParty: basicForm.lcRemark || 'SAME AS APPLICANT', 
            remarks: basicForm.remark,
            portOfLoading: basicForm.portOfLoading,
            portOfDischarge: basicForm.portOfDischarge,
            vesselName: basicForm.vesselBooking,
            etd: basicForm.etd,
            paymentTerms: basicForm.paymentTerms,
            deliveryTerms: basicForm.incoterms,
            shippingMarks: (commonShippingMark.company || 'YSACC') + '\\n' + ((commonShippingMark.port || '') + ', ' + (commonShippingMark.country || '')) + '\\n' + (commonShippingMark.origin || 'MADE IN KOREA'),
            items: orderItems.map(it => {
              const matchedProd = products.find(p => p.productCode === it.itemId || p.id === it.itemId);
              let itemNetWeight = matchedProd?.palletWeight || 0;
              let itemGrossWeight = matchedProd?.palletGrossWeight || 0;
              let itemCbm = 0.5;
              let itemPkgCount = it.qty;
              let itemPkgType = matchedProd?.packageType || 'Pallet';

              if (basicForm.packingList?.containers) {
                basicForm.packingList.containers.forEach((c: any) => {
                  (c.items || []).forEach((plIt: any) => {
                    if (plIt.description?.includes(it.name) || plIt.pkgNo?.includes(it.itemId)) {
                      itemNetWeight = Number(plIt.netWeight) || 0;
                      itemGrossWeight = Number(plIt.grossWeight) || 0;
                      itemCbm = Number(plIt.cbm) || 0;
                      itemPkgCount = Number(plIt.pkg) || 0;
                      itemPkgType = plIt.packageType || 'Pallet';
                    }
                  });
                });
              }

              return {
                name: it.name || '',
                qty: it.qty || 0,
                unit: it.unit || 'kg',
                unitPrice: it.unitPrice || 0,
                amount: it.amount || 0,
                hsCode: it.hsCode || matchedProd?.hsCode || '',
                netWeight: itemNetWeight,
                grossWeight: itemGrossWeight,
                cbm: itemCbm,
                packageType: itemPkgType,
                packagesCount: itemPkgCount
              };
            })
          }}
        />
      )}
    </div>
  );
};

const inputStyle = (isEditing: boolean) => ({`;

if (content.indexOf(modalMountAnchor) !== -1) {
  content = content.replace(modalMountAnchor, modalMountCode);
  console.log('✅ CiPlPreviewModal mounted successfully at the bottom!');
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('✅ OrderDetail.tsx unified final setup complete.');
