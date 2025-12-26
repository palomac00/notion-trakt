require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MOVIES_DB = process.env.MOVIES_DB_ID;
const HISTORY_DB = process.env.HISTORY_DB_ID;

app.post('/trakt-webhook', async (req, res) => {
  try {
    const { action, episode, movie } = req.body;
    console.log('Webhook received:', { action, episode: episode?.title, movie: movie?.title });
    
    if (action === 'scrobble') {
      const media = episode || movie;
      
      // Add to History
      await notion.pages.create({
        parent: { database_id: HISTORY_DB },
        properties: {
          'Title': { title: [{ text: { content: media.title } }] },
          'Date': { date: { start: new Date().toISOString().split('T')[0] } },
          'Type': { select: { name: episode ? 'TV' : 'Movie' } },
          'Trakt ID': { number: media.ids.trakt }
        }
      });
      
      console.log('Added to history:', media.title);
      
      // Update or create in Movies/TV
      const existing = await notion.databases.query({
        database_id: MOVIES_DB,
        filter: {
          property: 'Trakt ID',
          number: { equals: media.ids.trakt }
        }
      });
      
      const properties = {
        'Title': { title: [{ text: { content: media.title } }] },
        'Poster': { url: media.images?.poster?.thumb || '' },
        'IMDb Rating': { number: media.rating?.imdb || 0 },
        'Trakt Rating': { number: media.rating?.percentage || 0 },
        'Last Watched': { date: { start: new Date().toISOString().split('T')[0] } },
        'Trakt ID': { number: media.ids.trakt }
      };
      
      if (existing.results.length > 0) {
        await notion.pages.update({
          page_id: existing.results[0].id,
          properties
        });
        console.log('Updated in Movies/TV:', media.title);
      } else {
        await notion.pages.create({
          parent: { database_id: MOVIES_DB },
          properties
        });
        console.log('Created in Movies/TV:', media.title);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Trakt→Notion sync ready on port 3000'));