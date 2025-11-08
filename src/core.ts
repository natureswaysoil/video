import axios from 'axios';

interface Product {
  name?: string;
  title?: string;
  details?: string;
  description?: string;
  imageUrl?: string;
  [key: string]: any;
}

type ProcessResult = 
  | { skipped: true; product?: never; jobId?: never }
  | { skipped: false; product: Product; jobId: string | null }

/**
 * Fetch and parse CSV data from a Google Sheets export URL
 */
async function fetchCsvData(csvUrl: string): Promise<Product[]> {
  try {
    const response = await axios.get(csvUrl);
    const csvText = response.data;
    
    // Simple CSV parser - splits by newlines and commas
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }
    
    // Parse header row
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"(.*)"$/, '$1'));
    
    // Parse data rows
    const products: Product[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v: string) => v.trim().replace(/^"(.*)"$/, '$1'));
      const product: Product = {};
      headers.forEach((header: string, index: number) => {
        product[header] = values[index] || '';
      });
      products.push(product);
    }
    
    return products;
  } catch (error) {
    console.error('Error fetching CSV:', error);
    throw error;
  }
}

/**
 * Generate marketing script using OpenAI
 */
async function generateScript(product: Product): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.warn('OPENAI_API_KEY not set, using product description as script');
    return product.details || product.description || product.title || product.name || '';
  }
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a marketing copywriter creating engaging short video scripts for social media.'
          },
          {
            role: 'user',
            content: `Create a short, engaging marketing script (30-60 seconds) for this product:\n\nName: ${product.name || product.title}\nDescription: ${product.details || product.description || ''}`
          }
        ],
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating script with OpenAI:', error);
    // Fallback to product description
    return product.details || product.description || product.title || product.name || '';
  }
}

/**
 * Submit video generation job to WaveSpeed
 */
async function submitToWaveSpeed(script: string, imageUrl?: string): Promise<string | null> {
  const wavespeedApiKey = process.env.WAVESPEED_API_KEY;
  if (!wavespeedApiKey) {
    console.warn('WAVESPEED_API_KEY not set, skipping video generation');
    return null;
  }
  
  try {
    const payload: any = {
      script: script,
      type: imageUrl ? 'image-to-video' : 'text-to-video'
    };
    
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }
    
    const response = await axios.post(
      'https://api.wavespeed.ai/v1/jobs',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${wavespeedApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.jobId || response.data.id;
  } catch (error) {
    console.error('Error submitting to WaveSpeed:', error);
    return null;
  }
}

/**
 * Main function to process CSV URL and generate video
 */
export async function processCsvUrl(csvUrl: string): Promise<ProcessResult> {
  try {
    // Fetch products from CSV
    const products = await fetchCsvData(csvUrl);
    
    if (products.length === 0) {
      console.log('No products found in CSV');
      return { skipped: true };
    }
    
    // Get first valid product (you can add logic to filter/select specific products)
    const product = products[0];
    
    if (!product.name && !product.title) {
      console.log('Product missing name/title');
      return { skipped: true };
    }
    
    console.log(`Processing product: ${product.name || product.title}`);
    
    // Generate marketing script
    const script = await generateScript(product);
    console.log('Generated script:', script);
    
    // Submit to WaveSpeed for video generation
    const jobId = await submitToWaveSpeed(script, product.imageUrl);
    
    if (jobId) {
      console.log(`WaveSpeed job created: ${jobId}`);
    } else {
      console.log('No WaveSpeed job created (API key missing or error)');
    }
    
    return {
      skipped: false,
      product,
      jobId
    };
  } catch (error) {
    console.error('Error processing CSV:', error);
    return { skipped: true };
  }
}
