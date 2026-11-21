"""
ExoLens web app — look up an exoplanet by name and see its data plus the project's ML mass prediction.

Run from the repository root:
    python webapp/app.py
then open http://127.0.0.1:5000

The server reads ../cleaned_exoplanet_data.csv, trains the same Random Forest used in
03_machine_learning_analysis.ipynb (StandardScaler + RandomForestRegressor(150 trees, depth 15)) on the
2,796 planets with a *measured* mass, and serves everything through a small JSON API.
"""
import difflib
import math
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "cleaned_exoplanet_data.csv"
STATIC_DIR = Path(__file__).resolve().parent / "static"

# --- same features / target as Notebook 03 ---------------------------------------------------------
FEATURES = ["log_pl_rade", "log_pl_orbper", "log_pl_orbsmax", "log_pl_insol",
            "log_st_teff", "log_st_mass", "st_met", "sy_pnum", "log_sy_dist"]
TARGET = "log_pl_bmasse"
FEATURE_LABELS = {
    "log_pl_rade":    ("Planet radius",        "R⊕",   lambda v: 10 ** v),
    "log_pl_orbper":  ("Orbital period",       "days", lambda v: 10 ** v),
    "log_pl_orbsmax": ("Orbital distance",     "AU",   lambda v: 10 ** v),
    "log_pl_insol":   ("Starlight received",   "S⊕",   lambda v: 10 ** v),
    "log_st_teff":    ("Star temperature",     "K",    lambda v: 10 ** v),
    "log_st_mass":    ("Star mass",            "M☉",   lambda v: 10 ** v),
    "st_met":         ("Star metallicity",     "dex",  lambda v: v),
    "sy_pnum":        ("Planets in system",    "",     lambda v: v),
    "log_sy_dist":    ("Distance from Earth",  "pc",   lambda v: 10 ** v),
}
TYPE_ORDER = ["Terrestrial", "Super-Earth", "Sub-Neptune", "Neptune-like", "Gas Giant", "Hot Jupiter", "Unknown"]
FEATURED = ["TRAPPIST-1 e", "55 Cnc e", "K2-18 b", "Kepler-22 b", "51 Peg b", "Proxima Cen b"]

# plain-language description of each planet kind (the width rules are the project's own classification)
KINDS = {
    "Terrestrial":  {"rule": "Narrower than 1.25 Earths",                       "about": "Small, rocky worlds about the size of Earth or smaller.",
                     "examples": ["TRAPPIST-1 e", "Proxima Cen b", "TRAPPIST-1 d"]},
    "Super-Earth":  {"rule": "1.25 to 2 Earths wide",                           "about": "Rocky or watery worlds somewhat bigger than Earth.",
                     "examples": ["55 Cnc e", "Kepler-452 b", "GJ 1214 b"]},
    "Sub-Neptune":  {"rule": "2 to 4 Earths wide",                              "about": "Smaller than Neptune, probably with a thick gas layer. The most common kind we have found.",
                     "examples": ["K2-18 b", "Kepler-22 b", "TOI-700 d"]},
    "Neptune-like": {"rule": "4 to 6 Earths wide",                              "about": "Ice-and-gas worlds close to Neptune in size.",
                     "examples": ["GJ 436 b", "HAT-P-11 b", "Kepler-413 b"]},
    "Gas Giant":    {"rule": "6+ Earths wide, year longer than 10 days",        "about": "Jupiter-sized worlds of mostly gas, orbiting at a comfortable distance.",
                     "examples": ["Kepler-16 b", "HD 80606 b", "14 Her b"]},
    "Hot Jupiter":  {"rule": "6+ Earths wide, year shorter than 10 days",       "about": "Giant planets orbiting so close to their star that they are scorching hot.",
                     "examples": ["51 Peg b", "HD 209458 b", "HD 189733 b"]},
}


def norm(text):
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def clean(v, digits=4):
    """JSON-safe scalar: NaN -> None, numpy -> python, floats rounded to significant digits."""
    if v is None:
        return None
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        if not math.isfinite(v):
            return None
        if v == 0:
            return 0.0
        return float(f"{v:.{digits}g}")
    return v


# ------------------------------------------------------------------------------------------------------
# Load data + train model (once, at start-up)
# ------------------------------------------------------------------------------------------------------
t0 = time.time()
if not DATA_PATH.exists():
    raise SystemExit(f"Could not find {DATA_PATH}. Run this app from the repository (it needs cleaned_exoplanet_data.csv).")
df = pd.read_csv(DATA_PATH)
df["_key"] = df["pl_name"].map(norm)
df["_hostkey"] = df["hostname"].map(norm)
df = df.reset_index(drop=True)

train_df = df[df["is_measured_mass"]].dropna(subset=[TARGET] + FEATURES)
X_train, y_train = train_df[FEATURES], train_df[TARGET]
medians = X_train.median()

def make_pipe():
    return Pipeline([("scaler", StandardScaler()),
                     ("model", RandomForestRegressor(n_estimators=150, max_depth=15, random_state=42, n_jobs=-1))])

model = make_pipe().fit(X_train, y_train)
# honest predictions for planets the model was trained on: out-of-fold (that planet's mass was hidden)
oof = cross_val_predict(make_pipe(), X_train, y_train, cv=KFold(5, shuffle=True, random_state=42))
oof_pred = pd.Series(oof, index=train_df.index)
resid = y_train.to_numpy() - oof
Q10, Q50, Q90 = np.quantile(resid, [0.10, 0.50, 0.90])
OOF_R2 = float(1 - np.sum(resid ** 2) / np.sum((y_train - y_train.mean()) ** 2))
MEDIAN_ABS_ERR = float(np.median(np.abs(resid)))

# nearest-neighbour index for "similar worlds" (planets with a known radius, other features median-filled)
nn_df = df.dropna(subset=["log_pl_rade"]).copy()
nn_X = nn_df[FEATURES].fillna(medians)
nn_scaler = StandardScaler().fit(nn_X)
nn_index = NearestNeighbors(n_neighbors=7).fit(nn_scaler.transform(nn_X))
nn_pos = {idx: i for i, idx in enumerate(nn_df.index)}

print(f"[ExoLens] {len(df):,} planets loaded | model trained on {len(train_df):,} measured masses | "
      f"out-of-fold R2 = {OOF_R2:.3f} | median error = x{10 ** MEDIAN_ABS_ERR:.2f} | {time.time() - t0:.1f}s")


# ------------------------------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------------------------------
def predict_for(idx):
    """Return the prediction block for the planet at dataframe index `idx`."""
    row = df.loc[idx]
    if pd.isna(row["log_pl_rade"]):
        return {"available": False,
                "reason": "No radius is on record for this planet, and radius is the model's most important input."}
    x = row[FEATURES].astype(float)
    imputed = [f for f in FEATURES if pd.isna(x[f])]
    x_filled = x.fillna(medians)
    in_training = idx in train_df.index
    if in_training:
        pred_log = float(oof_pred[idx])           # out-of-fold: this planet's own mass was not used
    else:
        pred_log = float(model.predict(x_filled.to_frame().T[FEATURES])[0])
    pred_log += 0.0
    lo, hi = pred_log + Q10, pred_log + Q90        # 80 % band from out-of-fold residuals
    out = {
        "available": True,
        "value": clean(10 ** pred_log), "low": clean(10 ** lo), "high": clean(10 ** hi),
        "log10": clean(pred_log), "in_training": bool(in_training),
        "imputed_count": len(imputed),
        "inputs": [{"label": FEATURE_LABELS[f][0], "unit": FEATURE_LABELS[f][1],
                    "value": clean(FEATURE_LABELS[f][2](float(x_filled[f])), 3), "imputed": f in imputed} for f in FEATURES],
    }
    kind = mass_kind(row)
    if kind in ("measured", "minimum") and not pd.isna(row["pl_bmasse"]):
        out["measured"] = clean(row["pl_bmasse"])
        out["error_pct"] = clean(100 * (10 ** pred_log - row["pl_bmasse"]) / row["pl_bmasse"], 3)
    return out


def mass_kind(row):
    if pd.isna(row["pl_bmasse"]):
        return None
    prov = str(row["pl_bmassprov"])
    if prov == "Mass":
        return "measured"
    if prov.startswith("Msin"):
        return "minimum"
    return "estimated"


def percentile(series, value):
    s = series.dropna()
    if pd.isna(value) or len(s) == 0:
        return None
    return clean(100 * float((s < value).mean()), 3)


def similar_for(idx, k=5):
    if idx not in nn_pos:
        return []
    x = df.loc[idx, FEATURES].astype(float).fillna(medians).to_frame().T
    dist, nbr = nn_index.kneighbors(nn_scaler.transform(x), n_neighbors=k + 1)
    res = []
    for j in nbr[0]:
        other = nn_df.index[j]
        if other == idx:
            continue
        r = df.loc[other]
        res.append({"name": r["pl_name"], "type": r["planet_type"], "radius": clean(r["pl_rade"], 3),
                    "mass": clean(r["pl_bmasse"], 3) if mass_kind(r) in ("measured", "minimum") else None,
                    "period": clean(r["pl_orbper"], 3)})
        if len(res) == k:
            break
    return res


def siblings_for(idx):
    """Other known planets around the same star."""
    host = df.loc[idx, "hostname"]
    sib = df[(df["hostname"] == host) & (df.index != idx)].sort_values("pl_orbper")
    return [{"name": r["pl_name"], "type": r["planet_type"], "radius": clean(r["pl_rade"], 3), "period": clean(r["pl_orbper"], 3)}
            for _, r in sib.head(12).iterrows()]


def planet_payload(idx):
    r = df.loc[idx]
    kind = mass_kind(r)
    return {
        "name": r["pl_name"], "host": r["hostname"], "method": r["discoverymethod"],
        "year": clean(r["disc_year"]), "facility": r["disc_facility"], "type": r["planet_type"],
        "physical": {
            "radius": clean(r["pl_rade"], 3), "mass": clean(r["pl_bmasse"], 3), "mass_kind": kind,
            "mass_source": r["pl_bmassprov"] if not pd.isna(r["pl_bmassprov"]) else None,
            "density": clean(r["pl_dens"], 3), "density_physical": bool(r["is_physical_density"]) if not pd.isna(r["pl_dens"]) else None,
            "temp": clean(r["pl_eqt"], 3), "insol": clean(r["pl_insol"], 3),
        },
        "orbit": {"period": clean(r["pl_orbper"], 4), "smax": clean(r["pl_orbsmax"], 3), "ecc": clean(r["pl_orbeccen"], 3)},
        "star": {"teff": clean(r["st_teff"], 4), "radius": clean(r["st_rad"], 3), "mass": clean(r["st_mass"], 3),
                 "met": clean(r["st_met"], 3), "dist": clean(r["sy_dist"], 4)},
        "system": {"stars": clean(r["sy_snum"]), "planets": clean(r["sy_pnum"])},
        "rank": {"radius": percentile(df["pl_rade"], r["pl_rade"]), "period": percentile(df["pl_orbper"], r["pl_orbper"]),
                 "mass": percentile(df.loc[df["is_measured_mass"], "pl_bmasse"], r["pl_bmasse"]) if kind in ("measured", "minimum") else None},
        "position": {"x": clean(r["log_pl_orbper"], 4), "y": clean(r["log_pl_rade"], 4)},
        "prediction": predict_for(idx),
        "similar": similar_for(idx),
        "siblings": siblings_for(idx),
        "light_years": clean(r["sy_dist"] * 3.2616, 4) if not pd.isna(r["sy_dist"]) else None,
    }


def find_exact(name):
    k = norm(name)
    hit = df.index[df["_key"] == k]
    return hit[0] if len(hit) else None


# ------------------------------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------------------------------
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/meta")
def api_meta():
    featured = [{"name": n, "type": df.loc[find_exact(n), "planet_type"]} for n in FEATURED if find_exact(n) is not None]
    return jsonify({
        "planets": int(len(df)), "trained_on": int(len(train_df)),
        "r2": clean(OOF_R2, 3), "typical_factor": clean(10 ** MEDIAN_ABS_ERR, 3),
        "band_low_factor": clean(10 ** Q10, 3), "band_high_factor": clean(10 ** Q90, 3),
        "featured": featured, "types": TYPE_ORDER,
    })


@app.get("/api/search")
def api_search():
    q = norm(request.args.get("q", ""))
    if not q:
        return jsonify([])
    starts = df[df["_key"].str.startswith(q) | df["_hostkey"].str.startswith(q)]
    starts = starts.assign(_len=starts["_key"].str.len()).sort_values(["_len", "_key"], kind="stable")   # shortest (closest) match first
    contains = df[(df["_key"].str.contains(q, regex=False) | df["_hostkey"].str.contains(q, regex=False)) & ~df.index.isin(starts.index)]
    hits = pd.concat([starts.drop(columns="_len"), contains]).head(8)
    return jsonify([{"name": r["pl_name"], "host": r["hostname"], "type": r["planet_type"]} for _, r in hits.iterrows()])


@app.get("/api/planet")
def api_planet():
    name = request.args.get("name", "")
    idx = find_exact(name)
    if idx is None:
        close = difflib.get_close_matches(name, df["pl_name"].tolist(), n=5, cutoff=0.5)
        return jsonify({"error": "not_found", "suggestions": close}), 404
    return jsonify(planet_payload(idx))


@app.get("/api/kinds")
def api_kinds():
    out = []
    for name, info in KINDS.items():
        sub = df[df["planet_type"] == name]
        example = next((e for e in info["examples"] if find_exact(e) is not None and df.loc[find_exact(e), "planet_type"] == name), None)
        if example is None and len(sub):
            example = sub.iloc[0]["pl_name"]
        out.append({"name": name, "count": int(len(sub)), "rule": info["rule"], "about": info["about"], "example": example})
    return jsonify(out)


@app.get("/api/explore")
def api_explore():
    kind = request.args.get("type", "")
    sort = request.args.get("sort", "name")
    offset = max(0, int(request.args.get("offset", 0) or 0))
    limit = min(60, max(1, int(request.args.get("limit", 24) or 24)))
    sub = df[df["planet_type"] == kind] if kind in KINDS else df
    if sort == "largest":
        sub = sub.sort_values(["pl_rade", "pl_name"], ascending=[False, True], na_position="last")
    elif sort == "smallest":
        sub = sub.sort_values(["pl_rade", "pl_name"], ascending=[True, True], na_position="last")
    elif sort == "newest":
        sub = sub.sort_values(["disc_year", "pl_name"], ascending=[False, True])
    else:
        sub = sub.sort_values("pl_name")
    page = sub.iloc[offset: offset + limit]
    items = [{"name": r["pl_name"], "host": r["hostname"], "type": r["planet_type"], "radius": clean(r["pl_rade"], 3),
              "mass": clean(r["pl_bmasse"], 3) if mass_kind(r) in ("measured", "minimum") else None,
              "period": clean(r["pl_orbper"], 3), "year": clean(r["disc_year"])} for _, r in page.iterrows()]
    return jsonify({"total": int(len(sub)), "offset": offset, "items": items})


@app.get("/api/random")
def api_random():
    idx = df.sample(1).index[0]
    return jsonify(planet_payload(idx))


@app.get("/api/universe")
def api_universe():
    """Every planet with a known period and radius, for the context plot."""
    u = df.dropna(subset=["log_pl_orbper", "log_pl_rade"])
    t_index = {t: i for i, t in enumerate(TYPE_ORDER)}
    return jsonify({
        "n": [str(v) for v in u["pl_name"]],
        "x": [round(float(v), 3) for v in u["log_pl_orbper"]],
        "y": [round(float(v), 3) for v in u["log_pl_rade"]],
        "t": [t_index.get(v, 6) for v in u["planet_type"]],
        "types": TYPE_ORDER,
    })


if __name__ == "__main__":
    print("[ExoLens] open http://127.0.0.1:5000  (press Ctrl+C to stop)")
    app.run(host="127.0.0.1", port=5000, debug=False)
