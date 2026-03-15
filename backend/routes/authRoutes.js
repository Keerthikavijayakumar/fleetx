const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    register,
    login,
    getProfile,
    adminCreateUser,
    adminListUsers,
    adminGetUser,
    adminUpdateUser,
    adminDeleteUser,
} = require('../controllers/authController');
const { auth, authorize } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validator');
const { authLimiter } = require('../middleware/rateLimiter');

// ── Multer for user profile photos ──────────────────────────────────────────
const photoDir = path.join(__dirname, '..', 'uploads', 'photos');
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const photoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, photoDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});

const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
});

router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.get('/profile', auth, getProfile);
router.get('/admin/users', auth, authorize('admin'), adminListUsers);
router.get('/admin/users/:id', auth, authorize('admin'), adminGetUser);
// Photo must be parsed by multer before express-validator reads req.body
router.post('/admin/users', auth, authorize('admin'), photoUpload.single('photo'), validateRegister, adminCreateUser);
router.put('/admin/users/:id', auth, authorize('admin'), photoUpload.single('photo'), adminUpdateUser);
router.delete('/admin/users/:id', auth, authorize('admin'), adminDeleteUser);

module.exports = router;
