const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: [
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
        ]
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        },
        address: {
            type: String,
            required: true
        },
        city: String,
        state: String,
        pincode: String
    },
    images: [{
        type: String,
        required: true
    }],
    voiceNote: {
        type: String
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedTo: {
        department: String,
        official: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    status: {
        type: String,
        enum: ['pending', 'acknowledged', 'assigned', 'in-progress', 'resolved', 'rejected', 'closed'],
        default: 'pending'
    },
    votes: {
        type: Number,
        default: 0
    },
    voters: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'low'
    },
    // Tracks why an automatic priority was assigned (e.g., votes, clustering)
    priorityReasons: [{
        type: String
    }],
    // If true, system may automatically recompute priority. If an admin manually
    // overrides priority you can set this to false to lock it.
    priorityAuto: {
        type: Boolean,
        default: true
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['pending', 'acknowledged', 'assigned', 'in-progress', 'resolved', 'rejected', 'closed']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        comment: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    notifications: [{
        message: String,
        type: {
            type: String,
            enum: ['status_change', 'assignment', 'comment', 'resolution']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        read: {
            type: Boolean,
            default: false
        }
    }],
    estimatedResolutionTime: {
        type: Number, // in hours
        default: 72
    },
    actualResolutionTime: Number, // in hours
    resolutionDetails: {
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolutionDate: Date,
        resolutionImages: [String],
        resolutionDescription: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Duplicate clustering support
// mergedInto: if set, this issue is a duplicate and should not appear independently in government listings
issueSchema.add({
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', index: true },
    duplicates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Issue' }], // only populated on canonical root
    reporters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // aggregated distinct reporters for canonical issue
});

// Ensure reporters includes original reporter on save (only for new docs)
issueSchema.pre('save', function(next) {
    if (this.isNew) {
        if (!Array.isArray(this.reporters)) this.reporters = [];
        if (this.reportedBy && !this.reporters.some(r => r.toString() === this.reportedBy.toString())) {
            this.reporters.push(this.reportedBy);
        }
    }
    next();
});

// Geospatial indexes (primary 2dsphere on full location subdocument + coordinates fallback)
issueSchema.index({ location: '2dsphere' });
issueSchema.index({ 'location.coordinates': '2dsphere' });

// Add pagination plugin
issueSchema.plugin(mongoosePaginate);

const Issue = mongoose.model('Issue', issueSchema);

module.exports = Issue;
