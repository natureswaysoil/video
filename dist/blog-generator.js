"use strict";
/**
 * Automated Blog Article & Video Generator
 * Generates gardening/soil-related blog content and creates matching videos
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBlogArticle = generateBlogArticle;
exports.generateBlogVideo = generateBlogVideo;
exports.saveBlogPost = saveBlogPost;
exports.postBlogVideoToSocial = postBlogVideoToSocial;
exports.runBlogGeneration = runBlogGeneration;
require("dotenv/config");
const heygen_1 = require("./heygen");
const youtube_1 = require("./youtube");
const instagram_1 = require("./instagram");
const twitter_1 = require("./twitter");
const pinterest_1 = require("./pinterest");
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
const BLOG_TOPICS = [
    'soil health',
    'organic gardening',
    'composting tips',
    'plant nutrition',
    'sustainable farming',
    'garden fertilizers',
    'soil amendments',
    'worm castings benefits',
    'biochar uses',
    'hydroponic gardening',
    'lawn care',
    'vegetable gardening',
    'indoor plants',
    'orchid care',
    'tomato growing tips'
];
/**
 * Generate a comprehensive blog article with OpenAI
 */
async function generateBlogArticle() {
    const topic = BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)];
    console.log(`\n🎯 Generating blog article about: ${topic}`);
    const prompt = `You are an expert in organic gardening and soil science. Write a comprehensive, SEO-optimized blog article for Nature's Way Soil website.

Topic: ${topic}

Requirements:
1. Title: Catchy, SEO-friendly (60-70 characters)
2. Excerpt: Engaging summary (150-160 characters)
3. Content: 800-1200 words, well-structured with headings
4. Include actionable tips and science-backed information
5. Naturally mention Nature's Way Soil products where relevant
6. Professional yet accessible tone
7. Include a call-to-action at the end

Format your response as JSON:
{
  "title": "...",
  "excerpt": "...",
  "content": "...",
  "category": "...",
  "tags": ["...", "..."],
  "seoKeywords": ["...", "..."],
  "videoPrompt": "A 15-second visual description for video generation"
}

The content should use Markdown formatting with ## for headings.`;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert content writer specializing in organic gardening, soil science, and sustainable agriculture.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 2500,
            response_format: { type: 'json_object' }
        });
        const choice = response.choices?.[0];
        const content = choice?.message?.content;
        if (!content)
            throw new Error('No content generated');
        const blogData = JSON.parse(content);
        // Generate slug from title
        const slug = blogData.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        // Add publish date
        const publishDate = new Date().toISOString();
        const blogPost = {
            ...blogData,
            slug,
            publishDate
        };
        console.log('✅ Blog article generated successfully!');
        console.log(`   Title: ${blogPost.title}`);
        console.log(`   Word Count: ~${blogPost.content.split(' ').length} words`);
        console.log(`   Tags: ${blogPost.tags.join(', ')}`);
        return blogPost;
    }
    catch (error) {
        console.error('❌ Failed to generate blog article:', error.message);
        throw error;
    }
}
/**
 * Generate video for the blog post using HeyGen
 */
async function generateBlogVideo(blogPost) {
    console.log(`\n🎬 Generating video for: ${blogPost.title}`);
    if (!process.env.HEYGEN_API_KEY && !process.env.GCP_SECRET_HEYGEN_API_KEY) {
        console.log('⚠️  HeyGen API key not configured, skipping video generation');
        return null;
    }
    try {
        // Create a compelling video script from the blog content
        const videoScript = `${blogPost.videoPrompt}. Professional, cinematic style. Nature, garden, soil close-ups. Vibrant green plants. Healthy soil texture.`;
        console.log('Creating HeyGen video job...');
        // Initialize HeyGen client with secrets support
        const heygen = await (0, heygen_1.createClientWithSecrets)();
        // Get avatar and voice settings with fallback defaults
        const avatar = process.env.HEYGEN_DEFAULT_AVATAR || 'garden_expert_01';
        const voice = process.env.HEYGEN_DEFAULT_VOICE || 'en_us_warm_female_01';
        const lengthSeconds = parseInt(process.env.HEYGEN_VIDEO_DURATION_SECONDS || '30');
        // Create video generation job
        const jobId = await heygen.createVideoJob({
            script: videoScript,
            title: blogPost.title,
            lengthSeconds,
            avatar,
            voice,
            music: {
                style: 'nature',
                volume: 0.15
            },
            subtitles: {
                enabled: true,
                style: 'modern'
            },
            webhook: process.env.HEYGEN_WEBHOOK_URL,
            meta: {
                blogSlug: blogPost.slug,
                category: blogPost.category
            }
        });
        console.log(`✅ HeyGen job created: ${jobId}`);
        console.log('⏳ Waiting for video to be ready...');
        // Poll for completion (timeout 20 minutes)
        const videoUrl = await heygen.pollJobForVideoUrl(jobId, {
            timeoutMs: 20 * 60_000,
            intervalMs: 10_000
        });
        if (videoUrl) {
            console.log(`✅ Video ready: ${videoUrl}`);
            return videoUrl;
        }
        else {
            console.log('⚠️  Video generation timed out or failed');
            return null;
        }
    }
    catch (error) {
        console.error('❌ Video generation failed:', error.message);
        return null;
    }
}
/**
 * Save blog post to Supabase or file system
 */
async function saveBlogPost(blogPost, videoUrl) {
    console.log(`\n💾 Saving blog post: ${blogPost.slug}`);
    // Try to save to Supabase first
    try {
        const { createClient } = await Promise.resolve().then(() => __importStar(require('@supabase/supabase-js')));
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
        const { data, error } = await supabase
            .from('blog_posts')
            .insert([
            {
                title: blogPost.title,
                slug: blogPost.slug,
                excerpt: blogPost.excerpt,
                content: blogPost.content,
                category: blogPost.category,
                tags: blogPost.tags,
                seo_keywords: blogPost.seoKeywords,
                video_url: videoUrl,
                published_at: blogPost.publishDate,
                status: 'published'
            }
        ])
            .select();
        if (error)
            throw error;
        console.log('✅ Blog post saved to database');
        console.log(`   URL: https://natureswaysoil.com/blog/${blogPost.slug}`);
        return data;
    }
    catch (error) {
        console.log('⚠️  Database save failed, saving to file instead');
        // Fallback: Save to file system
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const blogDir = path.join(process.cwd(), 'generated-blogs');
        if (!fs.existsSync(blogDir)) {
            fs.mkdirSync(blogDir, { recursive: true });
        }
        const blogData = {
            ...blogPost,
            videoUrl,
            generatedAt: new Date().toISOString()
        };
        const filename = path.join(blogDir, `${blogPost.slug}.json`);
        fs.writeFileSync(filename, JSON.stringify(blogData, null, 2));
        console.log(`✅ Blog post saved to file: ${filename}`);
        return blogData;
    }
}
/**
 * Post video to social media platforms
 */
async function postBlogVideoToSocial(blogPost, videoUrl) {
    console.log('\n📱 Posting video to social media...');
    const caption = `${blogPost.title}\n\n${blogPost.excerpt}\n\nRead more: https://natureswaysoil.com/blog/${blogPost.slug}\n\n#organicgardening #soilhealth #naturalgardening`;
    const results = {};
    // YouTube (caption used as title, first 5000 chars of content as description)
    if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
        try {
            console.log('📺 Uploading to YouTube...');
            const ytVideoId = await (0, youtube_1.postToYouTube)(videoUrl, blogPost.title, process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET, process.env.YT_REFRESH_TOKEN, process.env.YT_PRIVACY_STATUS || 'public');
            console.log('✅ Posted to YouTube:', ytVideoId);
            results.youtube = { success: true, videoId: ytVideoId };
        }
        catch (error) {
            console.error('❌ YouTube upload failed:', error.message);
            results.youtube = { success: false, error: error.message };
        }
    }
    else {
        console.log('⏭️  Skipping YouTube - credentials not configured');
    }
    // Instagram
    if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID) {
        try {
            console.log('📸 Posting to Instagram...');
            const igResult = await (0, instagram_1.postToInstagram)(videoUrl, caption, process.env.INSTAGRAM_ACCESS_TOKEN, process.env.INSTAGRAM_IG_ID);
            console.log('✅ Posted to Instagram:', igResult?.id || 'success');
            results.instagram = { success: true, mediaId: igResult?.id };
        }
        catch (error) {
            console.error('❌ Instagram post failed:', error.message);
            results.instagram = { success: false, error: error.message };
        }
    }
    else {
        console.log('⏭️  Skipping Instagram - credentials not configured');
    }
    // Twitter
    if (process.env.TWITTER_BEARER_TOKEN) {
        try {
            console.log('🐦 Posting to Twitter...');
            await (0, twitter_1.postToTwitter)(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN);
            console.log('✅ Posted to Twitter');
            results.twitter = { success: true };
        }
        catch (error) {
            console.error('❌ Twitter post failed:', error.message);
            results.twitter = { success: false, error: error.message };
        }
    }
    else {
        console.log('⏭️  Skipping Twitter - credentials not configured');
    }
    // Pinterest (requires board ID)
    if (process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID) {
        try {
            console.log('📌 Posting to Pinterest...');
            await (0, pinterest_1.postToPinterest)(videoUrl, caption, process.env.PINTEREST_ACCESS_TOKEN, process.env.PINTEREST_BOARD_ID);
            console.log('✅ Posted to Pinterest');
            results.pinterest = { success: true };
        }
        catch (error) {
            console.error('❌ Pinterest post failed:', error.message);
            results.pinterest = { success: false, error: error.message };
        }
    }
    else {
        console.log('⏭️  Skipping Pinterest - board ID not configured');
    }
    return results;
}
/**
 * Main execution function
 */
async function runBlogGeneration() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AUTOMATED BLOG & VIDEO GENERATION');
    console.log('='.repeat(60));
    console.log(`Started at: ${new Date().toISOString()}`);
    try {
        // Step 1: Generate blog article
        const blogPost = await generateBlogArticle();
        // Step 2: Generate video
        const videoUrl = await generateBlogVideo(blogPost);
        // Step 3: Save blog post
        await saveBlogPost(blogPost, videoUrl);
        // Step 4: Post to social media (if video was generated)
        let socialResults = {};
        if (videoUrl) {
            socialResults = await postBlogVideoToSocial(blogPost, videoUrl);
        }
        else {
            console.log('\n⏭️  Skipping social media posting - no video generated');
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ Blog generation completed successfully!');
        console.log('='.repeat(60));
        console.log(`Title: ${blogPost.title}`);
        console.log(`Slug: ${blogPost.slug}`);
        console.log(`Video: ${videoUrl || 'Not generated'}`);
        console.log(`Social Media:`);
        console.log(`  YouTube: ${socialResults.youtube?.success ? '✅' : '❌'}`);
        console.log(`  Instagram: ${socialResults.instagram?.success ? '✅' : '❌'}`);
        console.log(`  Twitter: ${socialResults.twitter?.success ? '✅' : '❌'}`);
        console.log(`  Pinterest: ${socialResults.pinterest?.success ? '✅' : '❌'}`);
        console.log('='.repeat(60) + '\n');
    }
    catch (error) {
        const message = error?.message || String(error);
        console.error('\n❌ Blog generation failed:', message);
        throw error;
    }
}
// Run if executed directly
if (require.main === module) {
    runBlogGeneration().then(() => {
        console.log('✅ Done');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}
