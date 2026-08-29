# Closed-Loop Drift Compensation & Intelligent Autopilot

This document outlines the architecture, control equations, and safety integrations of the ASTRALIS Closed-Loop Drift Compensation & Intelligent Autopilot.

---

## 1. CONTROL ARCHITECTURE

The upgraded autopilot actively minimizes path errors (Cross-Track Error) and offsets lateral environment forces (wind and current shear) by crabbing:

```
Planned Route Segment ──┐
                        ├──> Autopilot Steering Controller (ship.js) ──> Rudder Command
Actual Vessel Position ──┘                 ▲
                                           │
Environmental Velocities ──────────────────┘
```

---

## 2. MATHEMATICAL FORMULATION

### A. Closed-Loop Cross-Track Control
The cross-track error ($e_{xt}$) is calculated as the perpendicular distance from the vessel's coordinate $(x_v, y_v)$ to the active route segment line connecting waypoint $\mathbf{p}_{n-1}$ to waypoint $\mathbf{p}_n$:
$$e_{xt} = (x_v - x_{n-1}) \cdot u_y - (y_v - y_{n-1}) \cdot u_x$$
where $(u_x, u_y)$ is the normalized direction vector of the segment.

The steering correction angle ($\theta_{xte}$) is modeled using a Stanley-like proportional arc-tangent response to prevent oversteer and saturate cleanly at high offsets:
$$\theta_{xte} = \text{atan}(e_{xt} \cdot K_g)$$
where $K_g$ is the cross-track proportional gain (set to $0.18$). The output correction is bounded to $[-45^\circ, 45^\circ]$.

### B. Environmental Drift Compensation (Crab Angle)
Given the total environmental velocity vector $\mathbf{v}_d = (d_x, d_y)$ from wind and current coupling:
1. The lateral drift velocity component ($v_{\text{lat}}$) perpendicular to the track is calculated:
   $$v_{\text{lat}} = d_x \cdot u_y - d_y \cdot u_x$$
2. The required crab angle ($\beta_c$) to counteract this lateral drift under current forward speed ($V_s$) is:
   $$\beta_c = \text{asin}\left(\frac{-v_{\text{lat}}}{V_s}\right)$$
We clamp $\beta_c$ to $[-30^\circ, 30^\circ]$ to ensure stable ground tracking.

### C. Combined Autopilot Steering Command
The target heading angle ($\theta_t$) for the vessel is determined by fusing the desired segment angle ($\theta_{\text{segment}}$), XTE correction ($\theta_{xte}$), and crab angle ($\beta_c$):
$$\theta_t = \theta_{\text{segment}} + \theta_{xte} + \beta_c$$

---

## 3. ADAPTIVE CONTROL STATES

The controller manages a finite state machine representing the steering intensity:
- `NORMAL_TRACKING`: Cross-track error $\le 1.5$ SU and low environmental resistance.
- `COMPENSATING_DRIFT`: Bounded crab angles active under moderate wind/current.
- `FIGHTING_CURRENT`: Triggered when XTE remains $> 15$ SU for multiple consecutive ticks while facing strong currents. Rudder correction is supplemented with propulsion throttle boosts (extra thrust multiplier dynamically scales up to $2.0x$).
- `ROUTE_RECOVERY`: Triggered if the vessel drifts $> 40$ SU off course. Focuses on maximum safety return angles.

---

## 4. SAFETY HIERARCHY

All low-level drift corrections run inside the autopilot loop and are subordinated to high-level overrides from the `AutonomousController`:
1. **EMERGENCY STOP** (Immediate engine throttle cut)
2. **CRITICAL REROUTE** (Path recalculation via A*)
3. **REAL-TIME SAFETY RESPONSE** (Hazard slowdowns and sea-ice velocity caps)
4. **MISSION PLAN** (Optimized strategy selection)
5. **NORMAL AUTOPILOT** (Closed-loop drift compensation active)
