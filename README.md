# Nature's Way Soil - Automated Product Video Generator

## Features
- Fetch products from a Google Sheet (CSV export URL)
- Generate marketing scripts with OpenAI
- Submit image-to-video or text-to-video jobs to WaveSpeed
- Posts generated video to Instagram, Twitter, and Pinterest

## Setup

1. Copy `.env.example` to `.env` and fill in all required keys and tokens.
2. Install dependencies:
   ```
   npm install
   ```
3. Run the CLI:
   ```
   npm run dev
   ```
   Or process and post a single product:
   ```
   ts-node src/cli.ts
   ```

## Security Notes

- **Never commit your real `.env` file or any secrets to GitHub.**
- Rotate keys if you ever leak them.

## Troubleshooting

- If social posts fail, check your tokens and permissions.
- WaveSpeed job/video URL logic may require refinement based on latest API responses.

## License

MIT