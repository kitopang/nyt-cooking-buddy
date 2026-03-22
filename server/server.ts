import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import listsRouter from './routes/lists.js';
import recipesRouter from './routes/recipes.js';
import ingredientsRouter from './routes/ingredients.js';
import orderRouter from './routes/order.js';
import aggregateRouter from './routes/aggregate.js';

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

app.use('/api/shopping-list', aggregateRouter);
app.use('/api/lists', listsRouter);
app.use('/api/lists/:listId/recipes', recipesRouter);
app.use('/api/lists/:listId/ingredients', ingredientsRouter);
app.use('/api/lists/:listId', orderRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/ingredients', ingredientsRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`nyt-food server running at http://localhost:${PORT}`);
  if (!process.env['ANTHROPIC_API_KEY'] || process.env['ANTHROPIC_API_KEY'] === 'your_key_here') {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — Order on Amazon Fresh will fail. Add it to server/.env');
  }
});
