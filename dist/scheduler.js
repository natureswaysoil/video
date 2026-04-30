"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const child_process_1 = require("child_process");
function runPipeline() {
    console.log('🚀 Running video pipeline...');
    (0, child_process_1.exec)('npm run run:once', (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Pipeline error:', error.message);
            return;
        }
        if (stderr) {
            console.error('⚠️ Pipeline stderr:', stderr);
        }
        console.log('✅ Pipeline output:', stdout);
    });
}
function generateRows() {
    console.log('🧠 Generating new content rows...');
    (0, child_process_1.exec)('npm run generate:rows', (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Row generation error:', error.message);
            return;
        }
        if (stderr) {
            console.error('⚠️ Row generation stderr:', stderr);
        }
        console.log('✅ Rows generated:', stdout);
    });
}
// 🧠 NEW: Generate fresh rows every morning at 7:00 AM
node_cron_1.default.schedule('0 7 * * *', () => {
    console.log('🌅 Morning row generation triggered');
    generateRows();
});
// Existing posting schedule
const schedule = [
    '15 8 * * *', // YouTube AM
    '30 11 * * *', // Instagram AM
    '0 13 * * *', // Facebook
    '15 18 * * *', // Instagram PM
    '30 19 * * *', // YouTube PM
];
console.log('⏰ Scheduler started...');
schedule.forEach((time) => {
    node_cron_1.default.schedule(time, () => {
        console.log(`⏱ Running scheduled job at ${time}`);
        runPipeline();
    });
});
// Run immediately on start
runPipeline();
