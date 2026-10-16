"""Small prediction service: POST /risk with six numbers, get a dropout probability.

TABPFN_BACKEND:
  api    hosted TabPFN API (needs a token from platform.priorlabs.ai; the example rows leave your machine)
  local  the local `tabpfn` package (nothing leaves your machine)
  logreg scikit-learn logistic regression baseline (no TabPFN)
Run from the repo root:  uvicorn services.tabpfn.app:app --port 8001
"""
import os
from pathlib import Path
import pandas as pd
from fastapi import FastAPI

FEATURES = ["calls_so_far", "avg_gap_days", "last_gap_days", "missed_count", "avg_reply_hours", "days_since_last_call"]
BACKEND = os.getenv("TABPFN_BACKEND", "api")
CSV = Path(__file__).resolve().parents[2] / "data" / "attendance.csv"

df = pd.read_csv(CSV)
X, y = df[FEATURES], df["dropped_30d"]

if BACKEND == "api":
    from tabpfn_client import TabPFNClassifier  # TODO(verify): token env var name and import path
elif BACKEND == "local":
    from tabpfn import TabPFNClassifier
else:
    from sklearn.linear_model import LogisticRegression as TabPFNClassifier

clf = TabPFNClassifier()
clf.fit(X, y)

app = FastAPI()


@app.get("/health")
def health():
    return {"backend": BACKEND, "trainRows": len(df)}


@app.post("/risk")
def risk(f: dict):
    row = pd.DataFrame([{k: float(f[k]) for k in FEATURES}])
    return {"risk": float(clf.predict_proba(row)[0][1]), "backend": BACKEND, "trainRows": len(df)}
