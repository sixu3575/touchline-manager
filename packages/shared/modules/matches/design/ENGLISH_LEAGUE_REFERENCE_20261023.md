# England top-five league results reference

This is a match-results reference for the first five levels of the English men's league pyramid: Premier League, Championship, League One, League Two and National League. It is not a UK-wide sample: Scottish, Welsh and Northern Irish leagues, and English levels below the National League, are outside this dataset.

## Recent complete-season sample

The primary comparison uses the three most recent seasons present as complete regular-season results for all five divisions, 2022/23–2024/25. Play-offs are excluded. Means and unbiased sample variances are calculated across match results, with denominator `n−1`.

| English level   | Matches | Total goals per match: mean / variance / SD | Home goals per match | Away goals per match | Home win / draw / away win |
| --------------- | ------: | ------------------------------------------: | -------------------: | -------------------: | -------------------------: |
| Premier League  |   1,140 |                    3.0219 / 2.8854 / 1.6986 |               1.6491 |               1.3728 |   45.09% / 22.98% / 31.93% |
| Championship    |   1,656 |                    2.5211 / 2.4491 / 1.5650 |               1.4136 |               1.1075 |   43.84% / 26.21% / 29.95% |
| League One      |   1,656 |                    2.5773 / 2.5064 / 1.5832 |               1.4094 |               1.1679 |   43.06% / 24.58% / 32.37% |
| League Two      |   1,656 |                    2.6063 / 2.7947 / 1.6717 |               1.4287 |               1.1775 |   42.81% / 27.11% / 30.07% |
| National League |   1,656 |                    2.8086 / 2.8099 / 1.6763 |               1.5550 |               1.2536 |   42.87% / 26.57% / 30.56% |

The companion [JSON reference](ENGLISH_LEAGUE_REFERENCE_20261023.json) includes each season separately, a longer sample, match-goal histograms from 0 to 8+, and SHA-256 hashes for every source file.

## Wider comparison window

For a larger sample, the reference also pools 2015/16–2018/19 and 2022/23–2024/25. It contains seven complete seasons per division; the COVID-affected and incomplete common seasons are omitted.

| English level   | Matches | Total goals per match: mean / sample variance |
| --------------- | ------: | --------------------------------------------: |
| Premier League  |   2,660 |                               2.8665 / 2.8197 |
| Championship    |   3,864 |                               2.5453 / 2.4660 |
| League One      |   3,864 |                               2.5893 / 2.5206 |
| League Two      |   3,864 |                               2.6190 / 2.6879 |
| National League |   3,864 |                               2.6962 / 2.8049 |

2019/20 and 2020/21 are excluded because COVID interrupted the common five-division sample; the National League source contains only 506 of 552 regular matches in 2021/22. The 2025/26 files are excluded because the pinned source snapshot does not have complete results for every lower division. The machine-readable artifact records these exclusions.

## How the game uses the reference

The existing offline match calibration summary now compares its multi-match total-goal mean and sample variance with each division's recent reference. It prints the differences for context and labels them `descriptive-only`; it does not affect pass/review/block status. This keeps a small four-tactic/two-seed engineering sample from being mistaken for a season-sized population.

Use the reference to assess distributions across many games and to spot persistent drift. Do not make individual matches converge on the average, add score or shot quotas, or suppress a reasonable player decision to force a target. The current game league has no declared mapping to one of these five real tiers, so show all five comparisons until its intended level is set.

This source provides schedules and scores, not event or tracking data. It cannot support empirical comparisons for shots, xG, passes, possession, tackles, interceptions, saves, player ratings, running distance or pressure. Those values remain marked as unavailable unless a source with suitable coverage and reuse terms is added. [Football-Data's fair-use policy](https://football-data.co.uk/contact.php) explicitly excludes commercial and data-training projects from its free CSV terms, so that feed is not part of this public game's reference set. [TheStatsAPI](https://www.thestatsapi.com/) advertises a paid commercial plan and a broad competition catalogue, but exact coverage of the National League and the fields required for this game must be checked before using it; no trial or subscription has been started.

## Provenance and regeneration

The source is [OpenFootball England](https://github.com/openfootball/england), pinned to commit `9ee7a0c351805c99cc334478a9bf04b7d0432fec`. Its repository identifies the dataset as public domain and provides a [CC0-1.0 license](https://github.com/openfootball/england/blob/9ee7a0c351805c99cc334478a9bf04b7d0432fec/LICENSE.md). The benchmark is a community data snapshot, not an official league statistical release or endorsement.

Raw files are kept out of Git. Download the listed season/level `.txt` files from that exact commit into a local directory, then run:

```sh
node tests/tools/aggregate-english-league-reference.mjs <source-directory> packages/shared/modules/matches/design/ENGLISH_LEAGUE_REFERENCE_20261023.json
```

The script checks each season's expected number of regular fixtures before writing any aggregate. When the source commit or season window changes, update the JSON, this document and the read-only comparison together; never silently mix data revisions.
