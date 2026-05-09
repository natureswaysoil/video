// Compatibility entrypoint for older Cloud Run Jobs that still execute:
//   node /app/dist/fill-video-urls.js
//
// The main production runner lives in ./cli. Importing it starts the same
// video generation + Google Sheets writeback flow used by dist/cli.js.
import './cli'
