const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dojodesk.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting database migration...');

const migrations = [
  // Add new columns to users table
  `ALTER TABLE users ADD COLUMN locationId INTEGER`,
  `ALTER TABLE users ADD COLUMN isInstructor BOOLEAN DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN certifications TEXT`,
  `ALTER TABLE users ADD COLUMN specialties TEXT`,

  // Add instructorId to events table
  `ALTER TABLE events ADD COLUMN instructorId INTEGER`,

  // Create work_schedules table
  `CREATE TABLE IF NOT EXISTS work_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instructorId INTEGER NOT NULL,
    locationId INTEGER,
    dayOfWeek TEXT NOT NULL CHECK(dayOfWeek IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    startTime TIME NOT NULL,
    endTime TIME NOT NULL,
    isRecurring BOOLEAN DEFAULT 1,
    specificDate DATE,
    status TEXT NOT NULL CHECK(status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructorId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (locationId) REFERENCES locations(id)
  )`,

  // Create mystudio_sync_log table
  `CREATE TABLE IF NOT EXISTS mystudio_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    syncDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
    recordsImported INTEGER DEFAULT 0,
    recordsFailed INTEGER DEFAULT 0,
    errorLog TEXT,
    performedBy INTEGER,
    FOREIGN KEY (performedBy) REFERENCES users(id)
  )`
];

function runMigration(index) {
  if (index >= migrations.length) {
    console.log('✅ All migrations completed successfully!');
    db.close();
    return;
  }

  const sql = migrations[index];
  const tableName = sql.includes('work_schedules') ? 'work_schedules' :
                    sql.includes('mystudio_sync_log') ? 'mystudio_sync_log' :
                    sql.includes('events') ? 'events' : 'users';

  db.run(sql, (err) => {
    if (err) {
      // Ignore "duplicate column" errors - means column already exists
      if (err.message.includes('duplicate column')) {
        console.log(`⚠️  Column already exists, skipping: ${sql.substring(0, 50)}...`);
        runMigration(index + 1);
      } else {
        console.error(`❌ Error in migration ${index + 1}:`, err.message);
        console.error(`   SQL: ${sql}`);
        db.close();
      }
    } else {
      console.log(`✅ Migration ${index + 1}/${migrations.length} completed: ${tableName}`);
      runMigration(index + 1);
    }
  });
}

// Start migrations
runMigration(0);
