export type Slug = string;
export type TeamId = number;
export type GameId = number;

export interface Team {
    slug: Slug;
    name: string;
    description: string;
}

export interface Game {
    id: GameId;
    date: Date;
    home: Team;
    away: Team;
    home_score: number;
    away_score: number;
}

export interface ProtoGame {
    date: Date;
    home: TeamId;
    away: TeamId;
    home_score: number;
    away_score: number;
}

export interface InvalidField {
    field: string;
    message: string;
}
