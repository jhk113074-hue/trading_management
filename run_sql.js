const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');

async function run() {
  const sqlPath = path.join(__dirname, 'db_scripts', '07_po_issued_documents.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log("Migration 07_po_issued_documents.sql executed successfully!");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    pool.end();
  }
}

run();
