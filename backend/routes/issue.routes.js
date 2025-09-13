const express = require('express');
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const issueController = require('../controllers/issue.controller');
const { authenticate, authorizeGovernment } = require('../middlewares/auth.middleware');

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = file.fieldname === 'images' ? 'uploads/images' : 'uploads/audio';
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'images' && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else if (file.fieldname === 'voiceNote' && file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type for ${file.fieldname}`), false);
        }
    }
});

// Validation middleware
const validateIssue = [
    body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
    body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters'),
    body('category').isIn([
        'Roads & Infrastructure',
        'Waste Management',
        'Electricity',
        'Water Supply',
        'Sewage & Drainage',
        'Traffic & Transportation',
        'Public Safety',
        'Parks & Recreation',
        'Street Lighting',
        'Noise Pollution',
        'Other'
    ]).withMessage('Invalid category'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority')
];

// Get all issues with comprehensive filtering
router.get('/', issueController.getAllIssues);

// Get issue statistics
router.get('/statistics', authenticate, issueController.getIssueStatistics);

// Get current user's issues
router.get('/user/me', authenticate, issueController.getUserIssues);

// Get single issue by ID
router.get('/:id', issueController.getIssueById);

// Create new issue
router.post('/',
    authenticate,
    // Enhanced logging middleware for diagnostics
    (req, res, next) => {
        try {
            console.log('============================================================');
            console.log('[ROUTE] POST /api/issues HIT');
            console.log('[ROUTE] Time:', new Date().toISOString());
            console.log('[ROUTE] Content-Type:', req.headers['content-type']);
            console.log('[ROUTE] Authorization present:', !!req.headers['authorization']);
            console.log('[ROUTE] User (from auth middleware):', req.user ? { id: req.user.id, role: req.user.role } : 'NONE');
        } catch (e) {
            console.log('[ROUTE] Preliminary log error:', e.message);
        }
        next();
    },
    upload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'voiceNote', maxCount: 1 }
    ]),
    (req, res, next) => {
        // Log multipart parsing results
        try {
            console.log('[ROUTE] Multer parsed fields keys:', Object.keys(req.body || {}));
            console.log('[ROUTE] Multer files summary:', {
                images: req.files?.images ? req.files.images.map(f => ({ fn: f.filename, size: f.size })) : [],
                voiceNote: req.files?.voiceNote ? req.files.voiceNote.map(f => ({ fn: f.filename, size: f.size })) : []
            });
        } catch (e) {
            console.log('[ROUTE] Multer logging error:', e.message);
        }
        next();
    },
    validateIssue,
    issueController.createIssue
);

// Assign issue to department/official (government only)
router.put('/:id/assign', authenticate, authorizeGovernment, [
    body('department').notEmpty().withMessage('Department is required'),
    body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
], issueController.assignIssue);

// Update issue status (government only)
router.put('/:id/status', authenticate, authorizeGovernment, [
    body('status').isIn(['pending', 'acknowledged', 'assigned', 'in-progress', 'resolved', 'rejected', 'closed']).withMessage('Invalid status'),
    body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
], issueController.updateIssueStatus);

// Vote on issue
router.post('/:id/vote', authenticate, issueController.voteOnIssue);

module.exports = router;
