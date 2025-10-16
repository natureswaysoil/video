#!/usr/bin/env node
/*
  Lists Pinterest boards using a v5 access token.
  Usage:
    PINTEREST_ACCESS_TOKEN=... node scripts/list-pinterest-boards.js

  Output: One line per board -> "<id>  |  <name>"
*/

const token = process.env.PINTEREST_ACCESS_TOKEN;
if (!token) {
  console.error('Missing PINTEREST_ACCESS_TOKEN in environment.');
  process.exit(1);
}

(async () => {
  try {
    const res = await fetch('https://api.pinterest.com/v5/boards?page_size=50', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const boards = json?.items || json?.data || [];
    if (!Array.isArray(boards) || boards.length === 0) {
      console.log('No boards found for this token.');
      return;
    }
    boards.forEach((b) => {
      const id = b.id || b.board_id || b.external_id || 'unknown-id';
      const name = b.name || b.title || 'Unnamed board';
      console.log(`${id}  |  ${name}`);
    });
  } catch (err) {
    console.error('Error listing boards:', err.message || err);
    process.exit(1);
  }
})();
