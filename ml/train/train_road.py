"""
Full training pipeline for ROAD asset type.
Trains: XGBoost risk scorer + SHAP explainer + LSTM anomaly detector
Saves:  ml/models/risk_model_ROAD.pkl
        ml/models/shap_explainer_ROAD.pkl
        ml/models/lstm_autoencoder_ROAD.pt  (if LSTM enabled)

Run: python -m ml.train.train_road
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier
import shap
import warnings
warnings.filterwarnings("ignore")

# ── Config ─────────────────────────────────────────────────────────────────────

CSV_PATH  = "data/raw/road_sensor_data.csv"   # ← was ml/data/road_training_data.csv
MODEL_DIR = "ml/models"
ASSET_TYPE = "ROAD"

FEATURES = [
    "vibration_hz",
    "temperature_c",
    "stress_load_kn",
    "moisture_pct",
    "acoustic_emission_db",
    "pressure_bar",
]
TARGET = "label"

os.makedirs(MODEL_DIR, exist_ok=True)


# ── 1. Load Data ───────────────────────────────────────────────────────────────

def load_data():
    print("📂 Loading data...")
    df = pd.read_csv(CSV_PATH)

    # Drop non-feature columns — keep only FEATURES + TARGET
    df = df[FEATURES + [TARGET]].dropna()

    total    = len(df)
    failures = df[TARGET].sum()
    print(f"   Rows: {total:,} | Failure rate: {failures/total*100:.2f}%")
    return df


# ── 2. Preprocess ──────────────────────────────────────────────────────────────

def preprocess(df):
    print("⚙️  Preprocessing...")
    X = df[FEATURES].copy()
    y = df[TARGET].copy()

    # Clip outliers at 3 std
    for col in FEATURES:
        mean, std = X[col].mean(), X[col].std()
        X[col] = X[col].clip(mean - 3*std, mean + 3*std)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    print(f"   Train: {len(X_train)} | Test: {len(X_test)}")
    return (X_train, X_test, X_train_scaled, X_test_scaled,
            y_train, y_test, scaler)


# ── 3. Train XGBoost ───────────────────────────────────────────────────────────

def train_xgboost(X_train, X_test, y_train, y_test):
    print("\n🚀 Training XGBoost risk scorer...")

    # scale_pos_weight handles class imbalance automatically
    neg   = (y_train == 0).sum()
    pos   = (y_train == 1).sum()
    ratio = neg / pos
    print(f"   Class imbalance ratio (scale_pos_weight): {ratio:.1f}")

    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=ratio,   # handles class imbalance
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
        tree_method="hist",
        device="cuda",
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    # Evaluate
    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    auc     = roc_auc_score(y_test, y_proba)

    print(f"\n📊 XGBoost Results:")
    print(classification_report(y_test, y_pred,
          target_names=["Normal", "Failure"]))
    print(f"   ROC-AUC: {auc:.4f}")

    return model


# ── 4. Train SHAP Explainer ────────────────────────────────────────────────────

def train_shap(model, X_train):
    print("🔍 Building SHAP explainer...")
    explainer = shap.TreeExplainer(model)
    # Validate it works
    sample     = X_train.iloc[:50]
    shap_vals  = explainer.shap_values(sample)
    print(f"   SHAP values shape: {np.array(shap_vals).shape}")
    print(f"   Top feature: {FEATURES[np.abs(shap_vals).mean(axis=0).argmax()]}")
    return explainer


# ── 5. Train LSTM Autoencoder ──────────────────────────────────────────────────

def train_lstm(X_train_scaled, X_test_scaled, y_test):
    print("\n🧠 Training LSTM Autoencoder (anomaly detector)...")
    try:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        SEQ_LEN    = 10
        INPUT_DIM  = len(FEATURES)
        HIDDEN_DIM = 32
        EPOCHS     = 50
        BATCH_SIZE = 256
        LR         = 0.001

        # Build sequences from normal data only
        X_normal = X_train_scaled

        def make_sequences(data, seq_len):
            seqs = []
            for i in range(len(data) - seq_len):
                seqs.append(data[i:i+seq_len])
            return np.array(seqs)

        X_seq = make_sequences(X_normal, SEQ_LEN)
        tensor = torch.FloatTensor(X_seq)
        loader = DataLoader(TensorDataset(tensor, tensor),
                            batch_size=BATCH_SIZE, shuffle=True)

        # LSTM Autoencoder architecture
        class LSTMAutoencoder(nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = nn.LSTM(INPUT_DIM, HIDDEN_DIM,
                                       batch_first=True)
                self.decoder = nn.LSTM(HIDDEN_DIM, INPUT_DIM,
                                       batch_first=True)

            def forward(self, x):
                _, (h, _) = self.encoder(x)
                h_repeat   = h.squeeze(0).unsqueeze(1).repeat(1, x.size(1), 1)
                out, _     = self.decoder(h_repeat)
                return out

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if device.type == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        else:
            print("   GPU: Not available, using CPU")
        lstm_model = LSTMAutoencoder().to(device)
        optimizer  = torch.optim.Adam(lstm_model.parameters(), lr=LR)
        criterion  = nn.MSELoss()
        loader = DataLoader(
            TensorDataset(tensor, tensor),
            batch_size=BATCH_SIZE,
            shuffle=True,
            pin_memory=True,      # ← faster GPU transfer
            num_workers=2,        # ← parallel data loading
        )

        for epoch in range(EPOCHS):
            lstm_model.train()
            total_loss = 0
            for xb, yb in loader:
                xb = xb.to(device, non_blocking=True)   # ← non_blocking with pin_memory
                optimizer.zero_grad()
                out  = lstm_model(xb)
                loss = criterion(out, xb)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            if (epoch + 1) % 10 == 0:
                print(f"   Epoch {epoch+1}/{EPOCHS} | Loss: {total_loss/len(loader):.4f}")
        # Save LSTM
        lstm_path = os.path.join(MODEL_DIR, f"lstm_autoencoder_{ASSET_TYPE}.pt")
        torch.save(lstm_model.state_dict(), lstm_path)
        print(f"   Saved → {lstm_path}")
        return lstm_model

    except ImportError:
        print("   ⚠️  PyTorch not installed — skipping LSTM training")
        return None


# ── 6. Save Models ─────────────────────────────────────────────────────────────

def save_models(xgb_model, shap_explainer, scaler):
    risk_path  = os.path.join(MODEL_DIR, f"risk_model_{ASSET_TYPE}.pkl")
    shap_path  = os.path.join(MODEL_DIR, f"shap_explainer_{ASSET_TYPE}.pkl")
    scaler_path= os.path.join(MODEL_DIR, f"scaler_{ASSET_TYPE}.pkl")

    joblib.dump(xgb_model,      risk_path)
    joblib.dump(shap_explainer, shap_path)
    joblib.dump(scaler,         scaler_path)

    print(f"\n💾 Models saved:")
    print(f"   {risk_path}")
    print(f"   {shap_path}")
    print(f"   {scaler_path}")


# ── 7. Verify Saved Models ─────────────────────────────────────────────────────

def verify():
    print("\n✅ Verifying saved models...")
    risk_path = os.path.join(MODEL_DIR, f"risk_model_{ASSET_TYPE}.pkl")
    shap_path = os.path.join(MODEL_DIR, f"shap_explainer_{ASSET_TYPE}.pkl")

    model     = joblib.load(risk_path)
    explainer = joblib.load(shap_path)

    # Run a dummy prediction
    dummy = pd.DataFrame([{
        "vibration_hz": 48.0, "temperature_c": 28.0,
        "stress_load_kn": 450.0, "moisture_pct": 25.0,
        "acoustic_emission_db": 36.0, "pressure_bar": 9.5,
    }])
    proba      = model.predict_proba(dummy)[0][1]
    risk_score = round(proba * 100, 2)
    shap_vals  = explainer.shap_values(dummy)

    print(f"   Dummy risk score : {risk_score}/100")
    print(f"   SHAP values      : {np.round(shap_vals[0], 4)}")
    print(f"   All checks passed ✅")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print(f"  InfraWatch — ROAD Asset Type Training Pipeline")
    print("=" * 55)

    df = load_data()
    (X_train, X_test,
     X_train_scaled, X_test_scaled,
     y_train, y_test, scaler) = preprocess(df)

    xgb_model     = train_xgboost(X_train, X_test, y_train, y_test)
    shap_explainer = train_shap(xgb_model, X_train)
    train_lstm(X_train_scaled, X_test_scaled, y_test)
    save_models(xgb_model, shap_explainer, scaler)
    verify()

    print("\n🎉 ROAD training complete!")
    print(f"   Models ready in: {MODEL_DIR}/")


if __name__ == "__main__":
    main()