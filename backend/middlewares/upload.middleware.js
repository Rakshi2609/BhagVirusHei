const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create specific folders based on file type
        let folder = 'misc';

        if (file.mimetype.startsWith('image/')) {
            folder = 'images';
        } else if (file.mimetype.startsWith('audio/')) {
            folder = 'audio';
        } else if (file.mimetype.startsWith('application/')) {
            folder = 'documents';
        }

        // Create the folder if it doesn't exist
        const folderPath = path.join(uploadDir, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        cb(null, path.join(uploadDir, folder));
    },
    filename: function (req, file, cb) {
        // Create a unique filename: timestamp-originalname
        const uniqueFilename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
        cb(null, uniqueFilename);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    // Accept images, audio, and common document types
    if (
        file.mimetype.startsWith('image/') ||
        file.mimetype.startsWith('audio/') ||
        file.mimetype === 'application/pdf' ||
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        cb(null, true);
    } else {
        cb(new Error('Unsupported file type'), false);
    }
};

// Create multer upload instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Export middleware for different upload scenarios
module.exports = {
    // For issue reporting (multiple images and one optional voice note)
    issueUpload: upload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'voiceNote', maxCount: 1 }
    ]),

    // For profile pictures
    profilePicture: upload.single('profilePicture'),

    // For resolution proof (multiple images)
    resolutionImages: upload.array('resolutionImages', 5),

    // For government updates (multiple images and documents)
    updateAttachments: upload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'attachments', maxCount: 3 }
    ]),

    // Error handling middleware
    handleUploadErrors: (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
            }
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    }
};
