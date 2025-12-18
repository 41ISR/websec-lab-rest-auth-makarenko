const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const express = require("express");

const SECRET = "this-is-for-jwt";

const app = express();

app.use(express.json());


const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Нет токена авторизации" });

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Неверный формат токена" });

    try {
        const token = parts[1];
        const decoded = jwt.verify(token, SECRET);
        // Fetch full user from DB without password
        const user = db.prepare("SELECT id, username, email, role, createdAt FROM users WHERE id = ?").get(decoded.id);
        if (!user) return res.status(401).json({ error: "Неправильный токен" });
        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ error: "Неправильный токен" });
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Доступ запрещен: недостаточно прав" });
    }
    next();
};


app.post("/api/auth/register", (req, res) => {
    const { username, email, password } = req.body;

    try {
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Не хватает данных" });
        }

        
        const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (existingUser) {
            return res.status(409).json({ error: "Email уже зарегистрирован" });
        }

        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        const insert = db.prepare(
            "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'user')"
        );
        const result = insert.run(username, email, hashedPassword);

        const newUser = db.prepare("SELECT id, username, email, role, createdAt FROM users WHERE id = ?").get(result.lastInsertRowid);
        res.status(201).json(newUser);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: "Не хватает данных" });
        }

        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) {
            return res.status(401).json({ error: "Неправильные данные" });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: "Неправильные данные" });
        }

        const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, SECRET, { expiresIn: "24h" });

        const { password: _, ...responseUser } = user;
        res.status(200).json({ token, ...responseUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.get("/api/auth/profile", authMiddleware, (req, res) => {
    res.status(200).json(req.user);
});


app.get("/api/books", (req, res) => {
    const { genre, author } = req.query;
    let query = "SELECT * FROM book";
    const params = [];

    if (genre || author) {
        query += " WHERE";
        if (genre) {
            query += " genre = ?";
            params.push(genre);
        }
        if (author) {
            if (genre) query += " AND";
            query += " author = ?";
            params.push(author);
        }
    }

    const books = db.prepare(query).all(...params);
    res.status(200).json(books);
});


app.get("/api/books/:id", (req, res) => {
    const { id } = req.params;

    const book = db.prepare("SELECT * FROM book WHERE id = ?").get(id);
    if (!book) {
        return res.status(404).json({ error: "Книга не найдена" });
    }

    const reviews = db.prepare("SELECT * FROM review WHERE bookId = ?").all(id);
    res.status(200).json({ ...book, reviews });
});


app.post("/api/books", authMiddleware, (req, res) => {
    const { title, author, year, genre, description } = req.body;

    try {
        if (!title || !author || !year || !genre) {
            return res.status(400).json({ error: "Не хватает данных" });
        }

        const insert = db.prepare(
            "INSERT INTO book (title, author, year, genre, description, createdBy) VALUES (?, ?, ?, ?, ?, ?)"
        );
        const result = insert.run(title, author, year, genre, description || "", req.user.id);

        const newBook = db.prepare("SELECT * FROM book WHERE id = ?").get(result.lastInsertRowid);
        res.status(201).json(newBook);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.put("/api/books/:id", authMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, author, year, genre, description } = req.body;

    try {
        const book = db.prepare("SELECT * FROM book WHERE id = ?").get(id);
        if (!book) {
            return res.status(404).json({ error: "Книга не найдена" });
        }

        if (book.createdBy !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        let updateQuery = "UPDATE book SET";
        const params = [];
        if (title) {
            updateQuery += " title = ?,";
            params.push(title);
        }
        if (author) {
            updateQuery += " author = ?,";
            params.push(author);
        }
        if (year) {
            updateQuery += " year = ?,";
            params.push(year);
        }
        if (genre) {
            updateQuery += " genre = ?,";
            params.push(genre);
        }
        if (description !== undefined) {
            updateQuery += " description = ?,";
            params.push(description);
        }

        if (params.length === 0) {
            return res.status(400).json({ error: "Нет данных для обновления" });
        }

        updateQuery = updateQuery.slice(0, -1) + " WHERE id = ?";
        params.push(id);

        db.prepare(updateQuery).run(...params);
        const updatedBook = db.prepare("SELECT * FROM book WHERE id = ?").get(id);
        res.status(200).json(updatedBook);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.delete("/api/books/:id", authMiddleware, (req, res) => {
    const { id } = req.params;

    try {
        const book = db.prepare("SELECT * FROM book WHERE id = ?").get(id);
        if (!book) {
            return res.status(404).json({ error: "Книга не найдена" });
        }

        if (book.createdBy !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        db.prepare("DELETE FROM book WHERE id = ?").run(id);
        res.status(200).json({ message: "Книга удалена" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.post("/api/books/:id/reviews", authMiddleware, (req, res) => {
    const { id: bookId } = req.params;
    const { rating, comment } = req.body;

    try {
        if (!rating || !comment || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Неверные данные: rating должен быть от 1 до 5, comment обязателен" });
        }

        const book = db.prepare("SELECT * FROM book WHERE id = ?").get(bookId);
        if (!book) {
            return res.status(404).json({ error: "Книга не найдена" });
        }

        const insert = db.prepare(
            "INSERT INTO review (bookId, userId, rating, comment) VALUES (?, ?, ?, ?)"
        );
        const result = insert.run(bookId, req.user.id, rating, comment);

        const newReview = db.prepare("SELECT * FROM review WHERE id = ?").get(result.lastInsertRowid);
        res.status(201).json(newReview);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});


app.get("/api/books/:id/reviews", (req, res) => {
    const { id } = req.params;

    const book = db.prepare("SELECT * FROM book WHERE id = ?").get(id);
    if (!book) {
        return res.status(404).json({ error: "Книга не найдена" });
    }

    const reviews = db.prepare("SELECT * FROM review WHERE bookId = ?").all(id);
    res.status(200).json(reviews);
});


app.delete("/api/reviews/:id", authMiddleware, (req, res) => {
    const { id } = req.params;

    try {
        const review = db.prepare("SELECT * FROM review WHERE id = ?").get(id);
        if (!review) {
            return res.status(404).json({ error: "Отзыв не найден" });
        }

        if (review.userId !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        db.prepare("DELETE FROM review WHERE id = ?").run(id);
        res.status(200).json({ message: "Отзыв удален" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});



app.get("/api/admin/users", authMiddleware, adminMiddleware, (req, res) => {
    const users = db.prepare("SELECT id, username, email, role, createdAt FROM users").all();
    res.status(200).json(users);
});


app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;

    try {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
        if (!user) {
            return res.status(404).json({ error: "Пользователь не найден" });
        }

        if (user.id === req.user.id) {
            return res.status(400).json({ error: "Нельзя удалить самого себя" });
        }

        db.prepare("DELETE FROM users WHERE id = ?").run(id);
        res.status(200).json({ message: "Пользователь удален" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.listen(3000, () => {
    console.log("Сервер запущен на порту 3000");
});