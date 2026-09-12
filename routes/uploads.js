/* ============================================================
   routes/uploads.js  — File Upload API (Multer)
   ============================================================
   POST /api/uploads/product-image      Upload product image(s)
   POST /api/uploads/avatar             Upload user avatar
   DELETE /api/uploads/:filename        Delete an uploaded file
   ============================================================
   Storage: local /uploads/ directory (swap for Cloudinary in prod)
   Max file size: 5MB
   Allowed types: JPEG, PNG, WebP, GIF
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOADS_DIR  = path.join(__dirname, '..', 'uploads');
const MAX_SIZE_MB  = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/* ── Ensure uploads directory exists ─────────────────────── */
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* ── Multer storage config ───────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext    = path.extname(file.originalname).toLowerCase();
    const prefix = req.uploadPrefix || 'file';
    const name   = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits:     { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter
});

/* ── Multer error handler ────────────────────────────────── */
function handleUploadError(err, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: `File too large. Maximum size is ${MAX_SIZE_MB}MB` });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  return res.status(400).json({ success: false, error: err.message });
}

module.exports = function (authenticate, readDB, writeDB) {

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/uploads/product-image
     Multipart form: field name = "images" (up to 5 files)
     Also optionally updates the product record in DB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/product-image', authenticate, (req, res) => {
    req.uploadPrefix = 'product';

    upload.array('images', 5)(req, res, (err) => {
      if (err) return handleUploadError(err, res);
      if (!req.files || !req.files.length) {
        return res.status(400).json({ success: false, error: 'No files uploaded. Use field name "images"' });
      }

      const BASE = process.env.BASE_URL || 'http://localhost:3000';
      const urls = req.files.map(f => ({
        filename: f.filename,
        url:      `${BASE}/uploads/${f.filename}`,
        size:     f.size,
        mimetype: f.mimetype
      }));

      // Optionally link images to a product
      const { productId } = req.body;
      if (productId) {
        const db   = readDB();
        const pidx = db.products.findIndex(p => p.id === parseInt(productId));
        if (pidx !== -1) {
          const newUrls = urls.map(u => u.url);
          db.products[pidx].images = [...(db.products[pidx].images || []), ...newUrls];
          if (!db.products[pidx].image) db.products[pidx].image = newUrls[0];
          writeDB(db);
        }
      }

      res.status(201).json({ success: true, files: urls, total: urls.length });
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/uploads/avatar
     Multipart form: field name = "avatar" (1 file)
     Updates the user's avatar URL in the DB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/avatar', authenticate, (req, res) => {
    req.uploadPrefix = 'avatar';

    upload.single('avatar')(req, res, (err) => {
      if (err) return handleUploadError(err, res);
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "avatar"' });
      }

      const BASE      = process.env.BASE_URL || 'http://localhost:3000';
      const avatarUrl = `${BASE}/uploads/${req.file.filename}`;

      // Update user record
      const db   = readDB();
      const idx  = db.users.findIndex(u => u.id === req.userId);
      if (idx !== -1) {
        // Delete old avatar file if it was a local upload
        if (db.users[idx].avatarUrl && db.users[idx].avatarUrl.includes('/uploads/')) {
          const oldFile = path.join(UPLOADS_DIR, path.basename(db.users[idx].avatarUrl));
          if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
        }
        db.users[idx].avatarUrl = avatarUrl;
        writeDB(db);
      }

      res.status(201).json({
        success: true,
        file: {
          filename: req.file.filename,
          url:      avatarUrl,
          size:     req.file.size
        }
      });
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/uploads/review-image
     Attach images to a product review (up to 3 files)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/review-image', authenticate, (req, res) => {
    req.uploadPrefix = 'review';

    upload.array('images', 3)(req, res, (err) => {
      if (err) return handleUploadError(err, res);
      if (!req.files || !req.files.length) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const BASE = process.env.BASE_URL || 'http://localhost:3000';
      const urls = req.files.map(f => `${BASE}/uploads/${f.filename}`);
      res.status(201).json({ success: true, urls, total: urls.length });
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DELETE /api/uploads/:filename  (Auth required)
     Deletes a previously uploaded file
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.delete('/:filename', authenticate, (req, res) => {
    // Prevent path traversal
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: `File ${filename} deleted` });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/uploads  (Admin: list all uploaded files)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', authenticate, (req, res) => {
    const BASE  = process.env.BASE_URL || 'http://localhost:3000';
    const files = fs.readdirSync(UPLOADS_DIR).map(filename => {
      const stat = fs.statSync(path.join(UPLOADS_DIR, filename));
      return { filename, url: `${BASE}/uploads/${filename}`, size: stat.size, createdAt: stat.birthtime };
    });
    res.json({ success: true, data: files, total: files.length });
  });

  return router;
};
