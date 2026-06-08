"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const node_cron_1 = __importDefault(require("node-cron"));
const child_process_1 = require("child_process");
function runCommand(label, command) {
    console.log(`🚀 ${label}... (${command})`);
    (0, child_process_1.exec)(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ ${label} error:`, error.message);
            return;
        }
        if (stderr) {
            console.error(`⚠️ ${label} stderr:`, stderr);
        }
        console.log(`✅ ${label} output:`, stdout);
    });
}
function runPipeline() {
    const pipelineCommand = process.env.SCHEDULER_PIPELINE_COMMAND || 'npm run run:once';
    runCommand('Running pipeline', pipelineCommand);
}
function generateRows() {
    const generateRowsCommand = process.env.SCHEDULER_GENERATE_ROWS_COMMAND || 'npm run generate:rows';
    runCommand('Generating new content rows', generateRowsCommand);
}
const schedule = (process.env.SCHEDULER_POST_TIMES || '15 8 * * *,30 11 * * *,0 13 * * *,15 18 * * *,30 19 * * *')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const isTestVideoMode = String(process.env.TEST_VIDEO_CAMPAIGN_MODE || 'false').toLowerCase() === 'true';
if (!isTestVideoMode) {
    const rowGenerationCron = process.env.SCHEDULER_ROW_GENERATION_CRON || '0 7 * * *';
    node_cron_1.default.schedule(rowGenerationCron, () => {
        console.log('🌅 Morning row generation triggered');
        generateRows();
    });
}
console.log('⏰ Scheduler started...');
console.log('Schedule:', schedule);
console.log('TEST_VIDEO_CAMPAIGN_MODE:', isTestVideoMode);
schedule.forEach((time) => {
    node_cron_1.default.schedule(time, () => {
        console.log(`⏱ Running scheduled job at ${time}`);
        runPipeline();
    });
});
// Run immediately on start
runPipeline();
