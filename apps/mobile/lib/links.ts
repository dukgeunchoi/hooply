import type { Href } from "expo-router";

// Every "navigate to a team/league page" call site needs the same three
// route params (id, name, logo) — centralized here so adding/renaming a
// param is a one-file change instead of a fan-out across every list/row
// component that links to these screens.
export function teamHref(team: { id: string; name: string; logo_url: string | null }): Href {
  return {
    pathname: "/team/[id]",
    params: { id: team.id, name: team.name, logo: team.logo_url ?? undefined },
  };
}

export function leagueHref(league: { id: string; name: string; logo_url: string | null }): Href {
  return {
    pathname: "/league/[id]",
    params: { id: league.id, name: league.name, logo: league.logo_url ?? undefined },
  };
}

export function playerHref(player: { id: string; full_name: string }): Href {
  return { pathname: "/player/[id]", params: { id: player.id, name: player.full_name } };
}
