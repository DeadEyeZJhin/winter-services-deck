# Winter Services — presentation and live demo

**Live:** [deadeyezjhin.github.io/winter-services-deck](https://deadeyezjhin.github.io/winter-services-deck/) ·
**Demo:** [deadeyezjhin.github.io/winter-services-deck/demo](https://deadeyezjhin.github.io/winter-services-deck/demo/?as=office)

An 18-slide portfolio presentation of **Winter Services**, a booking page and job app for an
aircon service shop in Bacolod City, written for the people who run a business, not for
developers. Static page — no build step, no framework, no server required. It uses the same
deck engine as the [SukiRun deck](https://deadeyezjhin.github.io/sukirun-deck/).

**Short / Full** (top right, or `?short` / `?full` in the address): Short is the 10 slides to
say out loud in a room; Full adds the rest, for reading.

**The demo** is the real app with its server address removed and an invented month of
bookings and jobs — see *The demo* below.

## Contents

| Slide | Covers |
|---|---|
| 01 Cover | An aircon shop's bookings, off Messenger and into one app |
| 02 Before | Every booking was a conversation |
| 03 After | Each chat habit, and the screen that replaced it |
| 04 Three people, one app | Customer (web page), office and technician (Android), by role |
| 05 Book a job | The cart of aircons, prices, landmark and pin, open days, the reference code |
| 06 Track my booking | Code + number, or an account |
| 07 The Inbox | New bookings, Accept makes the customer and the job |
| 08 Quotation and receipt | The owner's own quotation, sent as a PDF; the receipt |
| 09 Jobs and the schedule | Today / tomorrow / no date, route, Not paid, closed days |
| 10 The technician | Every job with a day on it; call, map, on the way, done, undo |
| 11 Full status | The five bars and the who-and-when history, for every role |
| 12 Customers and check-ups | A customer's aircons, the regular check, the call list |
| 13 The three numbers | Bookings per week, ring-back time, done on the day promised |
| 14 The owner runs it | Prices, appliances, switches, users |
| 15 Customer data stays safe | A public key, three functions, no tables |
| 16 No signal | The queue, and what happens when two phones disagree |
| 17 How I work | Decide first; what I chose not to build; the numbers |
| 18 Thank you | Contact, and three ways into the demo |

## Controls

| Key | Action |
|---|---|
| `←` `→` `Space` `PgUp/PgDn` | Navigate slides |
| `Home` / `End` | First / last slide |
| `T` | Toggle light / dark theme (remembered) |
| `N` | Toggle speaker notes |
| `F` | Fullscreen presentation mode |
| `P` | Print — expands every slide into a PDF handout |

Touch: swipe left/right. Mouse: the dot rail on the right jumps to any slide.
Deep links work: `index.html#13` opens slide 13.

## The demo

`demo/` is generated, never edited by hand:

```
python make_demo.py            # reads D:\Winter Services\web
```

It copies the app's `web/` folder as it ships and changes five things: the server address and
key point at `https://demo.invalid`; the shop's phone number becomes `0900 000 0000`; the
service worker and the update check are switched off; `demo-src/fake-server.js` runs before
the app; and a **DEMO** button in the corner switches person and resets the data. It refuses
to write anything if the real server address survives in any file it copies.

`demo-src/fake-server.js` answers every call the app makes, inside the browser, from a small
database in `localStorage`: the same answers the real database functions give (`pull`,
`book_job`, `check_booking`, `full_status`, …), including who may see what. Four people share
the one browser as if they were four phones:

| `?as=` | Who | Sees |
|---|---|---|
| `guest` | a stranger | the public booking page and Track my booking |
| `office` | the shop's account | Inbox, Jobs, Customers, Check-ups, Users, Admin |
| `tech` | Jun, a technician | every job with a day on it |
| `cust` | Carmela, a customer | her own bookings, every step |

`window.wsDemoSwitch(who)` changes person without a reload (the portfolio's phone uses it),
the way the app itself follows a sign-in made in another tab.

What one person does reaches the others: book on the page, accept it in the office, mark it
done as the technician, and the customer's page shows Done. The invented month moves with the
calendar until someone changes something; **Reset the demo** puts it back.

## Screenshots

`assets/screens/` holds the 22 used by the deck, all taken from the demo — invented
customers, numbers, addresses and jobs — in a throwaway headless Chrome:

```
python -m http.server 8151     # in this folder
python shots.py                # needs: pip install websocket-client
```

Phone shots are 375 × 812 at 1.5× (562 px wide). Re-run after each app release, after
`make_demo.py`.

## Files

| | |
|---|---|
| `index.html` | the deck — edit this |
| `deck.css` | styles and theme tokens |
| `deck.js` | navigation, theme, notes, the snow |
| `assets/` | icons, the logo; `assets/screens/` holds the screenshots |
| `make_demo.py`, `demo-src/` | build `demo/` from the app |
| `shots.py` | take the screenshots from the demo |
| `build.py` | bundles the deck into the file below |
| `presentation.html` | **generated** — one self-contained file, opens offline, e-mail it anywhere |

## Build

```
python build.py
```

Inlines `deck.css`, `deck.js` and every referenced asset as base64 into
`presentation.html`. Each asset is embedded exactly once. Nothing is minified and nothing is
fetched at runtime except the Google Fonts stylesheet.

App icons by Flaticon.
