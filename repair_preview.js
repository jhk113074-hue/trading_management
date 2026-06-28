const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace(/\r\n/g, '\n');

// 1. Add CiPlPreviewModal import
const importAnchor = "import { exportCiPlToExcel } from '../utils/ciPlExcelGenerator';";
const newImport = "import { exportCiPlToExcel } from '../utils/ciPlExcelGenerator';\nimport { CiPlPreviewModal } from '../components/CiPlPreviewModal';";

if (content.indexOf(importAnchor) !== -1 && content.indexOf('CiPlPreviewModal') === -1) {
  content = content.replace(importAnchor, newImport);
  console.log('✅ CiPlPreviewModal import added!');
}

// 2. Add isCiPlPreviewOpen state hook
const stateAnchor = "const [activeDocumentTab, setActiveDocumentTab] = useState<'서류업로드' | 'CI_PL작성'>('서류업로드');";
const newState = "const [activeDocumentTab, setActiveDocumentTab] = useState<'서류업로드' | 'CI_PL작성'>('서류업로드');\n  const [isCiPlPreviewOpen, setIsCiPlPreviewOpen] = useState(false);";

if (content.indexOf(stateAnchor) !== -1 && content.indexOf('isCiPlPreviewOpen') === -1) {
  content = content.replace(stateAnchor, newState);
  console.log('✅ isCiPlPreviewOpen state added!');
}

// 3. Add Preview Button to document buttons row
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

// 4. Mount CiPlPreviewModal right before the closing div and return expression
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
                basicForm.packingList.containers.forEach((c) => {
                  (c.items || []).forEach((plIt) => {
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
} else {
  console.log('❌ Could not find target modalMountAnchor at the bottom of JSX.');
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('✅ OrderDetail.tsx preview setup done.');
