# Route Churn Analysis Summary

- **Total Route Replans Observed**: 29
- **Primary Cause**: `aiNavigator.js` un-cooldown'd replanning loop triggering every ~1.5s - 2.5s on minor iceberg shifts and `routeInvalid` flags.

## Replanning Event Breakdown

- **t=14.0ms**: `None` -> `route_1788282898309` | Class: `C. Correct user destination change` | dt=0ms
- **t=830.8ms**: `route_1788282898309` -> `route_1788282899799` | Class: `F. Incorrect risk jitter replan` | dt=817ms
- **t=4016.9ms**: `route_1788282899799` -> `route_1788282903255` | Class: `E. Incorrect tiny hazard-movement replan` | dt=3186ms
- **t=5885.0ms**: `route_1788282903255` -> `route_1788282904910` | Class: `F. Incorrect risk jitter replan` | dt=1868ms
- **t=6395.2ms**: `route_1788282904910` -> `route_1788282905665` | Class: `F. Incorrect risk jitter replan` | dt=510ms
- **t=8761.5ms**: `route_1788282905665` -> `route_1788282908101` | Class: `E. Incorrect tiny hazard-movement replan` | dt=2366ms
- **t=10577.3ms**: `route_1788282908101` -> `route_1788282909940` | Class: `F. Incorrect risk jitter replan` | dt=1816ms
- **t=19143.4ms**: `route_1788282909940` -> `route_1788282918329` | Class: `E. Incorrect tiny hazard-movement replan` | dt=8566ms
- **t=22575.5ms**: `route_1788282918329` -> `route_1788282921803` | Class: `E. Incorrect tiny hazard-movement replan` | dt=3432ms
- **t=27424.9ms**: `route_1788282921803` -> `route_1788282926705` | Class: `E. Incorrect tiny hazard-movement replan` | dt=4849ms
- **t=29759.6ms**: `route_1788282926705` -> `route_1788282929087` | Class: `E. Incorrect tiny hazard-movement replan` | dt=2335ms
- **t=33174.0ms**: `route_1788282929087` -> `route_1788282932317` | Class: `E. Incorrect tiny hazard-movement replan` | dt=3414ms
- **t=34460.5ms**: `route_1788282932317` -> `route_1788282933836` | Class: `F. Incorrect risk jitter replan` | dt=1286ms
- **t=43399.3ms**: `route_1788282933836` -> `route_1788282942472` | Class: `E. Incorrect tiny hazard-movement replan` | dt=8939ms
- **t=43732.8ms**: `route_1788282942472` -> `route_1788282943109` | Class: `F. Incorrect risk jitter replan` | dt=334ms
