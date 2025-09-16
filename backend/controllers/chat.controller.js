const Issue = require('../models/Issue');
const IssueChatMessage = require('../models/IssueChatMessage');

class ChatController {
  // GET /api/issues/:id/chat?page=&limit=
  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      let issue = await Issue.findById(id).select('_id mergedInto');
      if (!issue) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }
      if (issue.mergedInto) {
        issue = await Issue.findById(issue.mergedInto).select('_id');
      }
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const messages = await IssueChatMessage.find({ issue: issue._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'name role');
      const total = await IssueChatMessage.countDocuments({ issue: issue._id });

      res.json({
        success: true,
        data: messages.reverse(), // return oldest -> newest after reversing
        pagination: {
          total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (e) {
      console.error('[chat.getMessages] error', e);
      res.status(500).json({ success: false, error: 'Failed to fetch messages', message: e.message });
    }
  }

  // POST /api/issues/:id/chat
  async postMessage(req, res) {
    try {
      const { id } = req.params;
      const { message } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message required' });
      }
        let issue = await Issue.findById(id).select('_id reportedBy mergedInto');
      if (!issue) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }
        if (issue.mergedInto) {
          issue = await Issue.findById(issue.mergedInto).select('_id reportedBy');
        }

      // Basic permission: reporter, any voter, or government user can chat
      const userId = req.user.id;
      const isGov = req.user.role === 'government';
      const isReporter = issue.reportedBy.toString() === userId;
      // Could expand: allow any authenticated user for now
      if (!isGov && !isReporter) {
        // Optional: restrict to voters only
        // For simplicity currently allow all authenticated users
      }

        const chatMessage = await IssueChatMessage.create({
          issue: issue._id,
        author: userId,
        message: message.trim()
      });
      await chatMessage.populate('author', 'name role');

      // Emit real-time event
      req.io?.emit('issueChatMessage', {
        issueId: id,
        message: chatMessage
      });

      res.status(201).json({ success: true, data: chatMessage });
    } catch (e) {
      console.error('[chat.postMessage] error', e);
      res.status(500).json({ success: false, error: 'Failed to post message', message: e.message });
    }
  }
}

module.exports = new ChatController();
