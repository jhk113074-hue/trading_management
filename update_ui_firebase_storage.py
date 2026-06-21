import os

path = 'app/src/pages/OrderDetail.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove fetchIssuedDocs
target_use_effect = """  // Load Order document
  useEffect(() => {
    if (!id) return;
    const fetchIssuedDocs = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/po/${id}/documents`);
        const data = await res.json();
        if (data.documents) setIssuedDocs(data.documents);
      } catch (e) {
        console.error("Failed to fetch issued docs", e);
      }
    };
    fetchIssuedDocs();"""

replacement_use_effect = """  // Load Order document
  useEffect(() => {
    if (!id) return;"""
content = content.replace(target_use_effect, replacement_use_effect)

# 2. Add updateDoc
if "updateDoc" not in content.split("import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection }")[0]:
    content = content.replace(
        "import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection } from 'firebase/firestore';",
        "import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection, updateDoc } from 'firebase/firestore';"
    )

if "import { db, COMPANY_ID, storage } from '../firebase';" in content:
    content = content.replace("import { db, COMPANY_ID, storage } from '../firebase';", "import { db, COMPANY_ID, storage, auth } from '../firebase';")

# 3. Rewrite issueAndSavePO manually by splitting
issue_start_index = content.find("  const issueAndSavePO = async (supplierName: string, items: OrderItem[]) => {")
if issue_start_index != -1:
    confirm_index = content.find("const confirmed = window.confirm", issue_start_index)
    if confirm_index != -1:
        # body is from issue_start_index to confirm_index
        body = content[issue_start_index:confirm_index]
        
        # Now find the end of issueAndSavePO
        email_start_index = content.find("  const handleEmailSupplierPo =", confirm_index)
        
        new_issue = body + """    const totalAmount = items.reduce((sum, it) => {
      const price = (it as any).purchaseUnitPrice !== undefined ? (it as any).purchaseUnitPrice : it.unitPrice;
      return sum + (price || 0) * (it.qty || 0);
    }, 0);

    const confirmed = window.confirm(`발주서를 발행하시겠습니까?\\n\\nPO번호: ${poNum}\\n거래처: ${supplierName}\\n⚠️ 발행 후 금액/수량 수정 시 재발행이 필요합니다.`);
    if (!confirmed) return;

    try {
      const resApi = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/pdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: printHtml })
      });
      
      if (!resApi.ok) throw new Error('PDF 변환에 실패했습니다.');
      const pdfBlob = await resApi.blob();

      const currentIssuedDocs = (order as any)?.po_issued_documents || [];
      const version = currentIssuedDocs.filter((d: any) => d.po_number === poNum).length + 1;
      const safeFileName = `${poNum.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_v${version}.pdf`;
      const storageRef = ref(storage, `companies/${COMPANY_ID}/orders/${order?.id}/po_issued_docs/${safeFileName}`);
      
      const snapshot = await uploadBytesResumable(storageRef, pdfBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newDoc = {
        id: new Date().getTime().toString(),
        po_number: poNum,
        supplier_name: supplierName,
        version: version,
        fileName: safeFileName,
        fileUrl: downloadURL,
        issuedAt: new Date().toISOString(),
        issuedBy: auth.currentUser?.displayName || 'System',
        totalAmount: totalAmount,
        status: 'active'
      };

      const updatedDocs = currentIssuedDocs.map((doc: any) => {
        if (doc.po_number === poNum) {
          return { ...doc, status: 'superseded' };
        }
        return doc;
      });
      updatedDocs.push(newDoc);

      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order?.id!);
      await updateDoc(docRef, {
        po_issued_documents: updatedDocs,
        po_issue_status: 'issued'
      });

      alert('✅ 발주서가 성공적으로 발행 및 클라우드에 저장되었습니다.');
      setIssuedDocs(updatedDocs);
      
    } catch (e) {
      console.error(e);
      alert('발행 중 오류가 발생했습니다.');
    }
  };

"""
        
        content = content[:issue_start_index] + new_issue + content[email_start_index:]

# 4. update order
content = content.replace(
    "setOrder(data);",
    "setOrder(data);\n        if ((data as any).po_issued_documents) {\n          setIssuedDocs((data as any).po_issued_documents);\n        }"
)

# 5. Fix URLs
content = content.replace("href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${doc.fileUrl}`}", "href={doc.fileUrl}")
content = content.replace("href={`http://localhost:3000${doc.fileUrl}`}", "href={doc.fileUrl}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Update Done!")
