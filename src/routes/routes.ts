import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { resolveCity } from '../constants';
import { getPathCities } from '../services/routeCorridors';

const router = Router();

router.get('/path', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      fromCity: z.string().min(2),
      toCity: z.string().min(2),
    });
    const query = schema.parse(req.query);

    const fromCity = resolveCity(query.fromCity);
    const toCity = resolveCity(query.toCity);

    if (!fromCity || !toCity) {
      return res.status(400).json({ error: 'Pick valid cities from the list.' });
    }
    if (fromCity.toLowerCase() === toCity.toLowerCase()) {
      return res.status(400).json({ error: 'From and To must be different cities.' });
    }

    const path = getPathCities(fromCity, toCity);
    return res.json(path);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter from city and to city.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not load route path.' });
  }
});

export default router;
