import { generateScript } from "./openai.js";
import { createHeyGenVideo } from "./heygen.js";

async function run() {
  console.log("🚀 CRON STARTED");

  try {
    console.log("Generating script...");

    const script = await generateScript();

    console.log("=== SCRIPT OUTPUT ===");
    console.log(script);
    console.log("=====================");

    if (!script || script.length < 50) {
      console.log("❌ Script invalid — skipping video");
      return;
    }

    console.log("✅ Sending to HeyGen...");

    await createHeyGenVideo(script);

    console.log("🎉 DONE");
  } catch (err) {
    console.error("🔥 ERROR:", err);
  }
}

run();
