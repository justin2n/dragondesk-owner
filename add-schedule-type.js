const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dojodesk.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding scheduleType column to work_schedules...');

db.run(`
  ALTER TABLE work_schedules
  ADD COLUMN scheduleType TEXT DEFAULT 'instructor'
  CHECK(scheduleType IN ('instructor', 'front_desk'))
`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column')) {
      console.log('⚠️  Column already exists, skipping...');
    } else {
      console.error('❌ Error adding column:', err);
    }
  } else {
    console.log('✅ Successfully added scheduleType column');
  }
  db.close();
});
