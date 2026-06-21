const fs = require('fs');
let content = fs.readFileSync('app/src/pages/OrderDetail.tsx', 'utf8');
content = content.replace(/http:\/\/localhost:3000/g, "${import.meta.env.VITE_API_URL || 'http://localhost:3000'}");
fs.writeFileSync('app/src/pages/OrderDetail.tsx', content);
console.log('Replaced localhost');
