# Combat Sports Events API

A web scraper and API that shows upcoming combat sports events from [tapology.com](https://www.tapology.com) - MMA, boxing, bare-knuckle, kickboxing/Muay Thai, and wrestling, from a curated whitelist of promotions (UFC, ONE Championship, PFL, RIZIN, Dana White's Contender Series, UFC BJJ, Zuffa Boxing, Matchroom Boxing, Top Rank, Most Valuable Promotions, Real American Freestyle, Bare Knuckle FC, and Karate Combat).

## Features

- Gets event names, dates, matchups, and locations for whitelisted promotions only
- Includes promotions Tapology doesn't tag "major" (e.g. boxing, bare-knuckle) by scraping their own event pages directly, not just the main listing
- Serves the data through a simple API, cached with health checks so a degraded scrape never overwrites good data
- Archives a dated snapshot of each day's scrape to your Documents folder

## Example Response

```json
[
  {
    "title": "UFC 334",
    "link": "https://www.tapology.com/fightcenter/events/147320-ufc-334",
    "organization": "UFC",
    "fullOrganization": "Ultimate Fighting Championship",
    "date": "Saturday 11.14.2026 at 05:00 PM ET",
    "venue": "Madison Square Garden",
    "location": "New York City, New York, United States",
    "fights": [
      {
        "fighterA": {
          "name": "Nazim Sadykhov",
          "record": "11-3-1",
          "link": "https://www.tapology.com/fightcenter/fighters/135516-nazim-sadykhov"
        },
        "fighterB": {
          "name": "Jefferson Nascimento",
          "record": "13-1",
          "link": "https://www.tapology.com/fightcenter/fighters/239183-jefferson-todynho"
        },
        "weightClass": "155 lbs"
      }
    ]
  }
]
```
