import axios from "axios";
import { generateScript } from "./openai";
import { createHeyGenVideo } from "./heygen";

async function run() {
  console.log("🚀 CRON STARTED");

  try {
    const csvUrl =
      process.env.CSV_URL ||
      process.env.GOOGLE_SHEET_CSV_URL;

    console.log("GOOGLE_SHEET_CSV_URL loaded:", !!process.env.GOOGLE_SHEET_CSV_URL);

    if (!csvUrl) {
      throw new Error("CSV_URL / GOOGLE_SHEET_CSV_URL not set");
    }

    console.log("Fetching CSV...");

    const response = await axios.get(csvUrl);
    const csvText = response.data;

    console.log("CSV fetched successfully");
    console.log("=== CSV PREVIEW ===");
    console.log(String(csvText).slice(0, 500));
    console.log("===================");

    console.log("Generating script...");

    const script = await generateScript(csvText);

    console.log("=== SCRIPT OUTPUT ===");
    console.log(script);
    console.log("=====================");

    if (
      !script ||
      script.length < 50 ||
      script.toLowerCase().includes("in this video") ||
      script.toLowerCase().includes("show") ||
      script.toLowerCase().includes("step") ||
      script.toLowerCase().includes("scene") ||
      script.toLowerCase().includes("camera")
    ) {
      throw new Error("Bad instruction-style script detected. Stopping before HeyGen.");
    }

    console.log("✅ Sending to HeyGen...");

    await createHeyGenVideo(script);

    console.log("🎉 DONE");
  } catch (err) {
    console.error("🔥 ERROR:", err);
  }
}

run();
