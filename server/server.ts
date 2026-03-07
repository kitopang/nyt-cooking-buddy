import express from 'express';
import cors from 'cors';
import listsRouter from './routes/lists.js';
import recipesRouter from './routes/recipes.js';
import ingredientsRouter from './routes/ingredients.js';

const app = express();
const PORT = 3001;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Playwright) and chrome-extension:// origins
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());

app.use('/api/lists', listsRouter);
app.use('/api/lists/:listId/recipes', recipesRouter);
app.use('/api/lists/:listId/ingredients', ingredientsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/ingredients', ingredientsRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`nyt-food server running at http://localhost:${PORT}`);
});
