-- Create blog_posts table for storing generated articles
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  seo_keywords TEXT[],
  video_url TEXT,
  featured_image TEXT,
  author TEXT DEFAULT 'Nature''s Way Soil Team',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INTEGER DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT
);

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- Create index on published_at for sorting
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_blog_posts_search ON blog_posts USING gin(to_tsvector('english', title || ' ' || content));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS blog_posts_updated_at ON blog_posts;
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_posts_updated_at();

-- Enable Row Level Security
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read published posts
CREATE POLICY "Anyone can view published blog posts"
  ON blog_posts
  FOR SELECT
  USING (status = 'published');

-- Policy: Service role can do everything
CREATE POLICY "Service role has full access to blog posts"
  ON blog_posts
  FOR ALL
  USING (auth.role() = 'service_role');

-- Insert sample blog post
INSERT INTO blog_posts (
  title,
  slug,
  excerpt,
  content,
  category,
  tags,
  seo_keywords,
  status,
  published_at
) VALUES (
  '5 Essential Tips for Healthy Soil',
  '5-essential-tips-for-healthy-soil',
  'Discover the secrets to building rich, fertile soil that will transform your garden and help your plants thrive naturally.',
  E'## Introduction\n\nHealthy soil is the foundation of any successful garden. In this guide, we''ll explore five essential tips that will help you build and maintain nutrient-rich soil.\n\n## 1. Add Organic Matter Regularly\n\nOrganic matter is crucial for soil health. Compost, worm castings, and aged manure all contribute beneficial nutrients and improve soil structure.\n\n## 2. Test Your Soil pH\n\nMost plants prefer a pH between 6.0 and 7.0. Test your soil annually and amend as needed with lime or sulfur.\n\n## 3. Use Beneficial Microbes\n\nHealthy soil is alive with beneficial bacteria and fungi. Products like Nature''s Way Soil amendments introduce these helpful microorganisms.\n\n## 4. Practice Crop Rotation\n\nRotating your crops prevents nutrient depletion and reduces pest problems naturally.\n\n## 5. Mulch Generously\n\nMulching conserves moisture, suppresses weeds, and feeds the soil as it breaks down.\n\n## Conclusion\n\nBy following these five tips, you''ll create a thriving soil ecosystem that supports healthy, productive plants year after year.',
  'Soil Health',
  ARRAY['soil health', 'organic gardening', 'compost', 'gardening tips'],
  ARRAY['healthy soil', 'soil improvement', 'organic matter', 'soil pH', 'beneficial microbes'],
  'published',
  NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Grant permissions
GRANT SELECT ON blog_posts TO anon;
GRANT ALL ON blog_posts TO authenticated;
GRANT ALL ON blog_posts TO service_role;

COMMENT ON TABLE blog_posts IS 'Stores blog articles with video content for Nature''s Way Soil website';
