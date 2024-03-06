import { Slug } from "./types";

export function make_slug(name: string): Slug {
  return name.toLowerCase().replace(' ', '-');
}
