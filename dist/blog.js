"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postBlogArticle = postBlogArticle;
exports.validateGitHubToken = validateGitHubToken;
const axios_1 = __importDefault(require("axios"));
function generateBlogArticle(articleData) {
    const title = `${articleData.productTitle}: Product Spotlight`;
    const description = articleData.productDescription || `${articleData.productTitle} from Nature's Way Soil.`;
    const excerpt = `${articleData.productTitle} is designed for customers who want practical soil and plant support as part of a regular care routine.`;
    const content = [
        `# ${title}`,
        '',
        description,
        '',
        `Nature's Way Soil focuses on practical products for lawns, gardens, landscapes, and small farms. ${articleData.productTitle} gives customers a simple way to support the soil and root zone while keeping application straightforward.`,
        '',
        articleData.productUrl ? `Learn more: ${articleData.productUrl}` : 'Learn more at natureswaysoil.com.',
        articleData.videoUrl ? `Video: ${articleData.videoUrl}` : '',
    ].filter(Boolean).join('\n');
    return {
        id: `article_${Date.now()}`,
        title,
        excerpt,
        content,
        category: 'Product Spotlight',
        featuredImage: articleData.videoUrl.replace('.mp4', '-thumbnail.jpg'),
        tags: extractTags(articleData.productTitle),
        metaDescription: excerpt.substring(0, 160),
    };
}
/**
 * Post a new blog article to the Nature's Way Soil website
 * Uses GitHub API to update blog_articles.json
 */
async function postBlogArticle(articleData, githubToken, repo = 'natureswaysoil/coplit-built', branch = 'main') {
    try {
        console.log('📝 Generating blog article for:', articleData.productTitle);
        const article = generateBlogArticle(articleData);
        const fileUrl = `https://api.github.com/repos/${repo}/contents/public/blog_articles.json?ref=${branch}`;
        const fileResponse = await axios_1.default.get(fileUrl, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
        const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
        const currentArticles = JSON.parse(currentContent);
        const baseSlug = article.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const existingSlugs = new Set(currentArticles.map((a) => a.slug));
        const slug = existingSlugs.has(baseSlug) ? `${baseSlug}-${Date.now()}` : baseSlug;
        const existingTitles = new Set(currentArticles.map((a) => a.title.toLowerCase()));
        if (existingTitles.has(article.title.toLowerCase())) {
            console.log(`⚠️ Blog article "${article.title}" already exists — skipping duplicate`);
            return { success: true, articleId: 'duplicate-skipped' };
        }
        const newArticle = {
            id: article.id || `article_${Date.now()}`,
            slug,
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
