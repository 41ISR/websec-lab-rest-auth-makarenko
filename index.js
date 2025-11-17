const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const db = require("./db")
const express = require("express")

const SECRET = "secret-key"

const app = express()
app.use(express.json())

const authMiddleware = (req, res, next) => {
    const authheader =req.headers.authorization
    if (!authheader) res.status(401).json({error:"Нет токена авторизации"})
    if (!(authheader.split(" ")[1]))res.status(401).json({error: "Неверный формат токена"})


    try {
        const token = authheader.split(" ")[1]
        const decoded = jwt.verify(token, SECRET)
        
        const user = db.prepare(`SELECT id, email, name, role FROM users WHERE id = ?`).get(decoded.id)
        if (!user) return res.status(401).json({error: "Пользователь не найден"})
        
        req.user = user
        next()
    } catch(error) {
        console.error(error)
        res.status(401).json({error: "Неправильный токен"})
    }
}

app.post("/api/auth/register", (req, res) => {
    const {email, name, password} =req.body

    try{
        if (!email || !name || !password) {
            return res.status(400).json({ error: "Не хватает данных"})
        }

        const existingUser = db.prepare(`SELEcT id FROM users WHERE email = ?`).get(email)
        if (existingUser){
            return res.status(400).json({error: "Пользователь с таким email уже существует"})
        }
        const syncSalt = bcrypt.genSaltSync(10)
        const hashed = bcrypt.hashSync(password, syncSalt)

        const query = db.prepare(`INSERT INTO users (email, name, password, role) VALUES (?, ?, ?, 'user')`)
        
        const info = query.run(email, name, hashed)
        
        const newUser = db.prepare(`SELECT id, email, name, role, createdAt FROM users WHERE id = ?`).get(info.lastInsertRowid)
        res.status(201).json(newUser)
    } catch (error) {
        console.error(error)
        res.status(500).json({error: "Ошибка сервера"})
    }
})

app.post("/api/auth/login", (req,res) => {
    try{
        const {email, password} = req.body

        const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email)
        if (!user) return res.status(401).json({error: "Неправильные данные"})

        const valid = bcrypt.compareSync(password, user.password)
        if (!valid) return res.status(401).json({error: "Неправильные данные"})

        const token = jwt.sign({id: user.id, email: user.email}, SECRET, {expiresIn: `24h`})

        const {password: p, ...response} = user
        res.status(200).json({token: token, ...response})
    } catch(error){
        console.error(error)
        res.status(500).json({error: "Ошибка сервера"})
    }
})

app.get("/api/auth/profile", authMiddleware, (req, res) => {
    res,json(res.user)
})

app.get("api/books", (_, res)=> {
    const data = db.prepare(`SELECT b.*, u.name as createdByName FROM books b LEFT JOIN user u ON b.createdBy = u.id`).all()
    res.json(data)
})

app.get("/api/books/:id", (req,res) => {
    const {id} = req.params

    const book = db.prepare(`SELECT b.*, u.name as createdByName FROM books b LEFT JOIN user u ON b.createdBy = u.id WHERE b.id = ?`).get(id)

    if (!book) return res.status(404).json({error: "Книга не найдена"})

    const reviews =db.prepare(`SELECT r.*, u.name as authorName FROM reviews r LEFT JOIN users u ON r.userId = u.id WHERE r.bookId = ?`).all(id)

    res.json({...book, reviews})
})

app.get("/api/books/:id/reviews", (req, res) => {
    const {id} =req.params
    const data = db.prepare(`SELECT r.*, u.name as authorName FROM reviews r LEFT JOIN users u ON r.userId = u.id WHERE r.bookId = ?`).all(id)
    res.json(data)
})

app.post("/api/books/:id/reviews", authMiddleware, (res,req)=>{
    const {id} = req.params
    const {rating, comment} = req.body 
    const userId = req.user.id

    try{
        if (!rating || !comment){
            return res.status(400).json({error:"Не хватает данных"})
        }
        const book = db.prepare(`SELECT id FROM books WHERE id = ?`).get(id)
        if (!book) return res.status(404).json({error: "Книга не найдена"})
        
        const existingReview = db.prepare(`SELECT id FROM reviews WHERE bookId = ? AND userId = ?`).get(id, userId)
        if (existingReview){
            return res.status(400).json({error: "Вы уже оставляли отзыв на эту книгу"})
        }

        if (raring < 1 || rating > 5){
            return res.status(400).json({error:"Рейтинг должен быть от 0 до 5"})
        }

        const query = db.prepare(`INSERT INTO reviews (bookId, userId, rating, comment) VALUES (?,?,?,?)`)
        const info = query.run(id, userId, rating, comment)
        const newReview = db.prepare(`SELECT r.*, u.name as authorName FROM reviews r LEFT JOIN users u ON r.userId = u.id WHERE r.id = ?`).get(info.lastInsertRowid)
        res.status(201).json(newReview)
    } catch (error){
        console.error(error)
    }
})

app.delete("/api/reviews/:id", authMiddleware, (req,res) => {
    const {id} = req.params

    try{
        const review =db.prepare(`SELECT * FROM reviews WHERE id = ?`).get(id)
        if (!review) return res.status(404).json({error: "Отзыв не найден"})

        if (review.userId !== req.user.id && req.user.role !== "admin"){
            return res.status(403).json({error: "Недостаточно прав"})
        }

        const query = db.prepare(`DELETE FROM reviews WHERE id = ?`)
        const result = query.run(id)

        if (result.changes === 0 ) return res.status(404).json({error: "Отзыв не найден"})

        res.status(200).json({message:"Отзыв успешно удален"})
    } catch (error) {
        console.error(error)
        res.status(500).json({error:"Ошибка сервера"})
    }

})

app.get("/api/admin/users", authMiddleware, (req, res) => {
    try {
        if (req.user.role !== 'admin'){
            return res.status(403).json({error: "Недостаточно прав"})
        }

        const data = db.prepare("SELECT id, name, email, role, createdAt FROM users").all()
        res.json(data)
    } catch (error){
        console.error(error)
    }
})

app.delete("/api/admin/users/:id", authMiddleware, (res, req) => {
    const { id } = req.params
    
    try{
        if (req.user.role !== 'admin'){
            return res.status(403).json({error: "Недостаточно прав"})
        }

        if (parseInt(id) === req.user.id){
            return res.status(400).json({error: "Нельзя удалить самого себя"})
        }

        const query = db.prepare(`DELETE FROM users WHERE id = ?`)
        const result = query.run(id)

        if (result.changes === 0) return res.status(404).json({error: "Пользователь не найден"})

        res.status(200).json({message:"Пользователь успешно удален"})
    } catch (error){
        console.error(error)
    }
})

app.listen("3000", () => {
    console.log("Сервер запущен на порту 3000")
})