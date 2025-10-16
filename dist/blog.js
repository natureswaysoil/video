"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postBlogArticle = postBlogArticle;
exports.validateGitHubToken = validateGitHubToken;
const axios_1 = __importDefault(require("axios"));
const openai_1 = require("./openai");
/**
 * Post a new blog article to the Nature's Way Soil website
 * Uses GitHub API to update blog_articles.json
 */
async function postBlogArticle(articleData, githubToken, repo = 'natureswaysoil/coplit-built', branch = 'main') {
    try {
        console.log('📝 Generating blog article for:', articleData.productTitle);
        // Step 1: Generate article content with OpenAI
        const article = await (0, openai_1.generateBlogArticle)(articleData);
        // Step 2: Fetch current blog_articles.json from GitHub
        const fileUrl = `https://api.github.com/repos/${repo}/contents/public/blog_articles.json?ref=${branch}`;
        const fileResponse = await axios_1.default.get(fileUrl, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
        const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
        const currentArticles = JSON.parse(currentContent);
        // Step 3: Add new article to the beginning (newest first)
        const newArticle = {
            id: article.id || `article_${Date.now()}`,
            slug: article.slug || articleData.productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            title: article.title,
            excerpt: article.excerpt,
            content: article.content,
            publishDate: new Date().toISOString(),
            category: article.category || 'Product Spotlight',
            featuredImage: article.featuredImage || articleData.videoUrl.replace('.mp4', '-thumbnail.jpg'),
            author: 'Nature\'s Way Soil Team',
            tags: article.tags || extractTags(articleData.productTitle),
            metaDescription: article.metaDescription || article.excerpt.substring(0, 160),
            featuredPost: false,
            videoUrl: articleData.videoUrl
        };
        currentArticles.unshift(newArticle);
        // Step 4: Update file on GitHub
        const updatedContent = JSON.stringify(currentArticles, null, 2);
        const updateResponse = await axios_1.default.put(fileUrl, {
            message: `Add blog article: ${newArticle.title}`,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: fileResponse.data.sha,
            branch
        }, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
        console.log('✅ Blog article posted successfully');
        console.log('   Article ID:', newArticle.id);
        console.log('   Slug:', newArticle.slug);
        console.log('   Commit SHA:', updateResponse.data.commit.sha);
        return {
            success: true,
            articleId: newArticle.id,
            commitSha: updateResponse.data.commit.sha
        };
    }
    catch (error) {
        console.error('❌ Failed to post blog article:', {
            error: error?.message || String(error),
            response: error?.response?.data
        });
        throw error;
    }
}
/**
 * Extract relevant tags from product title
 */
function extractTags(productTitle) {
    const tags = new Set();
    const title = productTitle.toLowerCase();
    // Product type tags
    if (title.includes('fertilizer'))
        tags.add('fertilizer');
    if (title.includes('compost'))
        tags.add('compost');
    if (title.includes('biochar'))
        tags.add('biochar');
    if (title.includes('kelp') || title.includes('seaweed'))
        tags.add('kelp');
    if (title.includes('soil'))
        tags.add('soil amendment');
    if (title.includes('liquid'))
        tags.add('liquid fertilizer');
    if (title.includes('organic'))
        tags.add('organic');
    // Application tags
    if (title.includes('tomato'))
        tags.add('tomato');
    if (title.includes('lawn') || title.includes('grass'))
        tags.add('lawn care');
    if (title.includes('garden'))
        tags.add('gardening');
    if (title.includes('hydroponic'))
        tags.add('hydroponics');
    if (title.includes('orchid'))
        tags.add('orchids');
    if (title.includes('vegetable'))
        tags.add('vegetables');
    // Always include general tags
    tags.add('plant care');
    tags.add('soil health');
    tags.add('natural methods');
    return Array.from(tags);
}
/**
 * Validate GitHub token has necessary permissions
 */
async function validateGitHubToken(token, repo = 'natureswaysoil/coplit-built') {
    try {
        const response = await axios_1.default.get(`https://api.github.com/repos/${repo}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
        return response.status === 200;
    }
    catch (error) {
        return false;
    }
}
