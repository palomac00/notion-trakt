// index.js - Versión POLLING (sin webhooks)
require('dotenv').config();
const Trakt = require('trakt-api');
const { Client } = require('@notionhq/client');

const trakt = new Trakt(
  process.env.TRAKT_CLIENT_ID,
  process.env.TRAKT_CLIENT_SECRET,
  process.env.TRAKT_ACCESS_TOKEN
);

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MOVIES_DB = process.env.MOVIES_DB_ID;
const HISTORY_DB = process.env.HISTORY_DB_ID;

let lastSyncTime = new Date(0); // Inicio

// Función principal: consulta últimos 10 min
async function syncRecentActivity() {
  try {
    const now = new Date();
    const activities = await trakt.activity({
      start: lastSyncTime.toISOString(),
      end: now.toISOString()
    });
    
    for (const item of activities.episodes || []) {
      await processItem(item);
    }
    for (const item of activities.movies || []) {
      await processItem(item);
    }
    
    lastSyncTime = now;
    console.log('✅ Sync completado');
  } catch (error) {
    console.error('Error sync:', error.message);
  }
}

// Process item (igual que antes)
async function processItem(media) {
  // 1. History DB
  await notion.pages.create({
    parent: { database_id: HISTORY_DB },
    properties: {
      Title: { title: [{ text: { content: media.title } }] },
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
      Type: { select: { name: media.type === 'episode' ? 'TV' : 'Movie' } },
      'Trakt ID': { number: media.ids.trakt }
    }
  });
  
  // 2. Movies/TV DB (update/create)
  const existing = await notion.databases.query({
    database_id: MOVIES_DB,
    filter: { property: 'Trakt ID', number: { equals: media.ids.trakt } }
  });
  
  const properties = {
    Title: { title: [{ text: { content: media.title } }] },
    Poster: { url: media.images?.poster?.thumb || '' },
    'IMDb Rating': { number: media.ratings?.votes?.imdb || 0 },
    'Trakt Rating': { number: media.ratings?.percentage || 0 },
    'Last Watched': { date: { start: new Date().toISOString().split('T')[0] } },
    'Trakt ID': { number: media.ids.trakt }
  };
  
  if (existing.results.length > 0) {
    await notion.pages.update({ page_id: existing.results[0].id, properties });
  } else {
    await notion.pages.create({ parent: { database_id: MOVIES_DB }, properties });
  }
}

// Cada 5 minutos
setInterval(syncRecentActivity, 5 * 60 * 1000);
syncRecentActivity(); // Primera ejecución

console.log('🚀 Trakt→Notion polling activo (cada 5min)');
