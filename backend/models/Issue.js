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

// Create a geospatial index for location-based queries
issueSchema.index({ 'location.coordinates': '2dsphere' });

// Add pagination plugin
issueSchema.plugin(mongoosePaginate);

const Issue = mongoose.model('Issue', issueSchema);

module.exports = Issue;
