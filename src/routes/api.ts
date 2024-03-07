import express, { Request, Response, NextFunction } from 'express';
import { Ok, Err, Result, None, Some } from 'ts-results-es';
import { Argon2id } from 'oslo/password';

import { get_teams, create_team, get_team, update_team, delete_team, get_user } from '../lib/db.js';
import { get_games } from '../lib/db.js';
import { get_game } from '../lib/db.js';
import { delete_game } from '../lib/db.js';
import { ProtoGame, Slug, TeamId, InvalidField } from '../lib/types.js';
import { get_team_id } from '../lib/db.js';
import { create_game } from '../lib/db.js';
import { make_slug } from '../lib/utils.js';

import { auth } from '../lib/auth.js';

export const router = express.Router();

const argon = new Argon2id();

async function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'Missing Authorization header'});
    return;
  }
  const [_, token] = req.headers.authorization.split(' ');
  if (!token) {
    res.status(401).json({ error: 'Session token mising from Authorization header'});
    return;
  }

  const { session } = await auth.validateSession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid session token' });
    return;
  }
  next();
}

async function index(req: Request, res: Response) {
  res.json([
    {
      href: '/login',
      methods: ['POST']
    },
    {
      href: '/teams',
      methods: ['GET', 'POST']
    },
    {
      href: '/teams:slug',
      methods: ['GET', 'PATCH', 'DELETE']
    },
    {
      href: '/games',
      methods: ['GET', 'POST']
    },
    {
      href: '/games/:id',
      methods: ['GET', 'PATCH', 'DELETE']
    }
  ]);
}

async function login(req: Request, res: Response) {
    const { username = null, password = null } = req.body;

    if (username == null) {
        res.status(400).json({ error: 'Missing username' });
        return;
    }
    if (password == null) {
        res.status(400).json({ error: 'Missing password' });
        return;
    }

  const user = await get_user(username);

  if (user.isNone() || !await argon.verify(user.value.password, password)) {
    res.status(400).json({ error: 'Invalid username or password' });
    return;
  }

  const session = await auth.createSession(user.value.id, {});
  res.json({ token: session.id });
}

async function getTeams(req: Request, res: Response) {
    const teams = await get_teams();

    res.json(teams)
}

async function postTeams(req: Request, res: Response) {
    const { name = null, description = '' } = req.body;

    const errors = [];
    if (name === null)
        errors.push({ field: 'name', message: 'Missing team name' })
    else if (name.length < 3)
        errors.push({ field: 'name', message: 'Team name must be >= 3 characters long' });

    if (description.length > 1024)
        errors.push({ field: 'description', message: 'Description exceeds max length of 1024 characters' });

    if (errors.length > 0) {
        res.status(400).json(errors);
        return;
    }

    const team = await create_team(name, description);

    if (team.isErr()) {
        res.status(500).json({ error: team.error })
        return;
    }

    res.json(team.value);
}

async function getTeam(req: Request, res: Response) {
    const { slug } = req.params;
    const team = await get_team(slug);

    if (!await get_team(slug)) {
        res.status(404).json({ error: `Lið ${slug} er ekki til` });
        return;
    }

    res.json(team);
}

async function patchTeam(req: Request, res: Response) {
    const { slug } = req.params;

    const team = await get_team(slug);
    if (team.isNone()) {
        res.status(404).json({ error: `Lið ${slug} er ekki til` });
        return;
    }

    team.value.slug = req.body.name ? make_slug(req.body.name) : team.value.slug;
    team.value.name = req.body.name ?? team.value.name;
    team.value.description = req.body.description ?? team.value.description;

    const errors = [];
    if (team.value.name.length < 3)
        errors.push({ field: 'name', message: 'Team name must be >= 3 characters long' });

    if (team.value.description.length > 1024)
        errors.push({ field: 'description', message: 'Description exceeds max length of 1024 characters' });

    if (errors.length > 0) {
        res.status(400).json(errors);
        return;
    }

    const new_team = update_team(slug, team.value);

    if (!new_team) {
        res.status(500).json({ error: 'Error updating team' });
        return;
    }

    res.json(new_team);
}

async function deleteTeam(req: Request, res: Response) {
    const { slug } = req.params;

    if (!await get_team(slug))
        res.status(404).json({ error: `Lið ${slug} er ekki til` });

    try {
        await delete_team(slug);
        res.status(204).send();
    } catch (e) {
        res.status(500).send({ error: 'Villa kom upp' });
    }
}

async function getGames(req: Request, res: Response) {
    const games = await get_games();

    res.send(games);
}

function validate_date(date: Date): Result<Date, string> {
    const min_date = new Date();
    min_date.setMonth(min_date.getMonth() - 2);
    const today = new Date();
    if (date < min_date || date > today)
        return Err('Ógild dagsetning');

    return Ok(date);
}

function validate_score(score: number): Result<number, string> {
    if (score < 0)
        return Err('Markatala getur ekki verið neikvæð');

    return Ok(score);
}

async function validate_team(slug: Slug): Promise<Result<number, string>> {
    const id = await get_team_id(slug);
    if (id.isNone())
        return Err('Lið er ekki til');
    return Ok(id.value);
}

async function validate_game(
    date: string,
    home: string,
    home_score: string,
    away: string,
    away_score: string
): Promise<Result<ProtoGame, Array<InvalidField>>> {
    const invalid: Array<InvalidField> = [];
    const parsed_date = validate_date(new Date(date));
    if (parsed_date.isErr())
        invalid.push({ field: 'date', message: parsed_date.error });

    const parsed_home_score = validate_score(parseInt(home_score, 10))
    if (parsed_home_score.isErr())
        invalid.push({ field: 'home_score', message: parsed_home_score.error });


    const parsed_away_score = validate_score(parseInt(away_score, 10));
    if (parsed_away_score.isErr())
        invalid.push({ field: 'away_score', message: parsed_away_score.error });

    if (home === away)
        invalid.push({ field: 'home, away', message: 'Heimalið og útilið geta ekki verið sama liðið' });

    const home_id = await validate_team(home);
    if (home_id.isErr())
        invalid.push({ field: 'home', message: home_id.error });

    const away_id = await validate_team(away);
    if (away_id.isErr())
        invalid.push({ field: 'away', message: away_id.error });

    const res = Result.all(parsed_date, home_id, away_id, parsed_home_score, parsed_away_score);
    if (res.isErr())
        return Err(invalid);

    return Ok({
        date: res.value[0],
        home: res.value[1],
        home_score: res.value[3],
        away: res.value[2],
        away_score: res.value[4]
    });
}

async function postGames(req: Request, res: Response) {
    const validated = await validate_game(req.body.date, req.body.home, req.body.home_score, req.body.away, req.body.away_score);
    if (validated.isErr()) {
        res.status(500).json({ error: validated.error });
        return;
    }
    const {
        date,
        home,
        home_score,
        away,
        away_score
    } = validated.value;

    const game = await create_game(date, home, home_score, away, away_score);
    if (!game)
        res.status(500).json({ error: 'Villa kom upp' });
    res.json(game);
}

async function getGame(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);

    const game = await get_game(id);

    if (game.isNone()) {
        res.status(404).json({ error: `Leikur ${id} er ekki til` });
        return;
    }
    res.json(game);
}

async function patchGame(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);

    const game = await get_game(id);
    if (game.isNone()) {
        res.status(404).json({ error: `Leikur ${id} er ekki til` });
        return;
    }


    const date = req.body.date ? Some(validate_date(req.body.date)) : None;
    const home = req.body.home ? Some(await validate_team(req.body.home)) : None;
    const away = req.body.away ? Some(await validate_team(req.body.away)) : None;
    const home_score = req.body.home_score ? Some(validate_score(req.body.home_score)) : None;
    const away_score = req.body.away_score ? Some(validate_score(req.body.away_score)) : None;

    const errors: Array<InvalidField> = [];
    if (date.isSome() && date.value.isErr())
        errors.push({ field: 'date', message: date.value.error });

    if (home.isSome() && home.value.isErr())
        errors.push({ field: 'home', message: home.value.error });

    if (away.isSome() && away.value.isErr())
        errors.push({ field: 'away', message: away.value.error });

    if (home_score.isSome() && home_score.value.isErr())
        errors.push({ field: 'home_score', message: home_score.value.error });

    if (away_score.isSome() && away_score.value.isErr())
        errors.push({ field: 'away_score', message: away_score.value.error });

    if (errors.length > 0) {
        res.status(400).json(errors);
    }
}

async function deleteGame(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);

    if (!await get_game(id)) {
        res.status(404).json({ error: `Leikur ${id} er ekki til` });
        return;
    }

    await delete_game(id);

    res.status(204).send();
}

router.get('/', index);
router.post('/login', login);

router.get('/teams', getTeams);
router.post('/teams', ensureAuthenticated, postTeams);
router.get('/teams/:slug', getTeam);
router.patch('/teams/:slug', ensureAuthenticated, patchTeam)
router.delete('/teams/:slug', ensureAuthenticated, deleteTeam);

router.get('/games', getGames);
router.post('/games', ensureAuthenticated, postGames);
router.get('/games/:id(\\d+)', getGame);
router.patch('/games/:id(\\d+)', ensureAuthenticated, patchGame);
router.delete('/games/:id(\\d+)', ensureAuthenticated, deleteGame);
