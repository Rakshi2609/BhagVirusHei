const Issue = require('../models/Issue');
const User = require('../models/User');
const { validationResult } = require('express-validator');

class IssueController {
    // Get all issues with comprehensive filtering and pagination
    async getAllIssues(req, res) {
        try {
            // Failsafe: ensure only government role (route already guards but double-check)
            if (!req.user || req.user.role !== 'government') {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            const {
                status,
                category,
                priority,
                assignedTo,
                reportedBy,
                location,
                page = 1,
                limit = 10,
                sortBy = 'createdAt',
                sortOrder = 'desc',
                search,
                dateFrom,
                dateTo
            } = req.query;

            // Build filter object
            const filter = {};

            if (status) filter.status = status;
            if (category) filter.category = category;
            if (priority) filter.priority = priority;
            if (assignedTo) filter['assignedTo.official'] = assignedTo;
            if (reportedBy) filter.reportedBy = reportedBy;

            // Date range filter
            if (dateFrom || dateTo) {
                filter.createdAt = {};
                if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
                if (dateTo) filter.createdAt.$lte = new Date(dateTo);
            }

            // Search functionality
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { 'location.address': { $regex: search, $options: 'i' } },
                    { category: { $regex: search, $options: 'i' } }
                ];
            }

            // Location-based search
            if (location) {
                const [lng, lat, radius] = location.split(',');
                if (lng && lat) {
                    filter['location.coordinates'] = {
                        $near: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [parseFloat(lng), parseFloat(lat)]
                            },
                            $maxDistance: parseInt(radius) || 5000 // default 5km
                        }
                    };
                }
            }

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
                populate: [
                    { path: 'reportedBy', select: 'name email phone role' },
                    { path: 'assignedTo.official', select: 'name email department' },
                    { path: 'resolutionDetails.resolvedBy', select: 'name email' },
                    { path: 'statusHistory.updatedBy', select: 'name email' }
                ]
            };

            const issues = await Issue.paginate(filter, options);

            res.json({
                success: true,
                data: issues.docs,
                pagination: {
                    totalCount: issues.totalDocs,
                    currentPage: issues.page,
                    totalPages: issues.totalPages,
                    limit: issues.limit
                }
            });
        } catch (error) {
            console.error('Error fetching issues:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch issues',
                message: error.message
            });
        }
    }

    // Government overview: aggregate counts + recent issues
    async getGovernmentOverview(req, res) {
        try {
            if (!req.user || req.user.role !== 'government') {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }

            // Aggregate counts by status
            const statusPipeline = [
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ];
            const statusResults = await Issue.aggregate(statusPipeline);
            const counts = statusResults.reduce((acc, cur) => {
                acc[cur._id] = cur.count;
                return acc;
            }, {});

            const total = Object.values(counts).reduce((a, b) => a + b, 0);

            // Recent issues (latest 10)
            const recentIssues = await Issue.find({})
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('reportedBy', 'name role')
                .lean();

            const normalized = recentIssues.map(doc => ({
                id: doc._id,
                title: doc.title,
                description: doc.description,
                category: doc.category,
                priority: doc.priority || 'low',
                reporter: doc.reportedBy ? { name: doc.reportedBy.name, id: doc.reportedBy._id } : null,
                location: doc.location ? { address: doc.location.address } : null,
                date: doc.createdAt,
                status: doc.status,
                votes: doc.votes || 0,
                updates: (doc.statusHistory || []).length
            }));

            res.json({
                success: true,
                data: {
                    counts: {
                        total: total,
                        submitted: counts['pending'] || 0,
                        resolved: counts['resolved'] || 0,
                        'in-progress': counts['in-progress'] || 0
                    },
                    recent: normalized
                }
            });
        } catch (error) {
            console.error('Error building government overview:', error);
            res.status(500).json({ success: false, error: 'Failed to build overview', message: error.message });
        }
    }

    // Full list of all issues (no pagination) for government
    async getAllIssuesFull(req, res) {
        try {
            if (!req.user || req.user.role !== 'government') {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            console.log('[getAllIssuesFull] user:', req.user.id, 'role:', req.user.role, 'time:', new Date().toISOString());
            const issues = await Issue.find({})
                .sort({ createdAt: -1 })
                .populate('reportedBy', 'name email role')
                .lean();

            console.log('[getAllIssuesFull] total issues found:', issues.length);

            const data = issues.map(doc => ({
                id: doc._id,
                title: doc.title,
                description: doc.description,
                category: doc.category,
                priority: doc.priority,
                status: doc.status,
                reporter: doc.reportedBy ? { id: doc.reportedBy._id, name: doc.reportedBy.name } : null,
                location: doc.location ? { address: doc.location.address } : null,
                date: doc.createdAt,
                votes: doc.votes || 0
            }));

            res.json({ success: true, data });
        } catch (error) {
            console.error('Error fetching full issue list:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch issues', message: error.message });
        }
    }

    // Create new issue
    async createIssue(req, res) {
        try {
            console.log('[CTRL createIssue] START ------------------------------------------------');
            console.log('[CTRL createIssue] Time:', new Date().toISOString());
            console.log('[CTRL createIssue] Content-Type:', req.headers['content-type']);
            console.log('[CTRL createIssue] Auth user object:', req.user ? { id: req.user.id, role: req.user.role, email: req.user.email } : 'NONE');
            console.log('[CTRL createIssue] Raw body keys:', Object.keys(req.body || {}));
            console.log('[CTRL createIssue] Incoming body snippet:', JSON.stringify({
                title: req.body?.title,
                category: req.body?.category,
                hasLocation: !!req.body?.location,
                locationLength: req.body?.location ? String(req.body.location).length : 0
            }));
            console.log('[CTRL createIssue] Files summary:', {
                images: Array.isArray(req.files?.images) ? req.files.images.map(f => ({ name: f.filename, size: f.size })) : [],
                voiceNote: Array.isArray(req.files?.voiceNote) ? req.files.voiceNote.map(f => ({ name: f.filename, size: f.size })) : []
            });
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('[CTRL createIssue] Validation errors:', errors.array());
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const {
                title,
                description,
                category,
                location,
                priority = 'low'
            } = req.body;

                // Handle file uploads OR already-uploaded Cloudinary URLs sent from frontend
                let images = [];
                if (req.files?.images) {
                    console.log('[CTRL createIssue] Detected', req.files.images.length, 'image file(s) for server-side Cloudinary upload');
                    const uploadPromises = req.files.images.map(async (file, idx) => {
                        const label = file.originalname || `buffer-${idx}`;
                        const start = Date.now();
                        try {
                            console.log(`[CTRL createIssue] [Upload->Cloudinary] START name=${label} size=${file.size}B type=${file.mimetype}`);
                            const result = await uploadBuffer(file.buffer, 'issues', label, file.mimetype);
                            const ms = Date.now() - start;
                            console.log(`[CTRL createIssue] [Upload->Cloudinary] SUCCESS name=${label} url=${result.secure_url} bytes=${file.size} timeMs=${ms}`);
                            return result.secure_url;
                        } catch (e) {
                            const ms = Date.now() - start;
                            console.error(`[CTRL createIssue] [Upload->Cloudinary] FAIL name=${label} timeMs=${ms} err=${e.message}`);
                            return null;
                        }
                    });
                    const uploaded = await Promise.all(uploadPromises);
                    images = uploaded.filter(Boolean);
                    const failed = req.files.images.length - images.length;
                    console.log('[CTRL createIssue] Cloudinary upload summary: success=', images.length, 'failed=', failed);
                    if (images.length === 0) {
                        console.warn('[CTRL createIssue] WARNING: All Cloudinary uploads failed. Check credentials and network.', {
                            hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
                            hasApiKey: !!process.env.CLOUDINARY_API_KEY,
                            hasApiSecret: !!process.env.CLOUDINARY_API_SECRET
                        });
                    }
                } else if (req.body.images || req.body.imageUrls) {
                    console.log('[CTRL createIssue] Using client-provided image URL path (no file buffers)');
                    // Accept either a JSON string or an array
                    const raw = req.body.images || req.body.imageUrls;
                    try {
                        if (typeof raw === 'string') {
                            images = JSON.parse(raw);
                        } else if (Array.isArray(raw)) {
                            images = raw;
                        }
                    } catch (e) {
                        console.log('[CTRL createIssue] Failed to parse incoming image URLs:', e.message);
                    }
                    if (!Array.isArray(images)) images = [];
                    // Basic URL validation
                    const beforeFilter = images.length;
                    images = images.filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
                    console.log('[CTRL createIssue] Accepted', images.length, 'URL(s); filtered out', beforeFilter - images.length);
                }
                // Voice note: (optional) still on disk approach not supported now; future: upload to cloudinary with resource_type: 'video' or 'raw'
                const voiceNote = null;

            // Parse & normalize location data (support multiple client formats)
            let locationData = null;
            try {
                if (location) {
                    if (typeof location === 'string') {
                        // Could be JSON string OR plain address string
                        if (location.trim().startsWith('{')) {
                            locationData = JSON.parse(location);
                        } else {
                            // treat as plain address (no coordinates)
                            locationData = { address: location.trim() };
                        }
                    } else if (typeof location === 'object') {
                        locationData = location;
                    }
                }
            } catch (e) {
                console.log('[CTRL createIssue] Location parse error. Raw value:', location, 'err:', e.message);
                return res.status(400).json({ success: false, message: 'Invalid location format' });
            }

            // Accept alternate lat/lng fields (lat,lng) or (latitude,longitude) arriving separately in body
            const rawLat = req.body.latitude || req.body.lat;
            const rawLng = req.body.longitude || req.body.lng || req.body.long;
            if (locationData && (!locationData.coordinates || !Array.isArray(locationData.coordinates))) {
                if (rawLat && rawLng) {
                    const latNum = parseFloat(rawLat);
                    const lngNum = parseFloat(rawLng);
                    if (!isNaN(latNum) && !isNaN(lngNum)) {
                        locationData.coordinates = [lngNum, latNum]; // GeoJSON expects [lng, lat]
                        console.log('[CTRL createIssue] Derived coordinates from separate fields');
                    }
                } else if (locationData.lat && locationData.lng) {
                    const latNum = parseFloat(locationData.lat);
                    const lngNum = parseFloat(locationData.lng);
                    if (!isNaN(latNum) && !isNaN(lngNum)) {
                        locationData.coordinates = [lngNum, latNum];
                        console.log('[CTRL createIssue] Derived coordinates from locationData.lat/lng');
                    }
                }
            }

            if (!locationData || !Array.isArray(locationData.coordinates) || locationData.coordinates.length !== 2) {
                console.log('[CTRL createIssue] Missing or invalid coordinates in locationData (will reject). Provided:', locationData);
                return res.status(400).json({ success: false, message: 'Location coordinates required (lng,lat)' });
            }
            if (!locationData.address) {
                console.log('[CTRL createIssue] Missing address field in locationData. Provided object:', locationData);
                // Not fatal yet, but supply placeholder address to satisfy schema
                locationData.address = 'Address not specified';
            }

            // Calculate estimated resolution time based on category and priority (standalone helper to avoid lost `this` context)
            const estimatedTime = calculateEstimatedResolutionTime(category, priority);

            const issue = new Issue({
                title,
                description,
                category,
                location: {
                    type: 'Point',
                    coordinates: locationData.coordinates,
                    address: locationData.address,
                    city: locationData.city,
                    state: locationData.state,
                    pincode: locationData.pincode
                },
                    images, // now array of Cloudinary URLs
                voiceNote,
                reportedBy: req.user.id,
                priority,
                estimatedResolutionTime: estimatedTime,
                statusHistory: [{
                    status: 'pending',
                    comment: 'Issue reported by citizen',
                    timestamp: new Date()
                }],
                notifications: [{
                    message: 'Your issue has been successfully reported and is under review',
                    type: 'status_change',
                    timestamp: new Date()
                }]
            });

            try {
                await issue.save();
                console.log('[CTRL createIssue] Issue saved with _id:', issue._id);
            } catch (saveErr) {
                console.log('[CTRL createIssue] Mongoose save error:', saveErr.message);
                if (saveErr.name === 'ValidationError') {
                    const fieldErrors = Object.keys(saveErr.errors).map(k => ({ field: k, message: saveErr.errors[k].message }));
                    console.log('[CTRL createIssue] Validation errors detailed:', fieldErrors);
                    return res.status(400).json({ success: false, message: 'Validation failed', errors: fieldErrors });
                }
                return res.status(500).json({ success: false, message: 'Database save failed', error: saveErr.message });
            }
            await issue.populate([
                { path: 'reportedBy', select: 'name email phone' }
            ]);

            // Emit real-time notification
            req.io?.emit('newIssue', {
                issue: issue,
                message: `New issue reported: ${title}`
            });

            const responsePayload = {
                success: true,
                message: 'Issue reported successfully',
                data: issue
            };
            console.log('[CTRL createIssue] SUCCESS response payload keys:', Object.keys(responsePayload.data.toObject ? responsePayload.data.toObject() : responsePayload.data));
            res.status(201).json(responsePayload);
        } catch (error) {
            console.error('[CTRL createIssue] UNCAUGHT ERROR:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to report issue',
                message: error.message
            });
        }
    }

    // Get single issue by ID
    async getIssueById(req, res) {
        try {
            const issue = await Issue.findById(req.params.id)
                .populate('reportedBy', 'name email phone role')
                .populate('assignedTo.official', 'name email department')
                .populate('resolutionDetails.resolvedBy', 'name email')
                .populate('statusHistory.updatedBy', 'name email role');

            if (!issue) {
                return res.status(404).json({
                    success: false,
                    error: 'Issue not found'
                });
            }

            // Mark notifications as read if viewed by the issue reporter
            if (req.user && req.user.id === issue.reportedBy._id.toString()) {
                issue.notifications.forEach(notification => {
                    notification.read = true;
                });
                await issue.save();
            }

            res.json({
                success: true,
                data: issue
            });
        } catch (error) {
            console.error('Error fetching issue:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch issue',
                message: error.message
            });
        }
    }

    // Assign issue to department/official
    async assignIssue(req, res) {
        try {
            const { id } = req.params;
            const { department, officialId, comment } = req.body;

            if (req.user.role !== 'government') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. Government officials only.'
                });
            }

            const issue = await Issue.findById(id);
            if (!issue) {
                return res.status(404).json({
                    success: false,
                    error: 'Issue not found'
                });
            }

            // Update assignment
            issue.assignedTo = {
                department,
                official: officialId || null
            };
            issue.status = 'assigned';

            // Add to status history
            issue.statusHistory.push({
                status: 'assigned',
                updatedBy: req.user.id,
                comment: comment || `Issue assigned to ${department} department${officialId ? ' and specific official' : ''}`,
                timestamp: new Date()
            });

            // Add notification
            issue.notifications.push({
                message: `Your issue has been assigned to the ${department} department`,
                type: 'assignment',
                timestamp: new Date()
            });

            await issue.save();
            await issue.populate([
                { path: 'reportedBy', select: 'name email phone' },
                { path: 'assignedTo.official', select: 'name email department' }
            ]);

            // Emit real-time notification
            req.io?.emit('issueAssigned', {
                issueId: issue._id,
                userId: issue.reportedBy._id,
                message: `Issue assigned to ${department} department`
            });

            res.json({
                success: true,
                message: 'Issue assigned successfully',
                data: issue
            });
        } catch (error) {
            console.error('Error assigning issue:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to assign issue',
                message: error.message
            });
        }
    }

    // Update issue status
    async updateIssueStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, comment, resolutionDetails } = req.body;

            if (req.user.role !== 'government') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. Government officials only.'
                });
            }

            const issue = await Issue.findById(id);
            if (!issue) {
                return res.status(404).json({
                    success: false,
                    error: 'Issue not found'
                });
            }

            const oldStatus = issue.status;
            issue.status = status;

            // Add to status history
            issue.statusHistory.push({
                status,
                updatedBy: req.user.id,
                comment: comment || `Status changed from ${oldStatus} to ${status}`,
                timestamp: new Date()
            });

            // Handle resolution
            if (status === 'resolved') {
                const createdAt = new Date(issue.createdAt);
                const resolvedAt = new Date();
                const resolutionTimeHours = Math.round((resolvedAt - createdAt) / (1000 * 60 * 60));

                issue.resolutionDetails = {
                    resolvedBy: req.user.id,
                    resolutionDate: resolvedAt,
                    resolutionDescription: resolutionDetails?.description || 'Issue has been resolved',
                    resolutionImages: resolutionDetails?.images || []
                };
                issue.actualResolutionTime = resolutionTimeHours;

                // Add resolution notification
                issue.notifications.push({
                    message: 'Your issue has been resolved! Thank you for reporting.',
                    type: 'resolution',
                    timestamp: new Date()
                });
            } else {
                // Add status change notification
                issue.notifications.push({
                    message: `Your issue status has been updated to: ${status}`,
                    type: 'status_change',
                    timestamp: new Date()
                });
            }

            await issue.save();
            await issue.populate([
                { path: 'reportedBy', select: 'name email phone' },
                { path: 'assignedTo.official', select: 'name email department' },
                { path: 'resolutionDetails.resolvedBy', select: 'name email' }
            ]);

            // Emit real-time notification
            req.io?.emit('issueStatusUpdated', {
                issueId: issue._id,
                userId: issue.reportedBy._id,
                status,
                message: `Issue status updated to: ${status}`
            });

            res.json({
                success: true,
                message: 'Issue status updated successfully',
                data: issue
            });
        } catch (error) {
            console.error('Error updating issue status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update issue status',
                message: error.message
            });
        }
    }

    // Get user's issues
    async getUserIssues(req, res) {
        try {
            const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

            const filter = { reportedBy: req.user.id };
            if (status) filter.status = status;

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
                populate: [
                    { path: 'assignedTo.official', select: 'name email department' },
                    { path: 'resolutionDetails.resolvedBy', select: 'name email' }
                ]
            };

            const issues = await Issue.paginate(filter, options);

            res.json({
                success: true,
                data: issues
            });
        } catch (error) {
            console.error('Error fetching user issues:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch your issues',
                message: error.message
            });
        }
    }

    // Vote on issue
    async voteOnIssue(req, res) {
        try {
            const issue = await Issue.findById(req.params.id);
            if (!issue) {
                return res.status(404).json({
                    success: false,
                    error: 'Issue not found'
                });
            }

            const userId = req.user.id;
            const hasVoted = issue.voters.includes(userId);

            if (hasVoted) {
                // Remove vote
                issue.voters = issue.voters.filter(id => id.toString() !== userId);
                issue.votes = Math.max(0, issue.votes - 1);
            } else {
                // Add vote
                issue.voters.push(userId);
                issue.votes += 1;
            }

            await issue.save();

            res.json({
                success: true,
                message: hasVoted ? 'Vote removed' : 'Vote added',
                data: {
                    votes: issue.votes,
                    hasVoted: !hasVoted
                }
            });
        } catch (error) {
            console.error('Error voting on issue:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to vote on issue',
                message: error.message
            });
        }
    }

    // Get issue statistics
    async getIssueStatistics(req, res) {
        try {
            const { timeRange = '30d', department, category } = req.query;

            // Calculate date range
            const now = new Date();
            let startDate;
            switch (timeRange) {
                case '7d':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '90d':
                    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case '1y':
                    startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            }

            const matchFilter = {
                createdAt: { $gte: startDate }
            };

            if (department) matchFilter['assignedTo.department'] = department;
            if (category) matchFilter.category = category;

            const [
                totalStats,
                statusStats,
                categoryStats,
                priorityStats,
                departmentStats,
                resolutionTimeStats
            ] = await Promise.all([
                // Total counts
                Issue.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            totalVotes: { $sum: '$votes' },
                            avgVotes: { $avg: '$votes' }
                        }
                    }
                ]),

                // Status breakdown
                Issue.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]),

                // Category breakdown
                Issue.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: '$category',
                            count: { $sum: 1 },
                            avgVotes: { $avg: '$votes' }
                        }
                    },
                    { $sort: { count: -1 } }
                ]),

                // Priority breakdown
                Issue.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: '$priority',
                            count: { $sum: 1 }
                        }
                    }
                ]),

                // Department breakdown
                Issue.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: '$assignedTo.department',
                            count: { $sum: 1 },
                            resolved: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0]
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            resolutionRate: {
                                $round: [
                                    { $multiply: [{ $divide: ['$resolved', '$count'] }, 100] },
                                    2
                                ]
                            }
                        }
                    }
                ]),

                // Resolution time stats
                Issue.aggregate([
                    {
                        $match: {
                            ...matchFilter,
                            status: 'resolved',
                            actualResolutionTime: { $exists: true }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avgResolutionTime: { $avg: '$actualResolutionTime' },
                            minResolutionTime: { $min: '$actualResolutionTime' },
                            maxResolutionTime: { $max: '$actualResolutionTime' }
                        }
                    }
                ])
            ]);

            res.json({
                success: true,
                data: {
                    total: totalStats[0] || { total: 0, totalVotes: 0, avgVotes: 0 },
                    byStatus: statusStats,
                    byCategory: categoryStats,
                    byPriority: priorityStats,
                    byDepartment: departmentStats,
                    resolutionTime: resolutionTimeStats[0] || { avgResolutionTime: 0, minResolutionTime: 0, maxResolutionTime: 0 }
                }
            });
        } catch (error) {
            console.error('Error fetching issue statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch statistics',
                message: error.message
            });
        }
    }

}

// Standalone helper (removed from class to avoid `this` binding issues when passing methods to Express)
function calculateEstimatedResolutionTime(category, priority) {
    const baseHours = {
        'Roads & Infrastructure': 72,
        'Waste Management': 24,
        'Electricity': 48,
        'Water Supply': 48,
        'Sewage & Drainage': 48,
        'Traffic & Transportation': 24,
        'Public Safety': 12,
        'Parks & Recreation': 72,
        'Street Lighting': 24,
        'Noise Pollution': 48,
        'Other': 48
    };

    const priorityMultiplier = {
        'urgent': 0.25,
        'high': 0.5,
        'medium': 1,
        'low': 1.5
    };

    const base = baseHours[category] || 48;
    const multiplier = priorityMultiplier[priority] || 1;

    return Math.round(base * multiplier);
}

module.exports = new IssueController();