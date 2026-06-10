const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "1983",
  ssl: process.env.DB_HOST === "localhost" ? false : {
    rejectUnauthorized: false
  }
};

const DB_NAME = process.env.DB_NAME || "descarte_certo_novo";
const JWT_SECRET = process.env.JWT_SECRET || "descarte_certo_secreto";
const PORT = Number(process.env.PORT || 3000);

let db;

const schemaSql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  role VARCHAR(50) DEFAULT 'Membro',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  material VARCHAR(100) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit VARCHAR(30) DEFAULT 'kg',
  price NUMERIC(10,2) NOT NULL,
  city VARCHAR(100) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  materials TEXT,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

async function ensureDatabase() {
  const adminPool = new Pool({ ...DB_CONFIG, database: "postgres" });

  try {
    const exists = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DB_NAME]
    );

    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(DB_NAME)}`);
      console.log(`Banco criado: ${DB_NAME}`);
    } else {
      console.log(`Banco encontrado: ${DB_NAME}`);
    }
  } finally {
    await adminPool.end();
  }
}

async function initDatabase() {
  await ensureDatabase();

  db = new Pool({ ...DB_CONFIG, database: DB_NAME });

  await db.query("SELECT 1");
  console.log("PostgreSQL conectado!");

  await db.query(schemaSql);

  // Migrações simples para bancos que já existiam com outro formato
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`);
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(30) DEFAULT 'kg';`);
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

  console.log("Tabelas verificadas/criadas com sucesso!");
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token não enviado" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

app.get("/", (req, res) => {
  res.send("API Descarte Certo funcionando!");
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT current_database() AS database, now() AS server_time"
    );

    res.json({
      ok: true,
      database: result.rows[0].database,
      server_time: result.rows[0].server_time,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        error: "Preencha nome, email, WhatsApp e senha",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Senha deve ter pelo menos 6 caracteres",
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, "");

    if (cleanPhone.length < 10) {
      return res.status(400).json({
        error: "Informe um WhatsApp válido com DDD",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO public.users (name, email, password, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, cleanPhone]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.log("ERRO REGISTER:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Este e-mail já está cadastrado" });
    }

    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Preencha email e senha" });
    }

    const result = await db.query(
      "SELECT * FROM public.users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("ERRO LOGIN:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, phone, role, created_at
       FROM public.users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.log("ERRO ME:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.user_id AS "userId",
        p.title AS name,
        p.title,
        p.description,
        p.material AS category,
        p.material AS "categoryLabel",
        p.quantity AS qty,
        p.quantity,
        COALESCE(p.unit, 'kg') AS unit,
        p.price,
        p.city,
        p.image_url AS image,
        p.image_url AS "imageUrl",
        p.created_at AS "createdAt",
        u.name AS seller,
        u.phone AS "sellerPhone"
      FROM public.products p
      LEFT JOIN public.users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.log("ERRO PRODUCTS:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products", authMiddleware, async (req, res) => {
  try {
    const {
      name,
      title,
      category,
      material,
      qty,
      quantity,
      unit,
      price,
      city,
      description,
      image,
      imageUrl,
    } = req.body;

    const productTitle = title || name;
    const productMaterial = material || category;
    const productQuantity = quantity || qty;
    const productUnit = unit || "kg";
    const productImage = imageUrl || image || "";

    if (!productTitle || !productMaterial || !productQuantity || !price || !city) {
      return res.status(400).json({
        error: "Preencha nome, material, quantidade, preço e cidade",
      });
    }

    const result = await db.query(
      `INSERT INTO public.products
       (user_id, title, description, material, quantity, unit, price, city, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING
        id,
        user_id AS "userId",
        title AS name,
        title,
        description,
        material AS category,
        material AS "categoryLabel",
        quantity AS qty,
        quantity,
        unit,
        price,
        city,
        image_url AS image,
        image_url AS "imageUrl",
        created_at AS "createdAt"`,
      [
        req.user.id,
        productTitle.trim(),
        description || "",
        productMaterial,
        productQuantity,
        productUnit,
        price,
        city.trim(),
        productImage,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.log("ERRO CREATE PRODUCT:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/collection-points", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        cp.id,
        cp.name,
        cp.address,
        cp.city,
        cp.materials,
        cp.phone,
        cp.created_at AS "createdAt",
        u.name AS "createdBy"
      FROM public.collection_points cp
      LEFT JOIN public.users u ON u.id = cp.user_id
      ORDER BY cp.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.log("ERRO COLLECTION POINTS:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/collection-points", authMiddleware, async (req, res) => {
  try {
    const { name, address, city, materials, phone } = req.body;

    if (!name || !address || !city || !materials) {
      return res.status(400).json({
        error: "Preencha nome, endereço, cidade e materiais aceitos",
      });
    }

    const cleanPhone = phone ? String(phone).replace(/\D/g, "") : null;

    const result = await db.query(
      `INSERT INTO public.collection_points
       (user_id, name, address, city, materials, phone)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, address, city, materials, phone, created_at AS "createdAt"`,
      [
        req.user.id,
        name.trim(),
        address.trim(),
        city.trim(),
        materials.trim(),
        cleanPhone,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.log("ERRO CREATE COLLECTION POINT:", err);
    res.status(500).json({ error: err.message });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erro ao iniciar servidor:", err.message);
    process.exit(1);
  });
