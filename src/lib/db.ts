import { User } from 'lucia';
import postgres, { Row } from 'postgres';
import { Option, Some, None, Result, Err, Ok } from 'ts-results-es';
import type { Game, GameId, Slug, Team, TeamId } from './types.js';
import { make_slug } from "./utils.js";

export const db = postgres({
    database: 'vfor-v3'
});

function make_team(row: Row): Team {
    return {
        slug: row.slug,
        name: row.name,
        description: row.description
    }
}

function make_game(row: Row): Game {
    return {
        id: row.id,
        date: row.date,
        home: make_team({
            slug: row.home_slug,
            name: row.home_name,
            description: row.home_description
        }),
        away: make_team({
            slug: row.away_slug,
            name: row.away_name,
            description: row.away_description
        }),
        home_score: row.home_score,
        away_score: row.away_score
    }
}

function make_user(row: Row): User {
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    name: row.name,
  }
}

export async function get_user(username: string): Promise<Option<User>> {
  const res = await db`
SELECT id, username, name, password
FROM users
WHERE username = ${username}`;

  if (res.length < 1)
    return None;

  return Some(make_user(res[0]));
}

export async function get_teams(): Promise<Array<Team>> {
    const teams = await db`SELECT slug, name, description FROM teams;`;

    return teams.map(make_team);
}

export async function get_team_id(slug: Slug): Promise<Option<TeamId>> {
    const res = await db`SELECT id FROM teams WHERE slug = ${slug}`;

    if (res.length < 1)
        return None;
    return res[0].id;
}

export async function get_team(slug: Slug): Promise<Option<Team>> {
    const res = await db`
SELECT
 slug,
 name,
 description
FROM teams
WHERE slug = ${slug}`;

    if (res.count < 1)
        return None;

  return Some(make_team(res[0]));
}

export async function create_team(name: string, description: string): Promise<Result<Team, string>> {
    const slug = make_slug(name);

    if (await get_team(slug))
        return Err('Team exists');

  const res = await db`
INSERT INTO teams(slug, name, description)
VALUES(${slug}, ${name}, ${description})
RETURNING slug, name, description`;

  if (res.length < 1)
    return Err('Error creating team');
  return Ok(make_team(res[0]));
}

export async function update_team(
    old_slug: Slug,
    team: Team
): Promise<Option<Team>> {

    const res = await db`
UPDATE teams
SET slug = ${team.slug}, name = ${team.name}, description = ${team.description}
WHERE slug = ${old_slug}
RETURNING slug, name, description`;

    if (res.length < 0)
        return Promise.reject('Error updating team');

  return Some(make_team(res[0]));
}

export async function delete_team(slug: Slug) {
    await db`
DELETE FROM teams
WHERE slug = ${slug}`;
}

export async function get_games(): Promise<Array<Game>> {
    const res = await db`
SELECT
    g.id AS id,
    date,
    h.slug AS home_slug,
    h.name AS home_name,
    h.description AS home_description,
    a.slug AS away_slug,
    a.name AS away_name,
    a.description AS away_description,
    home_score,
    away_score
FROM games g
INNER JOIN teams h ON h.id = home
INNER JOIN teams a ON a.id = away;`;

    return res.map(make_game);
}

export async function get_game(id: GameId): Promise<Option<Game>> {
    const res = await db`
SELECT
    g.id AS id,
    date,
    h.slug AS home_slug,
    h.name AS home_name,
    h.description AS home_description,
    a.slug AS away_slug,
    a.name AS away_name,
    a.description AS away_description,
    home_score,
    away_score
FROM games g
INNER JOIN teams h ON h.id = home
INNER JOIN teams a ON a.id = away
WHERE g.id = ${id};`;

    if (res.length < 1)
        return None;

  return Some(make_game(res[0]));
}

export async function create_game(
    date: Date,
    home: TeamId,
    home_score: number,
    away: TeamId,
    away_score: number
): Promise<Option<Game>> {
    const res = await db`
INSERT INTO games (date, home, home_score, away, away_score)
VALUES (${date}, ${home}, ${home_score}, ${away}, ${away_score})
RETURNING id`;

    if (res.length < 1)
        return Promise.reject('Error creating game');

    return get_game(res[0].id);
}

export async function delete_game(id: GameId) {
    await db`
DELETE FROM games
WHERE id = ${id}`;
}
