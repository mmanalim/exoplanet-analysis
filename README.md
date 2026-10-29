# Statistical and Machine Learning Analysis of Exoplanet Properties

An end-to-end astrophysical and machine learning investigation of **6,445 confirmed exoplanets** cataloged in the NASA Exoplanet Archive (`pscomppars` composite table).

---

## 🌟 Project Overview

This repository provides a comprehensive computational pipeline and empirical analysis spanning the physical demographics of extrasolar planets, observational selection effects, historical discovery trends, supervised predictive modeling of planetary mass, and unsupervised demographic clustering.

### 📚 Structure & Notebooks

| Notebook / Report | Focus Areas | Key Output Artifacts |
| :--- | :--- | :--- |
| **[`data_collection.ipynb`](data_collection.ipynb)** | NASA TAP API automated query | [`exoplanet_data.csv`](exoplanet_data.csv) (703 raw columns) |
| **[`01_data_preparation.ipynb`](01_data_preparation.ipynb)** | Feature selection, Keplerian derivations, missing value handling, mass provenance, and taxonomic classification | [`cleaned_exoplanet_data.csv`](cleaned_exoplanet_data.csv) (25 curated features)<br>[`figures/01_data_preparation_overview.png`](figures/01_data_preparation_overview.png) |
| **[`02_exploratory_and_detection_analysis.ipynb`](02_exploratory_and_detection_analysis.ipynb)** | **EDA, Detection Biases, Discovery Trends & Missing Data**<br>• Fulton Radius Valley (~1.5–2.0 $R_\oplus$)<br>• Period-Radius demographics & Neptune Desert<br>• Giant planet-metallicity correlation<br>• Transit vs. Radial Velocity KS/MWU hypothesis tests<br>• Space telescope eras (*Kepler*, *TESS*, *Gaia*)<br>• Systematic MNAR missingness analysis | [`figures/02_eda_physical_properties.png`](figures/02_eda_physical_properties.png)<br>[`figures/02_eda_orbital_properties.png`](figures/02_eda_orbital_properties.png)<br>[`figures/02_eda_host_star_relations.png`](figures/02_eda_host_star_relations.png)<br>[`figures/03_detection_method_comparison.png`](figures/03_detection_method_comparison.png)<br>[`figures/04_discovery_trends.png`](figures/04_discovery_trends.png)<br>[`figures/05_missing_data_analysis.png`](figures/05_missing_data_analysis.png) |
| **[`03_machine_learning_analysis.ipynb`](03_machine_learning_analysis.ipynb)** | **Machine Learning: Prediction & Clustering**<br>• Multi-model regression benchmark for planet mass $\log_{10}(M_p)$ (Ridge, Lasso, $k$-NN, SVR, Random Forest, HistGradientBoosting)<br>• Permutation feature importance & residual analysis<br>• Unsupervised $K$-Means & Gaussian Mixture Models ($k=4$)<br>• Physical demographic cluster recovery | [`figures/06_ml_model_comparison.png`](figures/06_ml_model_comparison.png)<br>[`figures/06_ml_feature_importance.png`](figures/06_ml_feature_importance.png)<br>[`figures/07_clustering_elbow_and_silhouette.png`](figures/07_clustering_elbow_and_silhouette.png)<br>[`figures/07_clustering_demographics.png`](figures/07_clustering_demographics.png) |
| **[`FINAL_REPORT.md`](FINAL_REPORT.md)** | **Final Synthesis & Astrophysical Evaluation**<br>• Executive summary and core astrophysical patterns<br>• Observational bias modeling and selection functions<br>• ML benchmark evaluation and cluster demographics<br>• Limitations, observational horizons, and upcoming missions | Comprehensive synthesis report |

---

## 🔬 Key Scientific & Machine Learning Findings

### 1. Physical Demographics & The Fulton Valley
* **The Fulton Gap (Radius Valley)**: Small planet radii exhibit a sharp bimodal distribution with a demographic valley between **$1.5$ and $2.0\,R_\oplus$**, cleanly separating stripped rocky **Super-Earths** from volatile-rich **Sub-Neptunes**. This confirms atmospheric mass loss driven by stellar photoevaporation and core-powered mass loss.
* **The Neptune Desert**: A notable absence of intermediate-mass planets at ultra-short periods ($P < 3-5$ days), reflecting hydrodynamic envelope stripping and high-eccentricity tidal migration.
* **Core Accretion Verification**: Host stars harboring giant planets ($M_p > 100\,M_\oplus$) exhibit significantly elevated metallicity ($[Fe/H]_{\text{median}} = +0.07$ dex) compared to terrestrial hosts ($-0.01$ dex), validating core accretion theory.

### 2. Detection Selection Biases
* **Transit vs. Radial Velocity**: Kolmogorov-Smirnov and Mann-Whitney U tests ($p < 10^{-100}$) confirm that Transit and RV samples represent distinct observational windows rather than the true galactic population.
  * *Transit*: Strongly biased toward short orbital periods ($P \sim 8.4$ days) and small host stars due to geometric transit probability ($P_{\text{tr}} \propto 1/a$).
  * *Radial Velocity*: Biased toward massive planets ($M_p \sim 257\,M_\oplus$) at wider separations ($P \sim 111$ days) due to Doppler velocity semi-amplitude scaling ($K \propto M_p \sin i / \sqrt{a}$).

### 3. Machine Learning Mass Prediction Benchmark
Trained strictly on **2,796 empirical dynamical mass measurements** (preventing circular data leakage from theoretical M-R relations):

| Model | 5-Fold CV $R^2$ | Test Set $R^2$ | Test RMSE ($\log_{10}$ dex) | Test MAE ($\log_{10}$ dex) | Test MedAE ($\log_{10}$ dex) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **HistGradientBoosting** | **$0.856$** | **$0.880$** | **$0.350$** | **$0.223$** | **$0.126$** |
| **Random Forest** | **$0.858$** | **$0.871$** | **$0.363$** | **$0.218$** | **$0.106$** |
| **SVR (RBF Kernel)** | $0.811$ | $0.847$ | $0.395$ | $0.279$ | $0.192$ |
| **$k$-Nearest Neighbors** | $0.787$ | $0.801$ | $0.451$ | $0.323$ | $0.232$ |
| **Ridge Regression** | $0.760$ | $0.795$ | $0.458$ | $0.349$ | $0.288$ |
| **Lasso Regression** | $0.759$ | $0.793$ | $0.460$ | $0.353$ | $0.293$ |

* The Random Forest regressor achieves a **Median Absolute Error of $0.106$ dex** (corresponding to predicting mass within **$\sim 27\%$ relative median error**).
* **Feature Importance**: Planet radius accounts for $>72\%$ of variance, with secondary contributions from stellar insolation and orbital separation.

### 4. Unsupervised Clustering & Demographic Analysis
Unsupervised $K$-Means and GMM clustering was systematically evaluated across two distinct regimes:
* **Measured-Mass Subsample ($N=2,904$)**: Silhouette analysis identifies $k=3$ as optimal ($s=0.497$), cleanly resolving **Sub-Neptunes / Neptunes** ($N=1,168$), **Distant Cold Gas Giants** ($N=742$), and **Irradiated Hot Jupiters** ($N=994$). *Note: small rocky planets lack sufficient dynamical mass measurements in the archive to emerge as an isolated cluster.*
* **Full Photometric Catalog ($N=5,756$)**: Clustering on 3 complete parameters ($R_p, P, S$) identifies $k=2$ as optimal ($s=0.496$), capturing the overarching cosmic bifurcation into **Small Volatile Worlds** ($N=4,693$) and **Gas Giants** ($N=1,063$).

---

## 🛠️ Reproduction & Execution

### Prerequisites
Install the required scientific packages:
```bash
pip install numpy pandas scipy scikit-learn matplotlib seaborn statsmodels nbformat nbconvert ipykernel
```

### Running the Analysis
The notebooks are fully executed and reproducible:
1. **Data Collection**:
   ```bash
   jupyter notebook data_collection.ipynb
   ```
2. **Data Preparation & Cleaning**:
   ```bash
   jupyter notebook 01_data_preparation.ipynb
   ```
3. **Exploratory, Detection, Trends & Missing-Data Analysis**:
   ```bash
   jupyter notebook 02_exploratory_and_detection_analysis.ipynb
   ```
4. **Machine Learning Prediction & Clustering**:
   ```bash
   jupyter notebook 03_machine_learning_analysis.ipynb
   ```

---

## 📖 Citation & Data Attribution
Data provided by the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/), operated by the California Institute of Technology under contract with the National Aeronautics and Space Administration.
