# MMA Events API

A basic web scraper and API that shows upcoming MMA events from [tapology.com](https://www.tapology.com).

## Features

- Gets event names, dates, matchups, and locations
- Serves the data through a simple API

## Example Response

```json
[
  {
    "title": "UFC 317: Topuria vs. Oliveira",
    "date": "Saturday, June 28, 6:00 PM ET",
    "link": "https://www.tapology.com/fightcenter/events/124086-ufc-317",
    "orgImage": "https://images.tapology.com/logo_squares/1/icon_bw/UFC-Ultimate-Fighting-Championship-logo-square.jpg?1721405585",
    "sport": "MMA",
    "location": "Las Vegas, NV",
    "region": "US West",
    "watch": "Pay Per View",
    "fights": [
      {
        "main": true,
        "weight": "155 lbs",
        "fighterA": {
          "name": "Ilia Topuria",
          "record": "16-0",
          "country": "https://www.tapology.com/assets/flags/GE-46e71ebd13f4e3f14b56f61538a1d026361bee9e3a68ed169cf30520d087c2fa.gif",
          "picture": "https://images.tapology.com/headshot_images/129278/preview/Topuria-Hero.jpg?1659102670",
          "link": "https://www.tapology.com/fightcenter/fighters/129278-ilia-topuria"
        },
        "fighterB": {
          "name": "Charles Oliveira",
          "record": "35-10",
          "country": "https://www.tapology.com/assets/flags/BR-45af1ab77cd750eff617a8b71f64b318c9a4ecf06c863a2c63cff71550930fe7.gif",
          "picture": "https://images.tapology.com/headshot_images/1613/preview/Charles_Oliveira.jpg?1583713648",
          "link": "https://www.tapology.com/fightcenter/fighters/charles-oliveira-do-bronx"
        }
      }
    ]
  }
]
```
