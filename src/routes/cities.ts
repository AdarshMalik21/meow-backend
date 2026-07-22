import { Router } from 'express';
import { z } from 'zod';
import { searchCities } from '../services/cityDirectory';

const router = Router();

router.get('/', (req, res) => {
  try {
    const schema = z.object({
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(30).optional(),
    });
    const { q = '', limit = 15 } = schema.parse(req.query);
    const cities = searchCities(q, limit);
    return res.json({ cities });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search query.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not search cities.' });
  }
});

export default router;
