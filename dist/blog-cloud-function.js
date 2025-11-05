"use strict";
/**
 * Cloud Function entry point for automated blog generation
 * Triggered by Cloud Scheduler daily
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBlog = generateBlog;
require("dotenv/config");
const blog_generator_1 = require("./blog-generator");
/**
 * HTTP Cloud Function entry point
 */
async function generateBlog(req, res) {
    console.log('📨 Blog generation request received');
    console.log('   Method:', req.method);
    console.log('   Headers:', req.headers);
    // Verify request is from Cloud Scheduler
    const schedulerHeader = req.headers['x-cloudscheduler'];
    if (!schedulerHeader && process.env.NODE_ENV === 'production') {
        console.error('❌ Unauthorized request - not from Cloud Scheduler');
        res.status(403).send('Forbidden: Must be called from Cloud Scheduler');
        return;
    }
    try {
        // Run the blog generation
        await (0, blog_generator_1.runBlogGeneration)();
        res.status(200).json({
            success: true,
            message: 'Blog article and video generated successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Blog generation failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
// For local testing
if (require.main === module) {
    console.log('🧪 Running in local test mode');
    const mockReq = { method: 'POST', headers: {} };
    const mockRes = {
        status: (code) => ({
            json: (data) => console.log(`Response ${code}:`, data),
            send: (data) => console.log(`Response ${code}:`, data)
        })
    };
    generateBlog(mockReq, mockRes);
}
