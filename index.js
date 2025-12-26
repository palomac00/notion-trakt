require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MOVIES_DB = process.env.MOVIES_DB_ID;
const HISTORY_DB = process.env.HISTORY_DB_ID;
const TRAKT_TOKEN = process.env.TRAKT_ACCESS_TOKEN;
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

// Webhook endpoint (por si funciona)
app.post('/trakt-webhook', async (req, res) => {
  res.sendStatus(200);
});

// Polling: revisa cada 5 minutos
async function syncTrakt() {
  try {
    const response = await axios.get('https://api.trakt.tv/sync/history/all', {
      headers: {
        'Authorization': `Bearer ${TRAKT_TOKEN}`,
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID
      },
      params: { limit: 10 }
    });

    for (const item of response.data) {
      const media = item.movie || item.episode;
      if (!media) continue;

      // Check if already exists
      const existing = await notion.databases.query({
        database_id: HISTORY_DB,
        filter: { property: 'Trakt ID', number: { equals: item.id } }
      }).catch(() => ({ results: [] }));

      if (existing.results.length > 0) continue; // Ya existe

      // Add to History
      await notion.pages.create({
        parent: { database_id: HISTORY_DB },
        properties: {
          'Title': { title: [{ text: { content: media.title } }] },
          'Date': { date: { start: item.watched_at?.split('T')[0] || new Date().toISOString().split('T')[0] } },
          'Type': { select: { name: item.episode ? 'TV' : 'Movie' } },
          'Trakt ID': { number: item.id }
        }
      });

      console.log('Synced:', media.title);
    }
  } catch (error) {
    console.error('Sync error:', error.message);
  }
}

// Sincroniza cada 5 minutos
setInterval(syncTrakt, 5 * 60 * 1000);
syncTrakt(); // Una vez al iniciar

app.listen(3000, () => console.log('Trakt→Notion sync ready on port 3000'));