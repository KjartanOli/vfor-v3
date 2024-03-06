import express from 'express';
import { catchErrors } from './lib/catch-errors.js';
import { router } from './routes/api.js';

const app = express();

app.get('/');
app.use(express.json())
app.use(router);

const port = 3000;

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
