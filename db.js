const Database = require('better-sqlite3')

const db = new Database('database.db')

db.pragma('foreign_keys = ON');

db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP
            );`
        );

db.exec(`
        CREATE TABLE IF NOT EXISTS book(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            year INTEGER NOT NULL,
            genre TEXT NOT NULL,
            description TEXT,
            createdBy INTEGER NOT NULL,
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE CASCADE
        );`
    );


db.exec(`
        CREATE TABLE IF NOT EXISTS review(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bookId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            rating INTEGER,
            comment TEXT NOT NULL,
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );`
    );


module.exports = db