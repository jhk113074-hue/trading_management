const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. handlePriceHistoryAdd, handlePriceHistoryChange, handlePriceHistoryDelete, handleApplyBasePrice 삭제
  const oldUnusedFunctions = `  const handlePriceHistoryAdd = () => {
    setFormData(prev => ({
      ...prev,
      purchasePrices: [
        ...(prev.purchasePrices || []),
        { validFrom: '', validTo: '', currency: 'USD', price: 0, minQty: 0, discountRate: 0, remarks: '' }
      ]
    }));
  };

  const handlePriceHistoryChange = (index: number, field: keyof ProductPriceHistory, value: any) => {
    const newHistory = [...(formData.purchasePrices || [])];
    newHistory[index] = { ...newHistory[index], [field]: value };
    setFormData(prev => ({ ...prev, purchasePrices: newHistory }));
  };

  const handlePriceHistoryDelete = (index: number) => {
    const newHistory = [...(formData.purchasePrices || [])];
    newHistory.splice(index, 1);
    setFormData(prev => ({ ...prev, purchasePrices: newHistory }));
  };

  const handleApplyBasePrice = (index: number) => {
    const hist = formData.purchasePrices?.[index];
    if (!hist) return;
    setFormData(prev => ({
      ...prev,
      purchasePrice: hist.price,
      currency: hist.currency,
      priceValidFrom: hist.validFrom,
      priceValidTo: hist.validTo,
      discountRate: hist.discountRate
    }));
    alert('✅ 선택한 단가 정보가 현재 기준 단가로 적용되었습니다.');
  };`;

  if (content.includes(oldUnusedFunctions)) {
    content = content.replace(oldUnusedFunctions, '');
  } else {
    // 혹시 다르게 매칭되는 구석이 있다면 개별 지우기 시도
    content = content.replace(/const handlePriceHistoryAdd = \(\) => \{[\s\S]*?\};\s*\n/g, '');
    content = content.replace(/const handlePriceHistoryChange = \([\s\S]*?\};\s*\n/g, '');
    content = content.replace(/const handlePriceHistoryDelete = \([\s\S]*?\};\s*\n/g, '');
    content = content.replace(/const handleApplyBasePrice = \([\s\S]*?\};\s*\n/g, '');
  }

  // 2. Select 및 gridInputStyle 정의 지우기
  const oldUnusedStyles = `const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{label}</label>
    <select 
      value={value ?? ''} 
      onChange={e => onChange(e.target.value)} 
      style={{ 
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        padding: '9px 12px', 
        border: '1px solid #cbd5e1', 
        borderRadius: '6px', 
        fontSize: '13px',
        background: '#fff',
        color: '#0f172a',
        outline: 'none',
        transition: 'border-color 0.15s'
      }}
      onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

const gridInputStyle = { width: '100%', padding: '4px 6px', fontSize: '12px', border: '1px solid #e8ecf0', borderRadius: '4px' };`;

  if (content.includes(oldUnusedStyles)) {
    content = content.replace(oldUnusedStyles, '');
  }

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx unused code cleaned.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
