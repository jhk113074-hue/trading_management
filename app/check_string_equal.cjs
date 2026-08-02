const name1 = "(주)한성엠엔에스";
const name2 = "(주)한성엠엔에스"; // from items[0].supplier

const clean1 = name1.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const clean2 = name2.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

console.log(`clean1: "${clean1}" (length: ${clean1.length})`);
console.log(`clean2: "${clean2}" (length: ${clean2.length})`);
console.log(`clean1 === clean2 : ${clean1 === clean2}`);

// Character code breakdown
console.log("clean1 charCodes:", Array.from(clean1).map(c => c.charCodeAt(0)));
console.log("clean2 charCodes:", Array.from(clean2).map(c => c.charCodeAt(0)));
