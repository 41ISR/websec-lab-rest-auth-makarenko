const Database = require('better-sqlite3')

const db = new Database('database.db')

db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP
            )`
        ).run()

db.prepare(`
        CREATE TABLE IF NOT EXIST book(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            year INTEGER NOT NULL,
            genre TEXT NOT NULL,
            description TEXT,
            createdBy INTEGER NOT NULL,
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP,
            FOREGINKEY (createdBy) REFERENCES users(id) ON DELETE CASCADE
        )`
    ).run()


db.prepare(`
        CREATE TABLE IF NOT EXIST review(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bookId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            rating INTEGER,
            comment TEXT NOT NULL,
            createdAt DATATIME DEFAULT CURRENT_TIMESTAMP,
            FOREGINKEY (bookId) REFERENCES books(id) ON DELETE CASCADE,
            FOREGINKEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )`
    ).run()


module.exports = db