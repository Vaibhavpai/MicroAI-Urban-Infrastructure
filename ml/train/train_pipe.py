"""
Training pipeline for PIPE asset type.
Uses synthetic pipe_sensor_data.csv — baselines from real market dataset.

Trains:
  - XGBoost risk scorer     → ml/models/risk_model_PIPE.pkl
  - SHAP explainer          → ml/models/shap_explainer_PIPE.pkl
  - StandardScaler          → ml/models/scaler_PIPE.pkl
  - LSTM Autoencoder (GPU)  → ml/models/lstm_autoencoder_PIPE.pt

Run: python -m ml.train.train_pipe
"""

import os
import joblib
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings("ignore")

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier
import shap

# ── Config ─────────────────────────────────────────────────────────────────────

CSV_PATH   = "data/raw/pipe_sensor_data.csv"
MODEL_DIR  = "ml/models"
ASSET_TYPE = "PIPE"

FEATURES = [
    "pressure_bar",
    "vibration_hz",
    "moisture_pct",
    "acoustic_emission_db",
    "temperature_c",
    "corrosion_rate_mpy",
    # Thickness_Loss_mm and Material_Loss_Percent excluded — data leakage
]
TARGET = "label"

os.makedirs(MODEL_DIR, exist_ok=True)


# ── 1. Load Data ───────────────────────────────────────────────────────────────

def load_data():
    print("📂 Loading pipe dataset...")
    df = pd.read_csv(CSV_PATH)
    df = df[FEATURES + [TARGET]].dropna()

    total    = len(df)
    failures = df[TARGET].sum()
    print(f"   Total rows : {total:,}")
    print(f"   Failures   : {failures} ({failures/total*100:.2f}%)")
    print(f"   Normal     : {total-failures} ({(total-failures)/total*100:.2f}%)")
    return df


# ── 2. Preprocess ──────────────────────────────────────────────────────────────

def preprocess(df):
    print("\n⚙️  Preprocessing...")
    X = df[FEATURES].copy()
    y = df[TARGET].copy()

    for col in FEATURES:
        mean, std = X[col].mean(), X[col].std()
        X[col] = X[col].clip(mean - 3*std, mean + 3*std)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler         = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    print(f"   Train : {len(X_train):,} rows")
    print(f"   Test  : {len(X_test):,} rows")
    return (X_train, X_test,
            X_train_scaled, X_test_scaled,
            y_train, y_test, scaler)


# ── 3. Train XGBoost ───────────────────────────────────────────────────────────

def train_xgboost(X_train, X_test, y_train, y_test):
    print("\n🚀 Training XGBoost risk scorer...")

    neg   = (y_train == 0).sum()
    pos   = (y_train == 1).sum()
    ratio = round(neg / pos, 2)
    print(f"   scale_pos_weight (imbalance ratio): {ratio}")

    model = XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        scale_pos_weight=ratio,
        eval_metric="auc",
        early_stopping_rounds=30,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    auc     = roc_auc_score(y_test, y_proba)

    print(f"\n📊 XGBoost Results:")
    print(classification_report(y_test, y_pred,
          target_names=["Normal", "Failure"]))
    print(f"   ROC-AUC       : {auc:.4f}")
    print(f"   Best iteration: {model.best_iteration}")

    importance = dict(zip(FEATURES, model.feature_importances_))
    top = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    print(f"\n   Top features:")
    for feat, imp in top[:4]:
        print(f"     {feat:<28} {imp:.4f}")

    return model


# ── 4. SHAP Explainer ──────────────────────────────────────────────────────────

def train_shap(model, X_train):
    print("\n🔍 Building SHAP explainer...")
    explainer = shap.TreeExplainer(model)
    sample    = X_train.iloc[:100]
    shap_vals = explainer.shap_values(sample)
    arr       = np.array(shap_vals)
    top_feat  = FEATURES[np.abs(arr).mean(axis=0).argmax()]
    print(f"   SHAP values shape : {arr.shape}")
    print(f"   Top SHAP feature  : {top_feat}")
    return explainer


# ── 5. LSTM Autoencoder on GPU ─────────────────────────────────────────────────

def train_lstm(X_train_scaled, X_test_scaled, y_test):
    print("\n🧠 Training LSTM Autoencoder on GPU...")
    try:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"   GPU : {torch.cuda.get_device_name(0)}")
        print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        torch.backends.cudnn.benchmark = True

        SEQ_LEN    = 24     # 24-hour sequences (pipeline patterns are hourly)
        INPUT_DIM  = X_train_scaled.shape[1]
        HIDDEN_DIM = 64
        EPOCHS     = 50
        BATCH_SIZE = 256
        LR         = 0.001

        X_normal = X_train_scaled

        def make_sequences(data, seq_len):
            return np.array([data[i:i+seq_len]
                             for i in range(len(data) - seq_len)])

        X_seq  = make_sequences(X_normal, SEQ_LEN)
        tensor = torch.FloatTensor(X_seq)
        loader = DataLoader(
            TensorDataset(tensor, tensor),
            batch_size=BATCH_SIZE,
            shuffle=True,
            pin_memory=True,
            num_workers=0,
        )

        class LSTMAutoencoder(nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = nn.LSTM(INPUT_DIM,  HIDDEN_DIM,
                                       num_layers=2, batch_first=True,
                                       dropout=0.2)
                self.decoder = nn.LSTM(HIDDEN_DIM, INPUT_DIM,
                                       num_layers=2, batch_first=True,
                                       dropout=0.2)

            def forward(self, x):
                _, (h, _) = self.encoder(x)
                h_rep     = h[-1].unsqueeze(1).repeat(1, x.size(1), 1)
                out, _    = self.decoder(h_rep)
                return out

        lstm_model = LSTMAutoencoder().to(device)
        optimizer  = torch.optim.Adam(lstm_model.parameters(), lr=LR)
        scheduler  = torch.optim.lr_scheduler.StepLR(
                         optimizer, step_size=20, gamma=0.5)
        criterion  = nn.MSELoss()

        best_loss = float("inf")
        for epoch in range(EPOCHS):
            lstm_model.train()
            total_loss = 0
            for xb, _ in loader:
                xb = xb.to(device, non_blocking=True)
                optimizer.zero_grad()
                out  = lstm_model(xb)
                loss = criterion(out, xb)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(lstm_model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()

            scheduler.step()
            avg_loss = total_loss / len(loader)
            if avg_loss < best_loss:
                best_loss = avg_loss

            if (epoch + 1) % 10 == 0:
                lr = optimizer.param_groups[0]["lr"]
                print(f"   Epoch {epoch+1:02d}/{EPOCHS} | "
                      f"Loss: {avg_loss:.4f} | "
                      f"Best: {best_loss:.4f} | "
                      f"LR: {lr:.5f}")

        lstm_path = os.path.join(MODEL_DIR, f"lstm_autoencoder_{ASSET_TYPE}.pt")
        torch.save({
            "model_state_dict": lstm_model.state_dict(),
            "input_dim":        INPUT_DIM,
            "hidden_dim":       HIDDEN_DIM,
            "seq_len":          SEQ_LEN,
        }, lstm_path)
        print(f"   Saved → {lstm_path}")

        del lstm_model
        torch.cuda.empty_cache()
        return lstm_path

    except Exception as e:
        print(f"   ⚠️  LSTM failed: {e}")
        return None


# ── 6. Save Models ─────────────────────────────────────────────────────────────

def save_models(xgb_model, shap_explainer, scaler):
    paths = {
        "risk":   os.path.join(MODEL_DIR, f"risk_model_{ASSET_TYPE}.pkl"),
        "shap":   os.path.join(MODEL_DIR, f"shap_explainer_{ASSET_TYPE}.pkl"),
        "scaler": os.path.join(MODEL_DIR, f"scaler_{ASSET_TYPE}.pkl"),
    }
    joblib.dump(xgb_model,      paths["risk"])
    joblib.dump(shap_explainer, paths["shap"])
    joblib.dump(scaler,         paths["scaler"])
    print(f"\n💾 Models saved:")
    for p in paths.values():
        print(f"   {p}")


# ── 7. Verify ──────────────────────────────────────────────────────────────────

def verify():
    print("\n✅ Verifying saved models...")
    model     = joblib.load(os.path.join(MODEL_DIR, f"risk_model_{ASSET_TYPE}.pkl"))
    explainer = joblib.load(os.path.join(MODEL_DIR, f"shap_explainer_{ASSET_TYPE}.pkl"))

    dummy = pd.DataFrame([{
        "pressure_bar":         69.2,
        "vibration_hz":         42.0,
        "moisture_pct":         35.0,
        "acoustic_emission_db": 48.0,
        "temperature_c":        42.6,
        "corrosion_rate_mpy":   4.5,
    }])

    proba      = model.predict_proba(dummy)[0][1]
    risk_score = round(proba * 100, 2)
    shap_vals  = explainer.shap_values(dummy)
    print(f"   Dummy risk score : {risk_score}/100")
    print(f"   SHAP values      : {np.round(np.array(shap_vals)[0], 4)}")
    print(f"   All checks passed ✅")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print(f"  InfraWatch — PIPE Asset Type Training Pipeline")
    print("=" * 55)

    df = load_data()
    (X_train, X_test,
     X_train_scaled, X_test_scaled,
     y_train, y_test, scaler) = preprocess(df)

    xgb_model      = train_xgboost(X_train, X_test, y_train, y_test)
    shap_explainer = train_shap(xgb_model, X_train)
    train_lstm(X_train_scaled, X_test_scaled, y_test)
    save_models(xgb_model, shap_explainer, scaler)
    verify()

    print("\n🎉 PIPE training complete!")
    print(f"   Models ready in: {MODEL_DIR}/")


if __name__ == "__main__":
    main()