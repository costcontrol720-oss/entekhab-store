require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const DATA_FILE = path.join(__dirname, 'data', 'products.json');
const COOKIE_NAME = 'entekhab_admin_token';

if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
  console.error('خطا: JWT_SECRET و ADMIN_PASSWORD_HASH باید در فایل .env تنظیم شوند.');
  console.error('راهنما را در README.md ببینید.');
  process.exit(1);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- داده اولیه محصولات ----------
const defaultProducts = [
  { id: 1, name: 'پوستر مینیمال «خط افق»', cat: 'دیوارکوب', price: 450000, desc: 'چاپ باکیفیت روی مقوای مات', bg: 'linear-gradient(180deg,#DDD3B8 55%,#2F4B3C 55%)', imageUrl: '' },
  { id: 2, name: 'گلدان سرامیکی هندسی', cat: 'دکوری', price: 780000, desc: 'دست‌ساز، مناسب گیاهان کوچک', bg: 'conic-gradient(from 200deg, #C9A46A, #AE4A2E, #E7DFCB, #C9A46A)', imageUrl: '' },
  { id: 3, name: 'دفترچه یادداشت جلد چرم', cat: 'نوشت‌افزار', price: 320000, desc: '۱۲۰ برگ، صحافی دستی', bg: 'linear-gradient(135deg,#6B4A34,#3E2A20)', imageUrl: '' },
  { id: 4, name: 'رومیزی چوبی طرح موج', cat: 'اکسسوری', price: 1250000, desc: 'چوب گردو، سایز ۴۰×۶۰', bg: 'repeating-linear-gradient(115deg,#C9A46A 0 10px,#B5895A 10px 20px)', imageUrl: '' }
];

function readProducts() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultProducts, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error('خطا در خواندن محصولات:', e);
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
}

// ---------- احراز هویت مدیر ----------
function requireAdmin(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'ورود لازم است.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'نشست شما منقضی شده، دوباره وارد شوید.' });
  }
}

// محدودسازی تعداد تلاش ورود ناموفق (ساده، در حافظه)
const loginAttempts = new Map(); // ip -> {count, resetAt}
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 دقیقه

function isRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}
function recordFailedAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + WINDOW_MS };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}
function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

app.post('/api/admin/login', async (req, res) => {
  const ip = req.ip;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'تلاش‌های ناموفق زیاد بود. چند دقیقه بعد دوباره امتحان کنید.' });
  }
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'رمز عبور الزامی است.' });

  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'رمز عبور اشتباه است.' });
  }

  clearAttempts(ip);
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/admin/status', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ loggedIn: false });
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ loggedIn: true });
  } catch (e) {
    res.json({ loggedIn: false });
  }
});

// ---------- API محصولات ----------
app.get('/api/products', (req, res) => {
  res.json(readProducts());
});

app.post('/api/products', requireAdmin, (req, res) => {
  const { name, cat, price, desc, imageUrl, bg } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'نام و قیمت الزامی است.' });

  const products = readProducts();
  const newProduct = {
    id: Date.now(),
    name, cat: cat || '', price: Number(price),
    desc: desc || '', imageUrl: imageUrl || '', bg: bg || ''
  };
  products.push(newProduct);
  writeProducts(products);
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const products = readProducts();
  const product = products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد.' });

  const { name, cat, price, desc, imageUrl, bg } = req.body;
  if (name !== undefined) product.name = name;
  if (cat !== undefined) product.cat = cat;
  if (price !== undefined) product.price = Number(price);
  if (desc !== undefined) product.desc = desc;
  if (imageUrl !== undefined) product.imageUrl = imageUrl;
  if (bg !== undefined) product.bg = bg;

  writeProducts(products);
  res.json(product);
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let products = readProducts();
  const exists = products.some(p => p.id === id);
  if (!exists) return res.status(404).json({ error: 'محصول پیدا نشد.' });

  products = products.filter(p => p.id !== id);
  writeProducts(products);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`فروشگاه انتخاب من روی پورت ${PORT} اجراست.`);
});
