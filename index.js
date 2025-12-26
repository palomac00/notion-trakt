require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MOVIES_DB = process.env.MOVIES_DB_ID;
const HISTORY_DB = process.env.HISTORY_DB_ID;

// Webhook endpoint para Trakt
app.post('/trakt-webhook', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    const { action, episode, movie } = req.body;
    
    if (action === 'scrobble' || action === 'checkin') {
      const media = episode || movie;
      if (!media) {
        res.sendStatus(200);
        return;
      }

      console.log('Processing:', media.title);

      // Add to History DB
      try {
        await notion.pages.create({
          parent: { database_id: HISTORY_DB },
          properties: {
            'Title': { title: [{ text: { content: media.title } }] },
            'Date': { date: { start: new Date().toISOString().split('T')[0] } },
            'Type': { select: { name: episode ? 'TV' : 'Movie' } },
            'Trakt ID': { number: media.ids?.trakt || 0 }
          }
        });
        console.log('✓ Added to History:', media.title);
      } catch (e) {
        console.error('History error:', e.message);
      }

      // Add to Movies/TV DB
      try {
        const properties = {
          'Title': { title: [{ text: { content: media.title } }] },
          'Poster': { url: media.images?.poster?.thumb || '' },
          'IMDb Rating': { number: 0 },
          'Trakt Rating': { number: 0 },
          'Last Watched': { date: { start: new Date().toISOString().split('T')[0] } },
          'Trakt ID': { number: media.ids?.trakt || 0 }
        };

        await notion.pages.create({
          parent: { database_id: MOVIES_DB },
          properties
        });
        console.log('✓ Added to Movies/TV:', media.title);
      } catch (e) {
        console.error('Movies/TV error:', e.message);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Trakt→Notion sync ready on port 3000'));