import axios from "axios";
import { generateScript } from "./openai";
import { mapProductToHeyGenPayload } from "./heygen-adapter";
import HeyGenClient, { createClientWithSecrets } from "./heygen";
import { logVideoPost } from "./analytics-tracker";
import { getLogger } from "./logger";

const logger = getLogger();

async function run() {
  console.log("🚀 CRON STARTED - Video Marketing Engine");

  try {
    const csvUrl = process.env.CSV_URL || process.env.GOOGLE_SHEET_CSV_URL;
    if (!csvUrl) throw new Error("CSV_URL or GOOGLE_SHEET_CSV_URL not set");

    console.log("Fetching CSV from Google Sheet...");
    const response = await axios.get(csvUrl);
    const csvText = response.data as string;

    // Simple CSV parser (works with Google Sheet export)
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim().replace(/"/g, "") || "";
      });
      rows.push(row);
    }

    console.log(`✅ Parsed ${rows.length} products from sheet`);

    const heygenClient = await createClientWithSecrets();
    const analyticsRows: any[] = [];

    for (const row of rows) {
      // Skip already posted products
      if (row.Posted === "true" || row.Posted === "TRUE" || row.Posted === "1") {
        continue;
      }

      console.log(`Processing: ${row.Title || row.title || row.Product || "Untitled"}`);

      // Use the full new adapter (structured script + Pexels B-roll)
      const mapped = await mapProductToHeyGenPayload(row);

      // Create video with multi-scene + B-roll
      const jobId = await heygenClient.createVideoJob(mapped.payload);
      console.log(`✅ HeyGen job created: ${jobId}`);

      // In production you would poll for the video URL here
      // For now we log the job (you can expand this later)
      analyticsRows.push({
        rowIndex: rows.indexOf(row) + 2, // Google Sheet row number
        productId: row.ID || row.id || row.Product || "unknown",
        postedAt: new Date().toISOString(),
        instagramUrl: `https://instagram.com/reel/pending-${jobId}`,
        xUrl: `https://x.com/pending-${jobId}`,
        pinterestUrl: `https://pinterest.com/pending-${jobId}`,
        youtubeUrl: `https://youtube.com/shorts/pending-${jobId}`,
      });
    }

    // Log everything to your Google Sheet
    if (analyticsRows.length > 0) {
      const success = await logVideoPost(
        process.env.GOOGLE_SHEET_ID!,
        process.env.GOOGLE_SHEET_GID || "916620075",
        analyticsRows
      );
      if (success) console.log(`✅ Analytics logged for ${analyticsRows.length} videos`);
    }

    console.log("🎉 CRON FINISHED SUCCESSFULLY");
  } catch (err: any) {
    console.error("🔥 CRON ERROR:", err.message);
    logger.error("Cron job failed", "CLI", {}, err);
  }
}

run();
