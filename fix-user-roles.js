const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dojodesk.db');
const db = new sqlite3.Database(dbPath);

console.log('Fixing user roles constraint...');

db.serialize(() => {
  // Step 1: Create a new temporary table with the correct schema
  console.log('Creating temporary users table...');
  db.run(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'staff', 'instructor')),
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      locationId INTEGER,
      allowedLocations TEXT,
      isInstructor BOOLEAN DEFAULT 0,
      certifications TEXT,
      specialties TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locationId) REFERENCES locations(id)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating new table:', err);
      return;
    }

    // Step 2: Copy data from old table to new table
    console.log('Copying data from old table...');
    db.run(`
      INSERT INTO users_new (id, username, email, password, role, firstName, lastName, locationId, isInstructor, certifications, specialties, createdAt, updatedAt)
      SELECT id, username, email, password, role, firstName, lastName, locationId, isInstructor, certifications, specialties, createdAt, updatedAt
      FROM users
    `, (err) => {
      if (err) {
        console.error('Error copying data:', err);
        return;
      }

      // Step 3: Drop the old table
      console.log('Dropping old users table...');
      db.run('DROP TABLE users', (err) => {
        if (err) {
          console.error('Error dropping old table:', err);
          return;
        }

        // Step 4: Rename the new table to users
        console.log('Renaming new table...');
        db.run('ALTER TABLE users_new RENAME TO users', (err) => {
          if (err) {
            console.error('Error renaming table:', err);
            return;
          }

          console.log('✅ User roles constraint fixed successfully!');
          db.close();
        });
      });
    });
  });
});
