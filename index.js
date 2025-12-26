require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');
const axios = require('axios');

const app = express();
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MOVIES_DB = process.env.MOVIES_DB_ID;
const HISTORY_DB = process.env.HISTORY_DB_ID;

let lastSyncTime = new Date(0).toISOString();

// Polling cada 5 min
async function syncRecentActivity() {
  try {
    const now = new Date().toISOString();
    
    // Trakt API: últimos activities
    const response = await axios.get('https://api.trakt.tv/sync/history', {
      headers: {
        'Authorization': `Bearer ${process.env.TRAKT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
      },
      params: {
        start_at: lastSyncTime,
        end_at: now,
        limit: 10
      }
    });

    for (const item of response.data) {
      await processItem(item);
    }
    
    lastSyncTime = now;
    console.log('✅ Sync completado:', response.data.length, 'items');
  } catch (error) {
    console.error('Error sync:', error.response?.data || error.message);
  }
}

async function processItem(item) {
  const media = item.movie || item.episode || item.show;
  if (!media) return;

  // 1. History DB
  await notion.pages.create({
    parent: { database_id: HISTORY_DB },
    properties: {
      Title: { title: [{ text: { content: media.title } }] },
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
      Type: { select: { name: item.type === 'movie' ? 'Movie' : 'TV' } },
      'Trakt ID': { number: media.ids.trakt }
    }
  });

  // 2. Movies/TV DB
  const existing = await notion.databases.query({
    database_id: MOVIES_DB,
    filter: { 
      property: 'Trakt ID', 
      number: { equals: media.ids.trakt }
    }
  });

  const properties = {
    Title: { title: [{ text: { content: media.title } }] },
    'Trakt ID': { number: media.ids.trakt },
    'Last Watched': { date: { start: new Date().toISOString().split('T')[0] } }
  };

  if (existing.results.length > 0) {
    await notion.pages.update({ 
      page_id: existing.results[0].id, 
      properties 
    });
  } else {
    await notion.pages.create({ 
      parent: { database_id: MOVIES_DB }, 
      properties 
    });
  }
}

// Cada 5 minutos
setInterval(syncRecentActivity, 5 * 60 * 1000);
syncRecentActivity();

app.listen(3000, () => console.log('🚀 Trakt→Notion activo'));
