const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// Normalize all newlines
content = content.replace(/\r\n/g, '\n');

const oldLine = "const [showPoDetails, setShowPoDetails] = useState(false);";
const newLine = "const [activeDocumentTab, setActiveDocumentTab] = useState<'서류업로드' | 'CI_PL작성'>('서류업로드');\n  const [showPoDetails, setShowPoDetails] = useState(false);";

if (content.indexOf(oldLine) !== -1) {
  content = content.replace(oldLine, newLine);
  // Also make sure exportCiPlToExcel is imported
  const oldImport = "import html2canvas from 'html2canvas';";
  const newImport = "import html2canvas from 'html2canvas';\nimport { exportCiPlToExcel } from '../utils/ciPlExcelGenerator';";
  
  if (content.indexOf(oldImport) !== -1 && content.indexOf('ciPlExcelGenerator') === -1) {
    content = content.replace(oldImport, newImport);
  }
  
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('✅ OrderDetail.tsx repaired successfully via strict replacement!');
} else {
  console.log('❌ Could not find target state line showPoDetails.');
}
