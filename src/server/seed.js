import { getDB } from "./database.js";

export function seedReferenceData() {
  const db = getDB();

  const insertLeague = db.prepare(
    "INSERT OR IGNORE INTO leagues (name, sport_type) VALUES (?, ?)"
  );
  const insertMfg = db.prepare(
    "INSERT OR IGNORE INTO manufacturers (name, licensing_status) VALUES (?, ?)"
  );
  const insertTeam = db.prepare(
    `INSERT OR IGNORE INTO teams (name, league_id, city, abbreviation)
     SELECT ?, l.id, ?, ? FROM leagues l WHERE l.name = ?`
  );

  const seedAll = db.transaction(() => {
    // Leagues
    const leagues = [
      ["MLB", "baseball"],
      ["NFL", "football"],
      ["NBA", "basketball"],
      ["NHL", "hockey"],
      ["MLS", "soccer"],
      ["Premier League", "soccer"],
    ];
    for (const [name, sport] of leagues) insertLeague.run(name, sport);

    // Manufacturers
    const mfgs = [
      ["Topps", "licensed"],
      ["Panini", "licensed"],
      ["Upper Deck", "licensed"],
      ["Bowman", "licensed"],
      ["Leaf", "licensed"],
      ["Futera", "licensed"],
    ];
    for (const [name, status] of mfgs) insertMfg.run(name, status);

    // Teams — 5-6 per league
    const teams = [
      // MLB
      ["Yankees", "New York", "NYY", "MLB"],
      ["Dodgers", "Los Angeles", "LAD", "MLB"],
      ["Red Sox", "Boston", "BOS", "MLB"],
      ["Cubs", "Chicago", "CHC", "MLB"],
      ["Cardinals", "St. Louis", "STL", "MLB"],
      ["Giants", "San Francisco", "SF", "MLB"],
      // NFL
      ["Chiefs", "Kansas City", "KC", "NFL"],
      ["Eagles", "Philadelphia", "PHI", "NFL"],
      ["49ers", "San Francisco", "SF", "NFL"],
      ["Cowboys", "Dallas", "DAL", "NFL"],
      ["Bills", "Buffalo", "BUF", "NFL"],
      // NBA
      ["Lakers", "Los Angeles", "LAL", "NBA"],
      ["Celtics", "Boston", "BOS", "NBA"],
      ["Warriors", "Golden State", "GSW", "NBA"],
      ["Nuggets", "Denver", "DEN", "NBA"],
      ["Bucks", "Milwaukee", "MIL", "NBA"],
      // NHL
      ["Maple Leafs", "Toronto", "TOR", "NHL"],
      ["Canadiens", "Montreal", "MTL", "NHL"],
      ["Oilers", "Edmonton", "EDM", "NHL"],
      ["Rangers", "New York", "NYR", "NHL"],
      ["Bruins", "Boston", "BOS", "NHL"],
      // MLS
      ["LAFC", "Los Angeles", "LAFC", "MLS"],
      ["Inter Miami", "Miami", "MIA", "MLS"],
      ["Atlanta United", "Atlanta", "ATL", "MLS"],
      ["Seattle Sounders", "Seattle", "SEA", "MLS"],
      ["NYCFC", "New York", "NYC", "MLS"],
      // Premier League
      ["Arsenal", "London", "ARS", "Premier League"],
      ["Manchester City", "Manchester", "MCI", "Premier League"],
      ["Liverpool", "Liverpool", "LIV", "Premier League"],
      ["Chelsea", "London", "CHE", "Premier League"],
      ["Manchester United", "Manchester", "MUN", "Premier League"],
    ];
    for (const [name, city, abbr, league] of teams) {
      insertTeam.run(name, city, abbr, league);
    }
  });

  seedAll();
  console.log("Reference data seeded.");
}
