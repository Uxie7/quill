"""Generate the synthetic attendance table used to train/evaluate the dropout predictor."""
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
n = 600
calls = rng.integers(2, 25, n)
avg_gap = rng.normal(8, 3, n).clip(3, 25)
last_gap = (avg_gap + rng.normal(0, 5, n)).clip(1, 45)
missed = rng.poisson(0.6, n).clip(0, 6)
reply = rng.gamma(2.0, 6.0, n).clip(1, 96)
since = (last_gap * rng.uniform(0.5, 1.2, n)).clip(0, 50)
# The hidden rule. apps/api/src/tools/risk.ts uses the same coefficients as its offline fallback.
z = -1.2 + 0.5 * missed + 0.07 * (last_gap - avg_gap) + 0.015 * reply - 0.05 * calls + 0.02 * since
y = (rng.uniform(size=n) < 1 / (1 + np.exp(-z))).astype(int)
df = pd.DataFrame(dict(calls_so_far=calls, avg_gap_days=avg_gap, last_gap_days=last_gap, missed_count=missed,
                       avg_reply_hours=reply, days_since_last_call=since, dropped_30d=y)).round(1)
df.to_csv("data/attendance.csv", index=False)
print("rows", len(df), "dropout rate", round(df.dropped_30d.mean(), 2))
